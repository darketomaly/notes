import {
	type CanvasItem,
	type ContainableItem,
	type OrganizerItem,
	type Point,
	type Board,
	ORGANIZER_BODY_INSET,
	ORGANIZER_GRID_SIZE,
} from "./model";

export function isContainableItem(item: CanvasItem): item is ContainableItem {
	return item.type === "note" || item.type === "group" || item.type === "image";
}

export function getOrganizerBodyBounds(
	organizer: OrganizerItem,
	headerHeight: number,
): { left: number; top: number; right: number; bottom: number } {
	return {
		left: organizer.x + ORGANIZER_BODY_INSET,
		top: organizer.y + headerHeight + ORGANIZER_BODY_INSET,
		right: organizer.x + organizer.width - ORGANIZER_BODY_INSET,
		bottom: organizer.y + organizer.height - ORGANIZER_BODY_INSET,
	};
}

export function resolveOrganizerForPoint(
	point: Point,
	board: Board,
	headerHeight: number,
	ignoreItemId?: string,
): OrganizerItem | null {
	const organizers = board.items.filter(
		(candidate): candidate is OrganizerItem => candidate.type === "organizer",
	);

	for (let index = organizers.length - 1; index >= 0; index -= 1) {
		const organizer = organizers[index];
		if (ignoreItemId && organizer.id === ignoreItemId) {
			continue;
		}
		const bounds = getOrganizerBodyBounds(organizer, headerHeight);
		if (
			point.x >= bounds.left &&
			point.x <= bounds.right &&
			point.y >= bounds.top &&
			point.y <= bounds.bottom
		) {
			return organizer;
		}
	}

	return null;
}

export function layoutOrganizerItems({
	board,
	organizerId,
	getElement,
	getItemFallbackSize,
	headerHeight,
}: {
	board: Board;
	organizerId: string;
	getElement: (id: string) => HTMLElement | undefined;
	getItemFallbackSize: (item: CanvasItem) => { width: number; height: number };
	headerHeight: number;
}): void {
	const organizer = board.items.find(
		(candidate): candidate is OrganizerItem =>
			candidate.type === "organizer" && candidate.id === organizerId,
	);
	if (!organizer) {
		return;
	}
	if (!organizer.minWidth) {
		organizer.minWidth = organizer.width;
	}
	if (!organizer.minHeight) {
		organizer.minHeight = organizer.height;
	}

	const bounds = getOrganizerBodyBounds(organizer, headerHeight);
	const availableBodyWidth = Math.max(1, organizer.width - ORGANIZER_BODY_INSET * 2);
	const bodyRight = bounds.left + availableBodyWidth;
	let cursorX = bounds.left;
	let cursorY = bounds.top;
	let rowHeight = 0;
	let usedRight = bounds.left;
	let usedBottom = bounds.top;

	const containedItems = board.items.filter(
		(candidate): candidate is ContainableItem =>
			isContainableItem(candidate) && candidate.parentOrganizerId === organizerId,
	);

	for (const contained of containedItems) {
		const element = getElement(contained.id);
		const fallbackSize = getItemFallbackSize(contained);
		const itemWidth = element?.offsetWidth ?? fallbackSize.width;
		const itemHeight = element?.offsetHeight ?? fallbackSize.height;

		if (cursorX > bounds.left && cursorX + itemWidth > bodyRight) {
			cursorX = bounds.left;
			cursorY += rowHeight + ORGANIZER_GRID_SIZE;
			rowHeight = 0;
		}

		contained.x = cursorX;
		contained.y = cursorY;

		if (element) {
			element.style.left = `${contained.x}px`;
			element.style.top = `${contained.y}px`;
		}
		usedRight = Math.max(usedRight, contained.x + itemWidth);
		usedBottom = Math.max(usedBottom, contained.y + itemHeight);

		cursorX = contained.x + itemWidth + ORGANIZER_GRID_SIZE;
		rowHeight = Math.max(rowHeight, itemHeight);
	}

	const requiredWidth = Math.max(
		organizer.minWidth,
		Math.ceil(usedRight - organizer.x + ORGANIZER_BODY_INSET),
	);
	const requiredHeight = Math.max(
		organizer.minHeight,
		Math.ceil(usedBottom - organizer.y + ORGANIZER_BODY_INSET),
	);
	if (requiredWidth !== organizer.width || requiredHeight !== organizer.height) {
		organizer.width = requiredWidth;
		organizer.height = requiredHeight;
		const organizerElement = getElement(organizer.id);
		if (organizerElement) {
			organizerElement.style.width = `${organizer.width}px`;
			organizerElement.style.height = `${organizer.height}px`;
		}
	}
}

export function reorderContainedItemInOrganizer({
	board,
	organizerId,
	movedItemId,
	dropPoint,
	getElementCenter,
}: {
	board: Board;
	organizerId: string;
	movedItemId: string;
	dropPoint: Point;
	getElementCenter: (id: string) => Point | null;
}): void {
	const contained = board.items.filter(
		(candidate): candidate is ContainableItem =>
			isContainableItem(candidate) && candidate.parentOrganizerId === organizerId,
	);
	if (contained.length <= 1) {
		return;
	}

	const moved = contained.find((candidate) => candidate.id === movedItemId);
	if (!moved) {
		return;
	}

	const toSortable = (item: ContainableItem): number => {
		const center = getElementCenter(item.id) ?? { x: item.x, y: item.y };
		return center.y * 100000 + center.x;
	};

	const others = contained
		.filter((candidate) => candidate.id !== movedItemId)
		.sort((left, right) => toSortable(left) - toSortable(right));

	const movedKey = dropPoint.y * 100000 + dropPoint.x;
	let insertIndex = others.findIndex((candidate) => toSortable(candidate) > movedKey);
	if (insertIndex === -1) {
		insertIndex = others.length;
	}

	const ordered = [...others.slice(0, insertIndex), moved, ...others.slice(insertIndex)];
	let nextContainedIndex = 0;
	for (let index = 0; index < board.items.length; index += 1) {
		const candidate = board.items[index];
		if (!isContainableItem(candidate) || candidate.parentOrganizerId !== organizerId) {
			continue;
		}
		board.items[index] = ordered[nextContainedIndex];
		nextContainedIndex += 1;
	}
}
