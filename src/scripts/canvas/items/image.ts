import { type ImageItem } from "../model";

const IMAGE_HANDLE_SAMPLE_RESOLUTION = 14;
const IMAGE_HANDLE_CORNER_PADDING = 2;
const IMAGE_HANDLE_CORNER_SIZE = 12;

type HandleContrastUpdater = () => void;

const imageHandleContrastUpdaters = new WeakMap<HTMLElement, HandleContrastUpdater>();

interface HandlePalette {
	lineColor: string;
	lineOpacity: string;
	underlayColor: string;
	underlayOpacity: string;
}

export function createImageItemElement(item: ImageItem): HTMLElement {
	const imageItem = document.createElement("div");
	imageItem.className = "image-item item";
	imageItem.style.width = `${item.width}px`;
	imageItem.style.height = `${item.height}px`;

	const image = document.createElement("img");
	image.src = item.src;
	image.alt = "";
	image.draggable = false;

	const resizeHandle = document.createElement("div");
	resizeHandle.className = "item-resize-handle subtle-resize-handle contextual-resize-handle";
	resizeHandle.setAttribute("aria-hidden", "true");

	imageItem.appendChild(image);
	imageItem.appendChild(resizeHandle);

	const updateHandleContrast = createImageHandleContrastUpdater(imageItem, image, resizeHandle);
	imageHandleContrastUpdaters.set(imageItem, updateHandleContrast);
	updateHandleContrast();

	return imageItem;
}

export function refreshImageResizeHandleContrast(imageItem: HTMLElement): void {
	const cachedUpdater = imageHandleContrastUpdaters.get(imageItem);
	if (cachedUpdater) {
		cachedUpdater();
		return;
	}

	const image = imageItem.querySelector("img");
	const resizeHandle = imageItem.querySelector(".subtle-resize-handle");
	if (!(image instanceof HTMLImageElement) || !(resizeHandle instanceof HTMLElement)) {
		return;
	}

	const updateHandleContrast = createImageHandleContrastUpdater(imageItem, image, resizeHandle);
	imageHandleContrastUpdaters.set(imageItem, updateHandleContrast);
	updateHandleContrast();
}

function createImageHandleContrastUpdater(
	imageItem: HTMLElement,
	image: HTMLImageElement,
	resizeHandle: HTMLElement,
): HandleContrastUpdater {
	let frameQueued = false;
	let samplingBlockedBySecurityError = false;

	const sampleCanvas = document.createElement("canvas");
	sampleCanvas.width = IMAGE_HANDLE_SAMPLE_RESOLUTION;
	sampleCanvas.height = IMAGE_HANDLE_SAMPLE_RESOLUTION;
	const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true });
	if (!sampleContext) {
		return () => undefined;
	}

	const refreshNow = (): void => {
		frameQueued = false;
		if (samplingBlockedBySecurityError || !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
			return;
		}

		try {
			const averageLuminance = getImageCornerLuminance(imageItem, image, sampleContext);
			if (averageLuminance === null) {
				return;
			}

			applyHandlePalette(resizeHandle, getPaletteForLuminance(averageLuminance));
		} catch (error) {
			if (error instanceof DOMException && error.name === "SecurityError") {
				samplingBlockedBySecurityError = true;
				clearAdaptiveHandlePalette(resizeHandle);
				return;
			}

			throw error;
		}
	};

	const queueRefresh = (): void => {
		if (frameQueued) {
			return;
		}

		frameQueued = true;
		requestAnimationFrame(refreshNow);
	};

	image.addEventListener("load", () => {
		samplingBlockedBySecurityError = false;
		queueRefresh();
	});

	image.addEventListener("error", () => {
		samplingBlockedBySecurityError = true;
		clearAdaptiveHandlePalette(resizeHandle);
	});

	if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
		queueRefresh();
	}

	return queueRefresh;
}

