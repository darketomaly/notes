import interact from "interactjs";

const NOTE_WIDTH = 240;
const NOTE_HEIGHT = 46;
const GROUP_WIDTH = 150;
const GROUP_HEIGHT = 44;
const EDGE_PADDING = 12;
const CONTEXT_MENU_WIDTH = 170;
const CONTEXT_MENU_HEIGHT = 84;
const SVG_NS = "http://www.w3.org/2000/svg";

type Point = { x: number; y: number };

type CanvasItem = NoteItem | GroupItem | ImageItem;

interface Board {
	id: string;
	title: string;
	items: CanvasItem[];
	connections: Connection[];
}

interface BaseItem {
	id: string;
	x: number;
	y: number;
}

interface NoteItem extends BaseItem {
	type: "note";
	htmlContent: string;
	typingBold: boolean;
	width?: number;
	height?: number | null;
	minHeight?: number;
}

interface GroupItem extends BaseItem {
	type: "group";
	title: string;
	board: Board;
	backgroundImageUrl?: string;
}

interface ImageItem extends BaseItem {
	type: "image";
	src: string;
	width: number;
	height: number;
}

interface Connection {
	id: string;
	fromItemId: string;
	toItemId: string;
}

interface ConnectionDraft {
	fixedItemId: string;
}

interface DomRefs {
	canvas: HTMLElement;
	contextMenu: HTMLElement;
	createNoteAction: HTMLButtonElement;
	createGroupAction: HTMLButtonElement;
	createImageAction: HTMLButtonElement;
	renameGroupAction: HTMLButtonElement;
	replaceGroupBgAction: HTMLButtonElement;
	deleteGroupAction: HTMLButtonElement;
	connectNoteAction: HTMLButtonElement;
	deleteImageAction: HTMLButtonElement;
	deleteConnectionAction: HTMLButtonElement;
	deleteNoteAction: HTMLButtonElement;
	boardBreadcrumbs: HTMLElement;
	connectionsPermanent: SVGGElement;
	connectionPreview: SVGLineElement;
	textToolbar: HTMLElement;
	boldAction: HTMLButtonElement;
}

type ContextMenuState =
	| { type: "canvas"; point: Point }
	| { type: "group"; groupId: string }
	| { type: "note"; noteId: string }
	| { type: "image"; imageId: string }
	| { type: "connection"; connectionId: string };

function createId(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return crypto.randomUUID();
	}
	return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createBoard(title: string): Board {
	return { id: createId(), title, items: [], connections: [] };
}

