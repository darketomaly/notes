import { type ImageItem } from "../model";

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
	resizeHandle.className = "item-resize-handle";
	resizeHandle.setAttribute("aria-hidden", "true");

	imageItem.appendChild(image);
	imageItem.appendChild(resizeHandle);
	return imageItem;
}
