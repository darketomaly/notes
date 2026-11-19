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

type CanvasItem = NoteItem | GroupItem;

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
	text: string;
}

interface GroupItem extends BaseItem {
	type: "group";
	title: string;
	board: Board;
}

interface Connection {
	id: string;
	fromNoteId: string;
	toNoteId: string;
}

interface DomRefs {
	canvas: HTMLElement;
	contextMenu: HTMLElement;
	createNoteAction: HTMLButtonElement;
	createGroupAction: HTMLButtonElement;
	renameGroupAction: HTMLButtonElement;
	deleteGroupAction: HTMLButtonElement;
	connectNoteAction: HTMLButtonElement;
	deleteNoteAction: HTMLButtonElement;
	boardBreadcrumbs: HTMLElement;
	connectionsPermanent: SVGGElement;
	connectionPreview: SVGLineElement;
}

type ContextMenuState =
	| { type: "canvas"; point: Point }
	| { type: "group"; groupId: string }
	| { type: "note"; noteId: string };

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
	const renameGroupAction = document.getElementById("rename-group-action");
	const deleteGroupAction = document.getElementById("delete-group-action");
	const connectNoteAction = document.getElementById("connect-note-action");
	const deleteNoteAction = document.getElementById("delete-note-action");
	const boardBreadcrumbs = document.getElementById("board-breadcrumbs");
	const connectionsPermanent = document.getElementById("connections-permanent");
	const connectionPreview = document.getElementById("connection-preview");

	if (
		!(canvas instanceof HTMLElement) ||
		!(contextMenu instanceof HTMLElement) ||
		!(createNoteAction instanceof HTMLButtonElement) ||
		!(createGroupAction instanceof HTMLButtonElement) ||
		!(renameGroupAction instanceof HTMLButtonElement) ||
		!(deleteGroupAction instanceof HTMLButtonElement) ||
		!(connectNoteAction instanceof HTMLButtonElement) ||
		!(deleteNoteAction instanceof HTMLButtonElement) ||
		!(boardBreadcrumbs instanceof HTMLElement) ||
		!(connectionsPermanent instanceof SVGGElement) ||
		!(connectionPreview instanceof SVGLineElement)
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
		renameGroupAction,
		deleteGroupAction,
		connectNoteAction,
		deleteNoteAction,
		boardBreadcrumbs,
		connectionsPermanent,
		connectionPreview,
	};

	let contextMenuState: ContextMenuState | null = null;
	const rootBoard = createBoard("Home");
	const boardStack: Board[] = [rootBoard];
	const noteElements = new Map<string, HTMLElement>();
	let connectionPreviewFromNoteId: string | null = null;
	let connectionPreviewMousePoint: Point | null = null;

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
		dom.renameGroupAction.hidden = true;
		dom.deleteGroupAction.hidden = true;
		dom.connectNoteAction.hidden = true;
		dom.deleteNoteAction.hidden = true;
	}

	function showGroupMenu(groupId: string): void {
		contextMenuState = { type: "group", groupId };
		dom.createNoteAction.hidden = true;
		dom.createGroupAction.hidden = true;
		dom.renameGroupAction.hidden = false;
		dom.deleteGroupAction.hidden = false;
		dom.connectNoteAction.hidden = true;
		dom.deleteNoteAction.hidden = true;
	}

	function showNoteMenu(noteId: string): void {
		contextMenuState = { type: "note", noteId };
		dom.createNoteAction.hidden = true;
		dom.createGroupAction.hidden = true;
		dom.renameGroupAction.hidden = true;
		dom.deleteGroupAction.hidden = true;
		dom.connectNoteAction.hidden = false;
		dom.deleteNoteAction.hidden = false;
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

	function getMenuHeight(): number {
		const visibleActions = dom.contextMenu.querySelectorAll("button:not([hidden])").length;
		const actionHeight = 38;
		const verticalPadding = 12;
		return Math.max(52, visibleActions * actionHeight + verticalPadding);
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
		connectionPreviewFromNoteId = null;
		connectionPreviewMousePoint = null;
		dom.connectionPreview.hidden = true;
		dom.connectionPreview.style.display = "none";
		dom.connectionPreview.setAttribute("visibility", "hidden");
	}

	function renderConnections(): void {
		const board = currentBoard();
		dom.connectionsPermanent.replaceChildren();

		board.connections = board.connections.filter(
			(connection) =>
				noteElements.has(connection.fromNoteId) && noteElements.has(connection.toNoteId),
		);

		for (const connection of board.connections) {
			const fromElement = noteElements.get(connection.fromNoteId);
			const toElement = noteElements.get(connection.toNoteId);
			if (!fromElement || !toElement) {
				continue;
			}

			const fromCenter = getElementCenter(fromElement);
			const toCenter = getElementCenter(toElement);
			const from = getClosestEdgeAnchor(fromElement, toCenter);
			const to = getClosestEdgeAnchor(toElement, fromCenter);
			const line = document.createElementNS(SVG_NS, "line");
			line.setAttribute("x1", String(from.x));
			line.setAttribute("y1", String(from.y));
			line.setAttribute("x2", String(to.x));
			line.setAttribute("y2", String(to.y));
			line.classList.add("connection-line");
			line.setAttribute("marker-end", "url(#connection-arrowhead)");
			dom.connectionsPermanent.appendChild(line);
		}
	}

	function refreshConnectionPreview(): void {
		if (!connectionPreviewFromNoteId || !connectionPreviewMousePoint) {
			dom.connectionPreview.hidden = true;
			dom.connectionPreview.style.display = "none";
			dom.connectionPreview.setAttribute("visibility", "hidden");
			return;
		}

		const fromElement = noteElements.get(connectionPreviewFromNoteId);
		if (!fromElement) {
			clearConnectionPreview();
			return;
		}

		const from = getClosestEdgeAnchor(fromElement, connectionPreviewMousePoint);
		dom.connectionPreview.setAttribute("x1", String(from.x));
		dom.connectionPreview.setAttribute("y1", String(from.y));
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

	function autoSizeNoteTextarea(textarea: HTMLTextAreaElement): void {
		textarea.style.height = "0px";
		textarea.style.height = `${textarea.scrollHeight}px`;
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
		interact(element).draggable({
			ignoreFrom: "input, textarea",
			listeners: {
				start() {
					closeContextMenu();
				},
				move(event) {
					if (!(event.target instanceof HTMLElement)) {
						return;
					}

					const target = event.target;
					const width = target.offsetWidth || NOTE_WIDTH;
					const height = target.offsetHeight || NOTE_HEIGHT;
					const clamped = clampToCanvas(
						dom.canvas,
						item.x + event.dx,
						item.y + event.dy,
						width,
						height,
					);

					item.x = clamped.x;
					item.y = clamped.y;
					target.style.left = `${item.x}px`;
					target.style.top = `${item.y}px`;
					renderConnections();
					refreshConnectionPreview();
				},
			},
		});
	}

	function renderItem(item: CanvasItem, focusInput = false): void {
		let element: HTMLElement;

		if (item.type === "note") {
			const note = document.createElement("div");
			note.className = "note item";
			const textarea = document.createElement("textarea");
			textarea.placeholder = "Write a note…";
			textarea.value = item.text;
			textarea.rows = 1;
			textarea.setAttribute("aria-label", "Note content");
			textarea.disabled = true;
			textarea.addEventListener("input", () => {
				autoSizeNoteTextarea(textarea);
				item.text = textarea.value;
				renderConnections();
				refreshConnectionPreview();
			});
			note.addEventListener("dblclick", (event) => {
				event.preventDefault();
				event.stopPropagation();
				note.classList.add("is-editing");
				textarea.disabled = false;
				textarea.focus();
				textarea.select();
				autoSizeNoteTextarea(textarea);
			});
			textarea.addEventListener("blur", () => {
				exitInlineEditMode(note, textarea);
				renderConnections();
				refreshConnectionPreview();
			});
			textarea.addEventListener("keydown", (event) => {
				if (event.key === "Escape") {
					textarea.blur();
				}
			});
			note.appendChild(textarea);
			element = note;
			queueMicrotask(() => autoSizeNoteTextarea(textarea));

			if (focusInput) {
				queueMicrotask(() => {
					note.classList.add("is-editing");
					textarea.disabled = false;
					textarea.focus();
					autoSizeNoteTextarea(textarea);
				});
			}
		} else {
			const groupItem = document.createElement("div");
			groupItem.className = "group-item item";
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
		}

		element.dataset.itemId = item.id;
		element.dataset.itemType = item.type;
		element.style.left = `${item.x}px`;
		element.style.top = `${item.y}px`;
		dom.canvas.appendChild(element);
		if (item.type === "note") {
			noteElements.set(item.id, element);
		}
		makeDraggable(element, item);
	}

	function renderBoard(): void {
		closeContextMenu();
		noteElements.clear();
		for (const element of dom.canvas.querySelectorAll(".item")) {
			element.remove();
		}
		for (const item of currentBoard().items) {
			renderItem(item);
		}
		renderConnections();
		refreshConnectionPreview();
		refreshBoardHeader();
	}

	function createNoteAt(positionX: number, positionY: number): void {
		const clamped = clampToCanvas(dom.canvas, positionX, positionY, NOTE_WIDTH, NOTE_HEIGHT);
		const note: NoteItem = {
			id: createId(),
			type: "note",
			x: clamped.x,
			y: clamped.y,
			text: "",
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

	dom.canvas.addEventListener("dblclick", (event) => {
		if (!canOpenCanvasMenu(event.target)) {
			return;
		}

		const relative = getRelativePoint(dom.canvas, event.clientX, event.clientY);
		closeContextMenu();
		createNoteAt(relative.x, relative.y);
	});

	dom.canvas.addEventListener("contextmenu", (event) => {
		event.preventDefault();
		const target = event.target instanceof HTMLElement ? event.target : null;
		const relative = getRelativePoint(dom.canvas, event.clientX, event.clientY);
		const noteTarget = target?.closest(".note");
		const groupTarget = target?.closest(".group-item");

		if (noteTarget instanceof HTMLElement) {
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
		if (!connectionPreviewFromNoteId) {
			return;
		}

		connectionPreviewMousePoint = getRelativePoint(dom.canvas, event.clientX, event.clientY);
		refreshConnectionPreview();
	});

	dom.canvas.addEventListener("click", (event) => {
		if (!connectionPreviewFromNoteId) {
			return;
		}

		const target = event.target instanceof HTMLElement ? event.target : null;
		if (target && target.closest("#context-menu")) {
			return;
		}
		const noteTarget = target?.closest(".note");
		if (!(noteTarget instanceof HTMLElement)) {
			clearConnectionPreview();
			return;
		}
		if (noteTarget.classList.contains("is-editing")) {
			clearConnectionPreview();
			return;
		}

		const toNoteId = noteTarget.dataset.itemId;
		if (!toNoteId || toNoteId === connectionPreviewFromNoteId) {
			clearConnectionPreview();
			return;
		}
		if (!findNoteInCurrentBoard(toNoteId) || !findNoteInCurrentBoard(connectionPreviewFromNoteId)) {
			clearConnectionPreview();
			return;
		}

		const hasDuplicate = currentBoard().connections.some(
			(connection) =>
				connection.fromNoteId === connectionPreviewFromNoteId &&
				connection.toNoteId === toNoteId,
		);

		if (!hasDuplicate) {
			currentBoard().connections.push({
				id: createId(),
				fromNoteId: connectionPreviewFromNoteId,
				toNoteId,
			});
		}

		clearConnectionPreview();
		renderConnections();
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

	dom.renameGroupAction.addEventListener("click", () => {
		if (!contextMenuState || contextMenuState.type !== "group") {
			return;
		}
		startGroupEditingById(contextMenuState.groupId);
		closeContextMenu();
	});

	dom.connectNoteAction.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();

		if (!contextMenuState || contextMenuState.type !== "note") {
			return;
		}

		connectionPreviewFromNoteId = contextMenuState.noteId;
		const sourceElement = noteElements.get(contextMenuState.noteId);
		connectionPreviewMousePoint = sourceElement ? getElementCenter(sourceElement) : null;
		closeContextMenu();
		refreshConnectionPreview();
	});

	dom.deleteGroupAction.addEventListener("click", () => {
		if (!contextMenuState || contextMenuState.type !== "group") {
			return;
		}

		const index = currentBoard().items.findIndex(
			(item) => item.type === "group" && item.id === contextMenuState.groupId,
		);

		if (index === -1) {
			closeContextMenu();
			return;
		}

		currentBoard().items.splice(index, 1);
		renderBoard();
		closeContextMenu();
	});

	dom.deleteNoteAction.addEventListener("click", () => {
		if (!contextMenuState || contextMenuState.type !== "note") {
			return;
		}

		const index = currentBoard().items.findIndex(
			(item) => item.type === "note" && item.id === contextMenuState.noteId,
		);

		if (index === -1) {
			closeContextMenu();
			return;
		}

		const noteId = contextMenuState.noteId;
		currentBoard().items.splice(index, 1);
		currentBoard().connections = currentBoard().connections.filter(
			(connection) =>
				connection.fromNoteId !== noteId && connection.toNoteId !== noteId,
		);
		if (connectionPreviewFromNoteId === noteId) {
			clearConnectionPreview();
		}
		renderBoard();
		closeContextMenu();
	});

	document.addEventListener("pointerdown", (event) => {
		const target = event.target;
		if (
			connectionPreviewFromNoteId &&
			!(target instanceof HTMLElement && target.closest(".note"))
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
			closeContextMenu();
			clearConnectionPreview();
		}
	});

	renderBoard();
}