function clampToCanvas(
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

function getRelativePoint(canvas: HTMLElement, clientX: number, clientY: number): Point {
	const bounds = canvas.getBoundingClientRect();
	return { x: clientX - bounds.left, y: clientY - bounds.top };
}

export function initNotesCanvas(): void {
	const canvas = document.getElementById("canvas");
	const contextMenu = document.getElementById("context-menu");
	const createNoteAction = document.getElementById("create-note-action");
	const createGroupAction = document.getElementById("create-group-action");
	const createImageAction = document.getElementById("create-image-action");
	const renameGroupAction = document.getElementById("rename-group-action");
	const replaceGroupBgAction = document.getElementById("replace-group-bg-action");
	const deleteGroupAction = document.getElementById("delete-group-action");
	const connectNoteAction = document.getElementById("connect-note-action");
	const deleteImageAction = document.getElementById("delete-image-action");
	const deleteConnectionAction = document.getElementById("delete-connection-action");
	const deleteNoteAction = document.getElementById("delete-note-action");
	const boardBreadcrumbs = document.getElementById("board-breadcrumbs");
	const connectionsPermanent = document.getElementById("connections-permanent");
	const connectionPreview = document.getElementById("connection-preview");
	const textToolbar = document.getElementById("text-toolbar");
	const boldAction = document.getElementById("bold-action");

	if (
		!(canvas instanceof HTMLElement) ||
		!(contextMenu instanceof HTMLElement) ||
		!(createNoteAction instanceof HTMLButtonElement) ||
		!(createGroupAction instanceof HTMLButtonElement) ||
		!(createImageAction instanceof HTMLButtonElement) ||
		!(renameGroupAction instanceof HTMLButtonElement) ||
		!(replaceGroupBgAction instanceof HTMLButtonElement) ||
		!(deleteGroupAction instanceof HTMLButtonElement) ||
		!(connectNoteAction instanceof HTMLButtonElement) ||
		!(deleteImageAction instanceof HTMLButtonElement) ||
		!(deleteConnectionAction instanceof HTMLButtonElement) ||
		!(deleteNoteAction instanceof HTMLButtonElement) ||
		!(boardBreadcrumbs instanceof HTMLElement) ||
		!(connectionsPermanent instanceof SVGGElement) ||
		!(connectionPreview instanceof SVGLineElement) ||
		!(textToolbar instanceof HTMLElement) ||
		!(boldAction instanceof HTMLButtonElement)
	) {
		return;
	}

	if (canvas.dataset.initialized === "true") {
		return;
	}
	canvas.dataset.initialized = "true";

	const dom: DomRefs = {
		canvas,
		contextMenu,
		createNoteAction,
		createGroupAction,
		createImageAction,
		renameGroupAction,
		replaceGroupBgAction,
		deleteGroupAction,
		connectNoteAction,
		deleteImageAction,
		deleteConnectionAction,
		deleteNoteAction,
		boardBreadcrumbs,
		connectionsPermanent,
		connectionPreview,
		textToolbar,
		boldAction,
	};

	let contextMenuState: ContextMenuState | null = null;
	const rootBoard = createBoard("Home");
	const boardStack: Board[] = [rootBoard];
	const noteElements = new Map<string, HTMLElement>();
	const itemElements = new Map<string, HTMLElement>();
	let connectionDraft: ConnectionDraft | null = null;
	let connectionPreviewMousePoint: Point | null = null;
	let activeRichEditor: HTMLElement | null = null;
	let activeRichNote: NoteItem | null = null;
	const selectedItemIds = new Set<string>();
	const marqueeBox = document.createElement("div");
	marqueeBox.className = "selection-marquee";
	marqueeBox.hidden = true;
	dom.canvas.appendChild(marqueeBox);
	let marqueeStartPoint: Point | null = null;
	let marqueeCurrentPoint: Point | null = null;
	let suppressNextCanvasClick = false;

	function currentBoard(): Board {
		return boardStack[boardStack.length - 1];
	}

	function closeContextMenu(): void {
		dom.contextMenu.hidden = true;
		contextMenuState = null;
	}

	function showCanvasMenu(point: Point): void {
		contextMenuState = { type: "canvas", point };
		dom.createNoteAction.hidden = false;
		dom.createGroupAction.hidden = false;
		dom.createImageAction.hidden = false;
		dom.renameGroupAction.hidden = true;
		dom.replaceGroupBgAction.hidden = true;
		dom.deleteGroupAction.hidden = true;
		dom.connectNoteAction.hidden = true;
		dom.deleteImageAction.hidden = true;
		dom.deleteConnectionAction.hidden = true;
		dom.deleteNoteAction.hidden = true;
	}

	function showGroupMenu(groupId: string): void {
		contextMenuState = { type: "group", groupId };
		dom.createNoteAction.hidden = true;
		dom.createGroupAction.hidden = true;
		dom.createImageAction.hidden = true;
		dom.renameGroupAction.hidden = false;
		dom.replaceGroupBgAction.hidden = false;
		dom.deleteGroupAction.hidden = false;
		dom.connectNoteAction.hidden = true;
		dom.deleteImageAction.hidden = true;
		dom.deleteConnectionAction.hidden = true;
		dom.deleteNoteAction.hidden = true;
	}

	function showNoteMenu(noteId: string): void {
		contextMenuState = { type: "note", noteId };
		dom.createNoteAction.hidden = true;
		dom.createGroupAction.hidden = true;
		dom.createImageAction.hidden = true;
		dom.renameGroupAction.hidden = true;
		dom.replaceGroupBgAction.hidden = true;
		dom.deleteGroupAction.hidden = true;
		dom.connectNoteAction.hidden = false;
		dom.deleteImageAction.hidden = true;
		dom.deleteConnectionAction.hidden = true;
		dom.deleteNoteAction.hidden = false;
	}

	function showImageMenu(imageId: string): void {
		contextMenuState = { type: "image", imageId };
		dom.createNoteAction.hidden = true;
		dom.createGroupAction.hidden = true;
		dom.createImageAction.hidden = true;
		dom.renameGroupAction.hidden = true;
		dom.replaceGroupBgAction.hidden = true;
		dom.deleteGroupAction.hidden = true;
		dom.connectNoteAction.hidden = false;
		dom.deleteImageAction.hidden = false;
		dom.deleteConnectionAction.hidden = true;
		dom.deleteNoteAction.hidden = true;
	}

	function showConnectionMenu(connectionId: string): void {
		contextMenuState = { type: "connection", connectionId };
		dom.createNoteAction.hidden = true;
		dom.createGroupAction.hidden = true;
		dom.createImageAction.hidden = true;
		dom.renameGroupAction.hidden = true;
		dom.replaceGroupBgAction.hidden = true;
		dom.deleteGroupAction.hidden = true;
		dom.connectNoteAction.hidden = true;
		dom.deleteImageAction.hidden = true;
		dom.deleteConnectionAction.hidden = false;
		dom.deleteNoteAction.hidden = true;
	}

	function refreshBoardHeader(): void {
		dom.boardBreadcrumbs.replaceChildren();

		for (let index = 0; index < boardStack.length; index += 1) {
			const board = boardStack[index];
			const isCurrent = index === boardStack.length - 1;

			if (index > 0) {
				const separator = document.createElement("span");
				separator.className = "breadcrumbs-separator";
				separator.textContent = "/";
				dom.boardBreadcrumbs.appendChild(separator);
			}

			if (isCurrent) {
				const currentLabel = document.createElement("span");
				currentLabel.className = "breadcrumbs-current";
				currentLabel.textContent = board.title;
				dom.boardBreadcrumbs.appendChild(currentLabel);
				continue;
			}

			const link = document.createElement("button");
			link.type = "button";
			link.className = "breadcrumbs-link";
			link.textContent = board.title;
			link.setAttribute("aria-label", `Go to ${board.title}`);
			link.addEventListener("click", () => {
				boardStack.splice(index + 1);
				renderBoard();
			});
			dom.boardBreadcrumbs.appendChild(link);
		}
	}

	function canOpenCanvasMenu(eventTarget: EventTarget | null): boolean {
		return !(eventTarget instanceof HTMLElement && eventTarget.closest(".item"));
	}

	function findGroupInCurrentBoard(groupId: string): GroupItem | undefined {
		const items = currentBoard().items;
		return items.find(
			(item): item is GroupItem => item.type === "group" && item.id === groupId,
		);
	}

	function findNoteInCurrentBoard(noteId: string): NoteItem | undefined {
		const items = currentBoard().items;
		return items.find((item): item is NoteItem => item.type === "note" && item.id === noteId);
	}

	function findImageInCurrentBoard(imageId: string): ImageItem | undefined {
		const items = currentBoard().items;
		return items.find((item): item is ImageItem => item.type === "image" && item.id === imageId);
	}

	function beginConnectionFromItem(itemId: string): void {
		connectionDraft = { fixedItemId: itemId };
		const sourceElement = itemElements.get(itemId);
		connectionPreviewMousePoint = sourceElement ? getElementCenter(sourceElement) : null;
		closeContextMenu();
		refreshConnectionPreview();
	}

	function getMenuHeight(): number {
		const visibleActions = dom.contextMenu.querySelectorAll("button:not([hidden])").length;
		const actionHeight = 38;
		const verticalPadding = 12;
		return Math.max(52, visibleActions * actionHeight + verticalPadding);
	}

	function hideTextToolbar(): void {
		dom.textToolbar.hidden = true;
		activeRichEditor = null;
		activeRichNote = null;
		dom.boldAction.classList.remove("is-active");
	}

	function isSelectionInsideEditor(editor: HTMLElement): boolean {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) {
			return false;
		}

		const range = selection.getRangeAt(0);
		const startNode = range.startContainer;
		const endNode = range.endContainer;
		return editor.contains(startNode) && editor.contains(endNode);
	}

	function positionTextToolbar(editor: HTMLElement): void {
		const canvasRect = dom.canvas.getBoundingClientRect();
		const editorRect = editor.getBoundingClientRect();
		const left = editorRect.left - canvasRect.left + editorRect.width / 2;
		const top = editorRect.top - canvasRect.top - 18;
		dom.textToolbar.style.left = `${left}px`;
		dom.textToolbar.style.top = `${top}px`;
	}

	function refreshBoldButtonState(): void {
		if (!activeRichEditor || !isSelectionInsideEditor(activeRichEditor)) {
			dom.boldAction.classList.remove("is-active");
			return;
		}
		const isBold = document.queryCommandState("bold");
		dom.boldAction.classList.toggle("is-active", Boolean(isBold));
	}

	function hasTextSelectionInEditor(editor: HTMLElement): boolean {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) {
			return false;
		}

		const range = selection.getRangeAt(0);
		return !range.collapsed && editor.contains(range.commonAncestorContainer);
	}

	function isCaretInsideTextNode(editor: HTMLElement): boolean {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) {
			return false;
		}

		const range = selection.getRangeAt(0);
		if (!range.collapsed) {
			return false;
		}

		const startNode = range.startContainer;
		return (
			startNode.nodeType === Node.TEXT_NODE &&
			editor.contains(startNode) &&
			Boolean(startNode.textContent)
		);
	}

	function syncEditorTypingBold(desiredBold: boolean): void {
		if (!activeRichEditor) {
			return;
		}
		if (!isSelectionInsideEditor(activeRichEditor)) {
			return;
		}
		if (isCaretInsideTextNode(activeRichEditor)) {
			refreshBoldButtonState();
			return;
		}
		const current = Boolean(document.queryCommandState("bold"));
		if (current !== desiredBold) {
			document.execCommand("bold");
		}
		refreshBoldButtonState();
	}

	function showTextToolbarFor(editor: HTMLElement, note: NoteItem): void {
		activeRichEditor = editor;
		activeRichNote = note;
		positionTextToolbar(editor);
		dom.textToolbar.hidden = false;
		refreshBoldButtonState();
	}

	function placeCaretNearPoint(editor: HTMLElement, clientX: number, clientY: number): void {
		const selection = window.getSelection();
		if (!selection) {
			return;
		}

		const caretDocument = document as Document & {
			caretRangeFromPoint?: (x: number, y: number) => Range | null;
			caretPositionFromPoint?: (
				x: number,
				y: number,
			) => { offsetNode: Node; offset: number } | null;
		};

		let range: Range | null = null;
		if (typeof caretDocument.caretRangeFromPoint === "function") {
			range = caretDocument.caretRangeFromPoint(clientX, clientY);
		} else if (typeof caretDocument.caretPositionFromPoint === "function") {
			const caretPosition = caretDocument.caretPositionFromPoint(clientX, clientY);
			if (caretPosition) {
				range = document.createRange();
				range.setStart(caretPosition.offsetNode, caretPosition.offset);
				range.collapse(true);
			}
		}

		if (range && editor.contains(range.startContainer)) {
			selection.removeAllRanges();
			selection.addRange(range);
			return;
		}

		const fallbackRange = document.createRange();
		fallbackRange.selectNodeContents(editor);
		fallbackRange.collapse(false);
		selection.removeAllRanges();
		selection.addRange(fallbackRange);
	}

	function normalizeRichEditorContent(editor: HTMLElement): void {
		const text = editor.textContent ?? "";
		if (!text.trim()) {
			editor.innerHTML = "";
		}
	}

	function getElementCenter(element: HTMLElement): Point {
		return {
			x: element.offsetLeft + element.offsetWidth / 2,
			y: element.offsetTop + element.offsetHeight / 2,
		};
	}

	function getClosestEdgeAnchor(element: HTMLElement, targetPoint: Point): Point {
		const center = getElementCenter(element);
		const dx = targetPoint.x - center.x;
		const dy = targetPoint.y - center.y;

		if (Math.abs(dx) >= Math.abs(dy)) {
			return {
				x: dx >= 0 ? element.offsetLeft + element.offsetWidth : element.offsetLeft,
				y: center.y,
			};
		}

		return {
			x: center.x,
			y: dy >= 0 ? element.offsetTop + element.offsetHeight : element.offsetTop,
		};
	}

	function clearConnectionPreview(): void {
		connectionDraft = null;
		connectionPreviewMousePoint = null;
		dom.connectionPreview.hidden = true;
		dom.connectionPreview.style.display = "none";
		dom.connectionPreview.setAttribute("visibility", "hidden");
	}

	function refreshSelectedItemUI(): void {
		for (const [id, element] of itemElements.entries()) {
			element.classList.toggle("is-selected", selectedItemIds.has(id));
		}
	}

	function setSingleSelectedItem(id: string | null): void {
		selectedItemIds.clear();
		if (id) {
			selectedItemIds.add(id);
		}
		refreshSelectedItemUI();
	}

	function setSelectedItems(ids: Set<string>): void {
		selectedItemIds.clear();
		for (const id of ids) {
			selectedItemIds.add(id);
		}
		refreshSelectedItemUI();
	}

	function getMarqueeBounds(from: Point, to: Point): {
		left: number;
		top: number;
		right: number;
		bottom: number;
	} {
		return {
			left: Math.min(from.x, to.x),
			top: Math.min(from.y, to.y),
			right: Math.max(from.x, to.x),
			bottom: Math.max(from.y, to.y),
		};
	}

	function updateMarqueeVisual(): void {
		if (!marqueeStartPoint || !marqueeCurrentPoint) {
			marqueeBox.hidden = true;
			return;
		}

		const bounds = getMarqueeBounds(marqueeStartPoint, marqueeCurrentPoint);
		marqueeBox.hidden = false;
		marqueeBox.style.left = `${bounds.left}px`;
		marqueeBox.style.top = `${bounds.top}px`;
		marqueeBox.style.width = `${Math.max(1, bounds.right - bounds.left)}px`;
		marqueeBox.style.height = `${Math.max(1, bounds.bottom - bounds.top)}px`;
	}

	function updateMarqueeSelection(): void {
		if (!marqueeStartPoint || !marqueeCurrentPoint) {
			return;
		}

		const bounds = getMarqueeBounds(marqueeStartPoint, marqueeCurrentPoint);
		const nextSelected = new Set<string>();

		for (const [id, element] of itemElements.entries()) {
			const left = element.offsetLeft;
			const top = element.offsetTop;
			const right = left + element.offsetWidth;
			const bottom = top + element.offsetHeight;
			const intersects =
				right >= bounds.left &&
				left <= bounds.right &&
				bottom >= bounds.top &&
				top <= bounds.bottom;
			if (intersects) {
				nextSelected.add(id);
			}
		}

		setSelectedItems(nextSelected);
	}

	function stopMarqueeSelection(): void {
		marqueeStartPoint = null;
		marqueeCurrentPoint = null;
		marqueeBox.hidden = true;
	}

	function removeNoteById(noteId: string): boolean {
		const index = currentBoard().items.findIndex(
			(item) => item.type === "note" && item.id === noteId,
		);
		if (index === -1) {
			return false;
		}

		currentBoard().items.splice(index, 1);
		currentBoard().connections = currentBoard().connections.filter(
			(connection) =>
				connection.fromItemId !== noteId && connection.toItemId !== noteId,
		);

		if (connectionDraft?.fixedItemId === noteId) {
			clearConnectionPreview();
		}
		selectedItemIds.delete(noteId);
		return true;
	}

	function removeGroupById(groupId: string): boolean {
		const index = currentBoard().items.findIndex(
			(item) => item.type === "group" && item.id === groupId,
		);
		if (index === -1) {
			return false;
		}

		currentBoard().items.splice(index, 1);
		currentBoard().connections = currentBoard().connections.filter(
			(connection) =>
				connection.fromItemId !== groupId && connection.toItemId !== groupId,
		);
		if (connectionDraft?.fixedItemId === groupId) {
			clearConnectionPreview();
		}
		selectedItemIds.delete(groupId);
		return true;
	}

	function removeImageById(imageId: string): boolean {
		const index = currentBoard().items.findIndex(
			(item) => item.type === "image" && item.id === imageId,
		);
		if (index === -1) {
			return false;
		}

		currentBoard().items.splice(index, 1);
		currentBoard().connections = currentBoard().connections.filter(
			(connection) =>
				connection.fromItemId !== imageId && connection.toItemId !== imageId,
		);
		if (connectionDraft?.fixedItemId === imageId) {
			clearConnectionPreview();
		}
		selectedItemIds.delete(imageId);
		return true;
	}

	function renderConnections(): void {
		const board = currentBoard();
		dom.connectionsPermanent.replaceChildren();

		board.connections = board.connections.filter(
			(connection) =>
				itemElements.has(connection.fromItemId) && itemElements.has(connection.toItemId),
		);

		for (const connection of board.connections) {
			const fromElement = itemElements.get(connection.fromItemId);
			const toElement = itemElements.get(connection.toItemId);
			if (!fromElement || !toElement) {
				continue;
			}

			const fromCenter = getElementCenter(fromElement);
			const toCenter = getElementCenter(toElement);
			const from = getClosestEdgeAnchor(fromElement, toCenter);
			const to = getClosestEdgeAnchor(toElement, fromCenter);
			const hitLine = document.createElementNS(SVG_NS, "line");
			hitLine.setAttribute("x1", String(from.x));
			hitLine.setAttribute("y1", String(from.y));
			hitLine.setAttribute("x2", String(to.x));
			hitLine.setAttribute("y2", String(to.y));
			hitLine.classList.add("connection-hit-area");
			hitLine.dataset.connectionId = connection.id;

			const line = document.createElementNS(SVG_NS, "line");
			line.setAttribute("x1", String(from.x));
			line.setAttribute("y1", String(from.y));
			line.setAttribute("x2", String(to.x));
			line.setAttribute("y2", String(to.y));
			line.classList.add("connection-line");
			line.dataset.connectionId = connection.id;
			line.setAttribute("marker-end", "url(#connection-arrowhead)");
			dom.connectionsPermanent.appendChild(hitLine);
			dom.connectionsPermanent.appendChild(line);
		}
	}

	function refreshConnectionPreview(): void {
		if (!connectionDraft || !connectionPreviewMousePoint) {
			dom.connectionPreview.hidden = true;
			dom.connectionPreview.style.display = "none";
			dom.connectionPreview.setAttribute("visibility", "hidden");
			return;
		}

		const fixedElement = itemElements.get(connectionDraft.fixedItemId);
		if (!fixedElement) {
			clearConnectionPreview();
			return;
		}

		const fixedAnchor = getClosestEdgeAnchor(fixedElement, connectionPreviewMousePoint);
		dom.connectionPreview.setAttribute("x1", String(fixedAnchor.x));
		dom.connectionPreview.setAttribute("y1", String(fixedAnchor.y));
		dom.connectionPreview.setAttribute("x2", String(connectionPreviewMousePoint.x));
		dom.connectionPreview.setAttribute("y2", String(connectionPreviewMousePoint.y));
		dom.connectionPreview.setAttribute("marker-end", "url(#connection-arrowhead)");
		dom.connectionPreview.hidden = false;
		dom.connectionPreview.style.display = "inline";
		dom.connectionPreview.setAttribute("visibility", "visible");
	}

	function clearBrowserSelection(): void {
		const selection = window.getSelection();
		if (selection) {
			selection.removeAllRanges();
		}
	}

	function exitInlineEditMode(
		container: HTMLElement,
		input: HTMLInputElement | HTMLTextAreaElement,
	): void {
		input.selectionStart = 0;
		input.selectionEnd = 0;
		input.disabled = true;
		container.classList.remove("is-editing");
		clearBrowserSelection();
	}

	function startGroupEditingById(groupId: string): void {
		for (const candidate of dom.canvas.querySelectorAll(".group-item")) {
			if (!(candidate instanceof HTMLElement)) {
				continue;
			}
			if (candidate.dataset.itemId !== groupId) {
				continue;
			}

			const input = candidate.querySelector("input");
			if (!(input instanceof HTMLInputElement)) {
				return;
			}

			candidate.classList.add("is-editing");
			input.disabled = false;
			input.focus();
			input.select();
			return;
		}
	}

	function makeDraggable(element: HTMLElement, item: CanvasItem): void {
		let draggedIds: string[] = [item.id];

		interact(element).draggable({
			ignoreFrom:
				"input, textarea, [contenteditable='true'], .image-resize-handle, .note-resize-handle",
			listeners: {
				start() {
					closeContextMenu();
					draggedIds =
						selectedItemIds.size > 1 && selectedItemIds.has(item.id)
							? Array.from(selectedItemIds)
							: [item.id];
				},
				move(event) {
					if (!(event.target instanceof HTMLElement)) {
						return;
					}

					const canvasBounds = dom.canvas.getBoundingClientRect();
					let appliedDx = event.dx;
					let appliedDy = event.dy;
					let minDx = Number.NEGATIVE_INFINITY;
					let maxDx = Number.POSITIVE_INFINITY;
					let minDy = Number.NEGATIVE_INFINITY;
					let maxDy = Number.POSITIVE_INFINITY;

					const draggedItems: Array<{ data: CanvasItem; element: HTMLElement }> = [];
					for (const id of draggedIds) {
						const data = currentBoard().items.find((candidate) => candidate.id === id);
						const selectedElement = itemElements.get(id);
						if (!data || !selectedElement) {
							continue;
						}

						draggedItems.push({ data, element: selectedElement });
						const width = selectedElement.offsetWidth || NOTE_WIDTH;
						const height = selectedElement.offsetHeight || NOTE_HEIGHT;
						const itemMinDx = EDGE_PADDING - data.x;
						const itemMaxDx = canvasBounds.width - width - EDGE_PADDING - data.x;
						const itemMinDy = EDGE_PADDING - data.y;
						const itemMaxDy = canvasBounds.height - height - EDGE_PADDING - data.y;
						minDx = Math.max(minDx, itemMinDx);
						maxDx = Math.min(maxDx, itemMaxDx);
						minDy = Math.max(minDy, itemMinDy);
						maxDy = Math.min(maxDy, itemMaxDy);
					}

					if (draggedItems.length === 0) {
						return;
					}

					appliedDx = Math.max(minDx, Math.min(maxDx, appliedDx));
					appliedDy = Math.max(minDy, Math.min(maxDy, appliedDy));

					for (const dragged of draggedItems) {
						dragged.data.x += appliedDx;
						dragged.data.y += appliedDy;
						dragged.element.style.left = `${dragged.data.x}px`;
						dragged.element.style.top = `${dragged.data.y}px`;
					}
					renderConnections();
					refreshConnectionPreview();
				},
			},
		});
	}

	function makeResizableNote(element: HTMLElement, item: NoteItem): void {
		interact(element).resizable({
			edges: { right: ".note-resize-handle", bottom: ".note-resize-handle" },
			listeners: {
				start() {
					closeContextMenu();
				},
				move(event) {
					const canvasBounds = dom.canvas.getBoundingClientRect();
					const width = Math.max(170, event.rect.width);
					const height = Math.max(46, event.rect.height);
					const clamped = clampToCanvas(dom.canvas, item.x, item.y, width, height);
					const maxWidth = Math.max(170, canvasBounds.width - clamped.x - EDGE_PADDING);
					const maxHeight = Math.max(46, canvasBounds.height - clamped.y - EDGE_PADDING);
					const nextWidth = Math.min(maxWidth, Math.max(170, width - (clamped.x - item.x)));
					const nextHeight = Math.min(maxHeight, Math.max(46, height - (clamped.y - item.y)));
					const editor = element.querySelector(".note-editor");
					const noteStyles = window.getComputedStyle(element);
					const verticalPadding =
						parseFloat(noteStyles.paddingTop) + parseFloat(noteStyles.paddingBottom);
					const contentHeight =
						editor instanceof HTMLElement ? editor.scrollHeight : NOTE_HEIGHT;
					const naturalHeight = Math.max(46, Math.ceil(contentHeight + verticalPadding));
					item.width = nextWidth;
					if (nextHeight < naturalHeight) {
						item.height = nextHeight;
						item.minHeight = 46;
					} else {
						item.height = null;
						item.minHeight = nextHeight;
					}
					item.x = clamped.x;
					item.y = clamped.y;
					element.style.left = `${item.x}px`;
					element.style.top = `${item.y}px`;
					element.style.width = `${item.width}px`;
					if (item.height === null) {
						element.style.removeProperty("height");
						element.style.minHeight = `${Math.max(46, item.minHeight ?? NOTE_HEIGHT)}px`;
						element.classList.remove("is-height-locked");
					} else {
						element.style.height = `${item.height}px`;
						element.style.minHeight = "46px";
						element.classList.add("is-height-locked");
					}
					renderConnections();
					refreshConnectionPreview();
				},
			},
		});
	}

	function makeResizableImage(element: HTMLElement, item: ImageItem): void {
		interact(element).resizable({
			edges: { right: ".image-resize-handle", bottom: ".image-resize-handle" },
			listeners: {
				start() {
					closeContextMenu();
				},
				move(event) {
					const canvasBounds = dom.canvas.getBoundingClientRect();
					const width = Math.max(100, event.rect.width);
					const height = Math.max(80, event.rect.height);
					const clamped = clampToCanvas(dom.canvas, item.x, item.y, width, height);
					const maxWidth = Math.max(100, canvasBounds.width - clamped.x - EDGE_PADDING);
					const maxHeight = Math.max(80, canvasBounds.height - clamped.y - EDGE_PADDING);
					item.width = Math.min(maxWidth, Math.max(100, width - (clamped.x - item.x)));
					item.height = Math.min(maxHeight, Math.max(80, height - (clamped.y - item.y)));
					item.x = clamped.x;
					item.y = clamped.y;
					element.style.left = `${item.x}px`;
					element.style.top = `${item.y}px`;
					element.style.width = `${item.width}px`;
					element.style.height = `${item.height}px`;
				},
			},
		});
	}

	function renderItem(item: CanvasItem, focusInput = false): void {
		let element: HTMLElement;

		if (item.type === "note") {
			const note = document.createElement("div");
			note.className = "note item";
			note.style.width = `${item.width ?? NOTE_WIDTH}px`;
			if (item.minHeight && item.minHeight > 46) {
				note.style.minHeight = `${item.minHeight}px`;
			}
			if (item.height != null) {
				note.style.height = `${item.height}px`;
				note.classList.add("is-height-locked");
			}
			const editor = document.createElement("div");
			editor.className = "note-editor";
			editor.setAttribute("aria-label", "Note content");
			editor.setAttribute("data-placeholder", "Write a note…");
			editor.contentEditable = "false";
			editor.innerHTML = item.htmlContent;
			editor.addEventListener("input", () => {
				normalizeRichEditorContent(editor);
				item.htmlContent = editor.innerHTML;
				renderConnections();
				refreshConnectionPreview();
				positionTextToolbar(editor);
				refreshBoldButtonState();
			});
			note.addEventListener("dblclick", (event) => {
				if (note.classList.contains("is-editing")) {
					return;
				}

				event.preventDefault();
				event.stopPropagation();
				note.classList.add("is-editing");
				editor.contentEditable = "true";
				editor.focus();
				showTextToolbarFor(editor, item);
				placeCaretNearPoint(editor, event.clientX, event.clientY);
				syncEditorTypingBold(item.typingBold);
			});
			editor.addEventListener("blur", () => {
				normalizeRichEditorContent(editor);
				editor.contentEditable = "false";
				note.classList.remove("is-editing");
				item.htmlContent = editor.innerHTML;
				clearBrowserSelection();
				hideTextToolbar();
				renderConnections();
				refreshConnectionPreview();
			});
			editor.addEventListener("keydown", (event) => {
				if (event.key === "Escape") {
					editor.blur();
				}
			});
			editor.addEventListener("keyup", () => {
				refreshBoldButtonState();
				positionTextToolbar(editor);
			});
			editor.addEventListener("mouseup", () => {
				refreshBoldButtonState();
				positionTextToolbar(editor);
			});
			editor.addEventListener("click", (event) => {
				if (!note.classList.contains("is-editing") || event.detail !== 3) {
					return;
				}

				event.preventDefault();
				const selection = window.getSelection();
				if (!selection) {
					return;
				}

				const range = document.createRange();
				range.selectNodeContents(editor);
				selection.removeAllRanges();
				selection.addRange(range);
				refreshBoldButtonState();
			});
			const resizeHandle = document.createElement("div");
			resizeHandle.className = "note-resize-handle";
			resizeHandle.setAttribute("aria-hidden", "true");

			note.appendChild(editor);
			note.appendChild(resizeHandle);
			element = note;

			if (focusInput) {
				queueMicrotask(() => {
					note.classList.add("is-editing");
					editor.contentEditable = "true";
					editor.focus();
					showTextToolbarFor(editor, item);
					syncEditorTypingBold(item.typingBold);
				});
			}
		} else if (item.type === "group") {
			const groupItem = document.createElement("div");
			groupItem.className = "group-item item";
			if (item.backgroundImageUrl) {
				groupItem.style.setProperty("--group-item-bg-image", `url("${item.backgroundImageUrl}")`);
			}
			const input = document.createElement("input");
			input.type = "text";
			input.value = item.title;
			input.disabled = true;
			input.setAttribute("aria-label", `Group title ${item.title}`);
			input.addEventListener("input", () => {
				item.title = input.value || "Untitled group";
				item.board.title = item.title;
				refreshBoardHeader();
			});
			input.addEventListener("blur", () => {
				if (!input.value.trim()) {
					input.value = "Untitled group";
				}
				item.title = input.value;
				item.board.title = item.title;
				exitInlineEditMode(groupItem, input);
				refreshBoardHeader();
			});
			input.addEventListener("keydown", (event) => {
				if (event.key === "Enter" || event.key === "Escape") {
					input.blur();
				}
			});
			groupItem.addEventListener("dblclick", (event) => {
				event.preventDefault();
				event.stopPropagation();
				if (groupItem.classList.contains("is-editing")) {
					return;
				}
				boardStack.push(item.board);
				renderBoard();
			});
			groupItem.appendChild(input);
			element = groupItem;

			if (focusInput) {
				queueMicrotask(() => {
					groupItem.classList.add("is-editing");
					input.disabled = false;
					input.focus();
					input.select();
				});
			}
		} else {
			const imageItem = document.createElement("div");
			imageItem.className = "image-item item";
			imageItem.style.width = `${item.width}px`;
			imageItem.style.height = `${item.height}px`;

			const image = document.createElement("img");
			image.src = item.src;
			image.alt = "";
			image.draggable = false;

			const resizeHandle = document.createElement("div");
			resizeHandle.className = "image-resize-handle";
			resizeHandle.setAttribute("aria-hidden", "true");

			imageItem.appendChild(image);
			imageItem.appendChild(resizeHandle);
			element = imageItem;
		}

		element.dataset.itemId = item.id;
		element.dataset.itemType = item.type;
		element.style.left = `${item.x}px`;
		element.style.top = `${item.y}px`;
		if (focusInput) {
			element.classList.add("is-spawning");
			window.setTimeout(() => {
				element.classList.remove("is-spawning");
			}, 260);
		}
		dom.canvas.appendChild(element);
		itemElements.set(item.id, element);
		if (item.type === "note") {
			noteElements.set(item.id, element);
		}
		makeDraggable(element, item);
		if (item.type === "note") {
			makeResizableNote(element, item);
		}
		if (item.type === "image") {
			makeResizableImage(element, item);
		}
	}

	function renderBoard(): void {
		closeContextMenu();
		hideTextToolbar();
		noteElements.clear();
		itemElements.clear();
		for (const element of dom.canvas.querySelectorAll(".item")) {
			element.remove();
		}
		for (const item of currentBoard().items) {
			renderItem(item);
		}
		renderConnections();
		refreshConnectionPreview();
		refreshSelectedItemUI();
		refreshBoardHeader();
	}

	function createNoteAt(positionX: number, positionY: number): void {
		const clamped = clampToCanvas(
			dom.canvas,
			positionX - NOTE_WIDTH / 2,
			positionY - NOTE_HEIGHT / 2,
			NOTE_WIDTH,
			NOTE_HEIGHT,
		);
		const note: NoteItem = {
			id: createId(),
			type: "note",
			x: clamped.x,
			y: clamped.y,
			htmlContent: "",
			typingBold: false,
			width: NOTE_WIDTH,
			height: null,
			minHeight: NOTE_HEIGHT,
		};
		currentBoard().items.push(note);
		renderItem(note, true);
	}

	function createGroupAt(positionX: number, positionY: number): void {
		const clamped = clampToCanvas(dom.canvas, positionX, positionY, GROUP_WIDTH, GROUP_HEIGHT);
		const current = currentBoard();
		const groupCount = current.items.filter((item) => item.type === "group").length + 1;
		const group: GroupItem = {
			id: createId(),
			type: "group",
			x: clamped.x,
			y: clamped.y,
			title: `Group ${groupCount}`,
			board: createBoard(`Group ${groupCount}`),
		};
		current.items.push(group);
		renderItem(group, true);
	}

	function pickImageFile(): Promise<File | null> {
		return new Promise((resolve) => {
			const picker = document.createElement("input");
			picker.type = "file";
			picker.accept = "image/*";
			picker.style.display = "none";
			document.body.appendChild(picker);

			const cleanup = () => {
				picker.remove();
			};

			picker.addEventListener("change", () => {
				const file = picker.files?.[0] ?? null;
				cleanup();
				resolve(file);
			});

			picker.addEventListener("cancel", () => {
				cleanup();
				resolve(null);
			});

			picker.click();
		});
	}

	async function createImageAt(positionX: number, positionY: number): Promise<void> {
		const file = await pickImageFile();
		if (!file || !file.type.startsWith("image/")) {
			return;
		}

		const dataUrl = await new Promise<string | null>((resolve) => {
			const reader = new FileReader();
			reader.onload = () => {
				resolve(typeof reader.result === "string" ? reader.result : null);
			};
			reader.onerror = () => resolve(null);
			reader.readAsDataURL(file);
		});
		if (!dataUrl) {
			return;
		}

		const initialSize = await new Promise<{ width: number; height: number }>((resolve) => {
			const image = new Image();
			image.onload = () => {
				const maxWidth = 360;
				const maxHeight = 260;
				const widthRatio = maxWidth / image.naturalWidth;
				const heightRatio = maxHeight / image.naturalHeight;
				const ratio = Math.min(1, widthRatio, heightRatio);
				resolve({
					width: Math.max(100, Math.round(image.naturalWidth * ratio)),
					height: Math.max(80, Math.round(image.naturalHeight * ratio)),
				});
			};
			image.onerror = () => resolve({ width: 220, height: 140 });
			image.src = dataUrl;
		});

		const clamped = clampToCanvas(
			dom.canvas,
			positionX - initialSize.width / 2,
			positionY - initialSize.height / 2,
			initialSize.width,
			initialSize.height,
		);

		const imageItem: ImageItem = {
			id: createId(),
			type: "image",
			x: clamped.x,
			y: clamped.y,
			src: dataUrl,
			width: initialSize.width,
			height: initialSize.height,
		};
		currentBoard().items.push(imageItem);
		renderItem(imageItem, true);
	}

	dom.canvas.addEventListener("dblclick", (event) => {
		const target = event.target instanceof HTMLElement ? event.target : null;
		if (target && (target.closest("#text-toolbar") || target.closest("#context-menu"))) {
			return;
		}

		if (!canOpenCanvasMenu(event.target)) {
			return;
		}

		const relative = getRelativePoint(dom.canvas, event.clientX, event.clientY);
		closeContextMenu();
		createNoteAt(relative.x, relative.y);
	});

	dom.canvas.addEventListener("contextmenu", (event) => {
		event.preventDefault();
		const target = event.target instanceof Element ? event.target : null;
		const relative = getRelativePoint(dom.canvas, event.clientX, event.clientY);
		const noteTarget = target?.closest(".note");
		const groupTarget = target?.closest(".group-item");
		const imageTarget = target?.closest(".image-item");
		const connectionTarget = target?.closest("[data-connection-id]");

		if (connectionTarget instanceof SVGElement) {
			const connectionId = connectionTarget.getAttribute("data-connection-id");
			if (
				!connectionId ||
				!currentBoard().connections.some((connection) => connection.id === connectionId)
			) {
				closeContextMenu();
				return;
			}
			showConnectionMenu(connectionId);
		} else if (noteTarget instanceof HTMLElement) {
			if (noteTarget.classList.contains("is-editing")) {
				closeContextMenu();
				return;
			}

			const noteId = noteTarget.dataset.itemId;
			if (!noteId || !findNoteInCurrentBoard(noteId)) {
				closeContextMenu();
				return;
			}
			showNoteMenu(noteId);
		} else if (groupTarget instanceof HTMLElement) {
			if (groupTarget.classList.contains("is-editing")) {
				closeContextMenu();
				return;
			}

			const groupId = groupTarget.dataset.itemId;
			if (!groupId || !findGroupInCurrentBoard(groupId)) {
				closeContextMenu();
				return;
			}
			showGroupMenu(groupId);
		} else if (imageTarget instanceof HTMLElement) {
			const imageId = imageTarget.dataset.itemId;
			if (!imageId || !findImageInCurrentBoard(imageId)) {
				closeContextMenu();
				return;
			}
			showImageMenu(imageId);
		} else if (canOpenCanvasMenu(event.target)) {
			showCanvasMenu(relative);
		} else {
			closeContextMenu();
			return;
		}

		const clampedMenu = clampToCanvas(
			dom.canvas,
			relative.x,
			relative.y,
			CONTEXT_MENU_WIDTH,
			getMenuHeight(),
		);
		dom.contextMenu.style.left = `${clampedMenu.x}px`;
		dom.contextMenu.style.top = `${clampedMenu.y}px`;
		dom.contextMenu.hidden = false;
	});

	document.addEventListener("pointermove", (event) => {
		if (!connectionDraft) {
			return;
		}

		connectionPreviewMousePoint = getRelativePoint(dom.canvas, event.clientX, event.clientY);
		refreshConnectionPreview();
	});

	dom.canvas.addEventListener("click", (event) => {
		if (suppressNextCanvasClick) {
			suppressNextCanvasClick = false;
			return;
		}

		if (!connectionDraft) {
			const target = event.target instanceof HTMLElement ? event.target : null;
			if (target && (target.closest("#context-menu") || target.closest("#text-toolbar"))) {
				return;
			}

			const noteTarget = target?.closest(".note");
			const groupTarget = target?.closest(".group-item");
			const imageTarget = target?.closest(".image-item");
			if (noteTarget instanceof HTMLElement && !noteTarget.classList.contains("is-editing")) {
				const noteId = noteTarget.dataset.itemId;
				if (noteId && findNoteInCurrentBoard(noteId)) {
					setSingleSelectedItem(noteId);
					return;
				}
			}
			if (groupTarget instanceof HTMLElement && !groupTarget.classList.contains("is-editing")) {
				const groupId = groupTarget.dataset.itemId;
				if (groupId && findGroupInCurrentBoard(groupId)) {
					setSingleSelectedItem(groupId);
					return;
				}
			}
			if (imageTarget instanceof HTMLElement) {
				const imageId = imageTarget.dataset.itemId;
				if (imageId && currentBoard().items.some((item) => item.type === "image" && item.id === imageId)) {
					setSingleSelectedItem(imageId);
					return;
				}
			}

			setSingleSelectedItem(null);
			return;
		}

		const target = event.target instanceof HTMLElement ? event.target : null;
		if (target && target.closest("#context-menu")) {
			return;
		}
		const noteTarget = target?.closest(".note");
		const imageTarget = target?.closest(".image-item");
		const clickedNoteId =
			noteTarget instanceof HTMLElement && !noteTarget.classList.contains("is-editing")
				? noteTarget.dataset.itemId ?? null
				: null;
		const clickedImageId =
			imageTarget instanceof HTMLElement ? imageTarget.dataset.itemId ?? null : null;

		const clickedItemId = clickedNoteId ?? clickedImageId;
		if (!clickedItemId || clickedItemId === connectionDraft.fixedItemId) {
			clearConnectionPreview();
			return;
		}

		const clickedItem = currentBoard().items.find((item) => item.id === clickedItemId);
		const fixedItem = currentBoard().items.find((item) => item.id === connectionDraft.fixedItemId);
		if (!clickedItem || !fixedItem) {
			clearConnectionPreview();
			return;
		}

		const fromItemId = connectionDraft.fixedItemId;
		const toItemId = clickedItemId;

		const isSupportedDirection =
			(fixedItem.type === "note" && (clickedItem.type === "note" || clickedItem.type === "image")) ||
			(fixedItem.type === "image" && clickedItem.type === "note");
		if (!isSupportedDirection) {
			clearConnectionPreview();
			return;
		}

		const hasDuplicate = currentBoard().connections.some(
			(connection) =>
				connection.fromItemId === fromItemId &&
				connection.toItemId === toItemId,
		);

		if (!hasDuplicate) {
			currentBoard().connections.push({
				id: createId(),
				fromItemId,
				toItemId,
			});
		}

		clearConnectionPreview();
		renderConnections();
	});

	dom.canvas.addEventListener("pointerdown", (event) => {
		if (event.button !== 0) {
			return;
		}
		if (connectionDraft) {
			return;
		}

		const target = event.target instanceof Element ? event.target : null;
		if (
			!target ||
			target.closest(".item") ||
			target.closest("#context-menu") ||
			target.closest("#text-toolbar") ||
			target.closest(".toolbar") ||
			target.closest("[data-connection-id]")
		) {
			return;
		}

		marqueeStartPoint = getRelativePoint(dom.canvas, event.clientX, event.clientY);
		marqueeCurrentPoint = marqueeStartPoint;
		updateMarqueeVisual();
		setSelectedItems(new Set<string>());
	});

	document.addEventListener("pointermove", (event) => {
		if (!marqueeStartPoint) {
			return;
		}

		marqueeCurrentPoint = getRelativePoint(dom.canvas, event.clientX, event.clientY);
		updateMarqueeVisual();
		updateMarqueeSelection();
	});

	document.addEventListener("pointerup", () => {
		if (!marqueeStartPoint) {
			return;
		}
		suppressNextCanvasClick = true;
		stopMarqueeSelection();
	});

	dom.createNoteAction.addEventListener("click", () => {
		if (!contextMenuState || contextMenuState.type !== "canvas") {
			return;
		}
		createNoteAt(contextMenuState.point.x, contextMenuState.point.y);
		closeContextMenu();
	});

	dom.createGroupAction.addEventListener("click", () => {
		if (!contextMenuState || contextMenuState.type !== "canvas") {
			return;
		}
		createGroupAt(contextMenuState.point.x, contextMenuState.point.y);
		closeContextMenu();
	});

	dom.createImageAction.addEventListener("click", () => {
		if (!contextMenuState || contextMenuState.type !== "canvas") {
			return;
		}
		const point = contextMenuState.point;
		closeContextMenu();
		void createImageAt(point.x, point.y);
	});

	dom.renameGroupAction.addEventListener("click", () => {
		if (!contextMenuState || contextMenuState.type !== "group") {
			return;
		}
		startGroupEditingById(contextMenuState.groupId);
		closeContextMenu();
	});

	dom.replaceGroupBgAction.addEventListener("click", () => {
		if (!contextMenuState || contextMenuState.type !== "group") {
			return;
		}

		const group = findGroupInCurrentBoard(contextMenuState.groupId);
		if (!group) {
			closeContextMenu();
			return;
		}

		const picker = document.createElement("input");
		picker.type = "file";
		picker.accept = "image/*";
		picker.style.display = "none";
		document.body.appendChild(picker);

		picker.addEventListener("change", () => {
			const file = picker.files?.[0];
			if (!file || !file.type.startsWith("image/")) {
				picker.remove();
				return;
			}

			const reader = new FileReader();
			reader.onload = () => {
				if (typeof reader.result === "string") {
					group.backgroundImageUrl = reader.result;
					renderBoard();
				}
				picker.remove();
			};
			reader.onerror = () => {
				picker.remove();
			};
			reader.readAsDataURL(file);
		});

		picker.addEventListener("cancel", () => {
			picker.remove();
		});

		closeContextMenu();
		picker.click();
	});

	dom.connectNoteAction.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();

		if (
			!contextMenuState ||
			(contextMenuState.type !== "note" && contextMenuState.type !== "image")
		) {
			return;
		}
		beginConnectionFromItem(
			contextMenuState.type === "note" ? contextMenuState.noteId : contextMenuState.imageId,
		);
	});

	dom.deleteGroupAction.addEventListener("click", () => {
		if (!contextMenuState || contextMenuState.type !== "group") {
			return;
		}

		if (!removeGroupById(contextMenuState.groupId)) {
			closeContextMenu();
			return;
		}
		renderBoard();
		closeContextMenu();
	});

	dom.deleteNoteAction.addEventListener("click", () => {
		if (!contextMenuState || contextMenuState.type !== "note") {
			return;
		}

		if (!removeNoteById(contextMenuState.noteId)) {
			closeContextMenu();
			return;
		}
		renderBoard();
		closeContextMenu();
	});

	dom.deleteImageAction.addEventListener("click", () => {
		if (!contextMenuState || contextMenuState.type !== "image") {
			return;
		}

		if (!removeImageById(contextMenuState.imageId)) {
			closeContextMenu();
			return;
		}
		renderBoard();
		closeContextMenu();
	});

	dom.deleteConnectionAction.addEventListener("click", () => {
		if (!contextMenuState || contextMenuState.type !== "connection") {
			return;
		}

		const index = currentBoard().connections.findIndex(
			(connection) => connection.id === contextMenuState.connectionId,
		);
		if (index === -1) {
			closeContextMenu();
			return;
		}

		currentBoard().connections.splice(index, 1);
		renderConnections();
		closeContextMenu();
	});

	dom.boldAction.addEventListener("mousedown", (event) => {
		event.preventDefault();
	});

	dom.boldAction.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();
		if (!activeRichEditor || !activeRichNote) {
			return;
		}
		activeRichEditor.focus();
		const hasSelectedText = hasTextSelectionInEditor(activeRichEditor);
		document.execCommand("bold");
		activeRichEditor.dispatchEvent(new Event("input", { bubbles: true }));
		if (!hasSelectedText) {
			activeRichNote.typingBold = Boolean(document.queryCommandState("bold"));
		}
		refreshBoldButtonState();
	});

	document.addEventListener("selectionchange", () => {
		if (!activeRichEditor) {
			return;
		}
		refreshBoldButtonState();
	});

	document.addEventListener("pointerdown", (event) => {
		const target = event.target;
		if (activeRichEditor) {
			const clickedInsideToolbar =
				target instanceof HTMLElement && target.closest("#text-toolbar");
			const clickedInsideEditor =
				target instanceof Node && activeRichEditor.contains(target);

			if (!clickedInsideToolbar && !clickedInsideEditor) {
				activeRichEditor.blur();
				hideTextToolbar();
			}
		}

		if (
			connectionDraft &&
			!(
				target instanceof HTMLElement &&
				(target.closest(".note") || target.closest(".image-item"))
			)
		) {
			clearConnectionPreview();
		}
		if (target instanceof HTMLElement && target.closest("#context-menu")) {
			return;
		}
		closeContextMenu();
	});

	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape") {
			if (activeRichEditor) {
				activeRichEditor.blur();
			}
			closeContextMenu();
			clearConnectionPreview();
			setSingleSelectedItem(null);
			stopMarqueeSelection();
		}

		if (event.key === "Delete") {
			const target = event.target;
			if (
				activeRichEditor ||
				(target instanceof HTMLElement &&
					(target.tagName === "INPUT" ||
						target.tagName === "TEXTAREA" ||
						target.isContentEditable))
			) {
				return;
			}
			if (selectedItemIds.size === 0) {
				return;
			}

			event.preventDefault();
			let removedAny = false;
			const selectedIds = Array.from(selectedItemIds);
			for (const id of selectedIds) {
				const item = currentBoard().items.find((candidate) => candidate.id === id);
				if (!item) {
					continue;
				}
				const removed =
					item.type === "note"
						? removeNoteById(id)
						: item.type === "group"
							? removeGroupById(id)
							: removeImageById(id);
				removedAny = removedAny || removed;
			}
			if (removedAny) {
				selectedItemIds.clear();
				renderBoard();
			}
		}
	});

	renderBoard();
}
