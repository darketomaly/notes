export const NOTE_WIDTH = 240;
export const NOTE_HEIGHT = 46;
export const GROUP_WIDTH = 150;
export const GROUP_HEIGHT = 44;
export const ORGANIZER_WIDTH = 360;
export const ORGANIZER_HEIGHT = 220;
export const ORGANIZER_HEADER_HEIGHT = 38;
export const ORGANIZER_BODY_INSET = 10;
export const ORGANIZER_GRID_SIZE = 14;
export const EDGE_PADDING = 12;
export const DRAG_SNAP_DISTANCE = 14;
export const CONTEXT_MENU_WIDTH = 170;
export const CONTEXT_MENU_HEIGHT = 84;
export const SVG_NS = "http://www.w3.org/2000/svg";

export type Point = { x: number; y: number };

export type CanvasItem = NoteItem | GroupItem | ImageItem | OrganizerItem;
export type ContainableItem = NoteItem | GroupItem | ImageItem;

export interface Board {
	id: string;
	title: string;
	items: CanvasItem[];
	connections: Connection[];
}

export interface BaseItem {
	id: string;
	x: number;
	y: number;
}

export interface NoteItem extends BaseItem {
	type: "note";
	htmlContent: string;
	typingBold: boolean;
	width?: number;
	height?: number | null;
	minHeight?: number;
	parentOrganizerId?: string;
}

export interface GroupItem extends BaseItem {
	type: "group";
	title: string;
	board: Board;
	backgroundImageUrl?: string;
	width?: number;
	parentOrganizerId?: string;
}

export interface ImageItem extends BaseItem {
	type: "image";
	src: string;
	width: number;
	height: number;
	parentOrganizerId?: string;
}

export interface OrganizerItem extends BaseItem {
	type: "organizer";
	title: string;
	width: number;
	height: number;
	minWidth?: number;
	minHeight?: number;
}

export interface Connection {
	id: string;
	fromItemId: string;
	toItemId: string;
}

export function createId(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return crypto.randomUUID();
	}
	return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createBoard(title: string): Board {
	return { id: createId(), title, items: [], connections: [] };
}

export function clampToCanvas(
	canvas: HTMLElement,
	positionX: number,
	positionY: number,
	itemWidth: number,
	itemHeight: number,
): Point {
	const bounds = canvas.getBoundingClientRect();
	const maxLeft = Math.max(EDGE_PADDING, bounds.width - itemWidth - EDGE_PADDING);
	const maxTop = Math.max(EDGE_PADDING, bounds.height - itemHeight - EDGE_PADDING);

	return {
		x: Math.min(Math.max(positionX, EDGE_PADDING), maxLeft),
		y: Math.min(Math.max(positionY, EDGE_PADDING), maxTop),
	};
}

export function getRelativePoint(
	canvas: HTMLElement,
	clientX: number,
	clientY: number,
): Point {
	const bounds = canvas.getBoundingClientRect();
	return { x: clientX - bounds.left, y: clientY - bounds.top };
}

export function getItemFallbackSize(item: CanvasItem): { width: number; height: number } {
	if (item.type === "note") {
		return {
			width: item.width ?? NOTE_WIDTH,
			height: item.height ?? item.minHeight ?? NOTE_HEIGHT,
		};
	}
	if (item.type === "group") {
		return { width: item.width ?? GROUP_WIDTH, height: GROUP_HEIGHT };
	}
	if (item.type === "image") {
		return { width: item.width, height: item.height };
	}
	return { width: item.width, height: item.height };
}