function getImageCornerLuminance(
	imageItem: HTMLElement,
	image: HTMLImageElement,
	context: CanvasRenderingContext2D,
): number | null {
	const targetWidth = Math.max(1, Math.round(imageItem.clientWidth));
	const targetHeight = Math.max(1, Math.round(imageItem.clientHeight));
	if (targetWidth <= 0 || targetHeight <= 0) {
		return null;
	}

	const sourceNaturalWidth = image.naturalWidth;
	const sourceNaturalHeight = image.naturalHeight;
	if (sourceNaturalWidth <= 0 || sourceNaturalHeight <= 0) {
		return null;
	}

	const coverScale = Math.max(
		targetWidth / sourceNaturalWidth,
		targetHeight / sourceNaturalHeight,
	);
	const visibleSourceWidth = targetWidth / coverScale;
	const visibleSourceHeight = targetHeight / coverScale;
	const sourceX = (sourceNaturalWidth - visibleSourceWidth) / 2;
	const sourceY = (sourceNaturalHeight - visibleSourceHeight) / 2;

	const cornerSize = Math.min(IMAGE_HANDLE_CORNER_SIZE, targetWidth, targetHeight);
	const cornerX = Math.max(0, targetWidth - cornerSize - IMAGE_HANDLE_CORNER_PADDING);
	const cornerY = Math.max(0, targetHeight - cornerSize - IMAGE_HANDLE_CORNER_PADDING);

	const sampleSourceX = sourceX + (cornerX / targetWidth) * visibleSourceWidth;
	const sampleSourceY = sourceY + (cornerY / targetHeight) * visibleSourceHeight;
	const sampleSourceWidth = Math.max((cornerSize / targetWidth) * visibleSourceWidth, 1);
	const sampleSourceHeight = Math.max((cornerSize / targetHeight) * visibleSourceHeight, 1);

	context.clearRect(0, 0, IMAGE_HANDLE_SAMPLE_RESOLUTION, IMAGE_HANDLE_SAMPLE_RESOLUTION);
	context.drawImage(
		image,
		sampleSourceX,
		sampleSourceY,
		sampleSourceWidth,
		sampleSourceHeight,
		0,
		0,
		IMAGE_HANDLE_SAMPLE_RESOLUTION,
		IMAGE_HANDLE_SAMPLE_RESOLUTION,
	);

	const imageData = context.getImageData(
		0,
		0,
		IMAGE_HANDLE_SAMPLE_RESOLUTION,
		IMAGE_HANDLE_SAMPLE_RESOLUTION,
	);
	const pixels = imageData.data;

	let weightedLuminanceSum = 0;
	let alphaWeightSum = 0;
	for (let index = 0; index < pixels.length; index += 4) {
		const alpha = pixels[index + 3] / 255;
		if (alpha <= 0) {
			continue;
		}

		const red = pixels[index] / 255;
		const green = pixels[index + 1] / 255;
		const blue = pixels[index + 2] / 255;
		const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
		weightedLuminanceSum += luminance * alpha;
		alphaWeightSum += alpha;
	}

	if (alphaWeightSum === 0) {
		return null;
	}

	return weightedLuminanceSum / alphaWeightSum;
}

function getPaletteForLuminance(luminance: number): HandlePalette {
	const whiteContrast = 1.05 / (luminance + 0.05);
	const blackContrast = (luminance + 0.05) / 0.05;
	const useLightLines = whiteContrast >= blackContrast;

	if (useLightLines) {
		return {
			lineColor: "rgba(246, 246, 246, 0.96)",
			lineOpacity: "0.56",
			underlayColor: "rgba(0, 0, 0, 0.62)",
			underlayOpacity: "0.44",
		};
	}

	return {
		lineColor: "rgba(20, 20, 20, 0.96)",
		lineOpacity: "0.52",
		underlayColor: "rgba(255, 255, 255, 0.74)",
		underlayOpacity: "0.36",
	};
}

function applyHandlePalette(handle: HTMLElement, palette: HandlePalette): void {
	handle.style.setProperty("--subtle-handle-line-color", palette.lineColor);
	handle.style.setProperty("--subtle-handle-line-opacity", palette.lineOpacity);
	handle.style.setProperty("--subtle-handle-underlay-color", palette.underlayColor);
	handle.style.setProperty("--subtle-handle-underlay-opacity", palette.underlayOpacity);
}

function clearAdaptiveHandlePalette(handle: HTMLElement): void {
	handle.style.removeProperty("--subtle-handle-line-color");
	handle.style.removeProperty("--subtle-handle-line-opacity");
	handle.style.removeProperty("--subtle-handle-underlay-color");
	handle.style.removeProperty("--subtle-handle-underlay-opacity");
}
