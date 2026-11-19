import interact from "interactjs";

const NOTE_WIDTH = 240;
const NOTE_HEIGHT = 46;
const GROUP_WIDTH = 150;
const GROUP_HEIGHT = 44;
const EDGE_PADDING = 12;
const CONTEXT_MENU_WIDTH = 170;
const CONTEXT_MENU_HEIGHT = 84;

type Point = { x: number; y: number };

type CanvasItem = NoteItem | GroupItem;

interface Board {
	id: string;
	title: string;
	items: CanvasItem[];
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

interface DomRefs {
	canvas: HTMLElement;
	contextMenu: HTMLElement;
	createNoteAction: HTMLButtonElement;
	createGroupAction: HTMLButtonElement;
	deleteGroupAction: HTMLButtonElement;
	boardBreadcrumbs: HTMLElement;
}

type ContextMenuState =
	| { type: "canvas"; point: Point }
	| { type: "group"; groupId: string };

function createId(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return crypto.randomUUID();
	}
	return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createBoard(title: string): Board {
	return { id: createId(), title, items: [] };
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
	const deleteGroupAction = document.getElementById("delete-group-action");
	const boardBreadcrumbs = document.getElementById("board-breadcrumbs");

	if (
		!(canvas instanceof HTMLElement) ||
		!(contextMenu instanceof HTMLElement) ||
		!(createNoteAction instanceof HTMLButtonElement) ||
		!(createGroupAction instanceof HTMLButtonElement) ||
		!(deleteGroupAction instanceof HTMLButtonElement) ||
		!(boardBreadcrumbs instanceof HTMLElement)
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
		deleteGroupAction,
		boardBreadcrumbs,
	};

	let contextMenuState: ContextMenuState | null = null;
	const rootBoard = createBoard("Home");
	const boardStack: Board[] = [rootBoard];

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
		dom.deleteGroupAction.hidden = true;
	}

	function showGroupMenu(groupId: string): void {
		contextMenuState = { type: "group", groupId };
		dom.createNoteAction.hidden = true;
		dom.createGroupAction.hidden = true;
		dom.deleteGroupAction.hidden = false;
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

	function makeDraggable(element: HTMLElement, item: CanvasItem): void {
		interact(element).draggable({
			ignoreFrom: "input",
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
				},
			},
		});
	}

	function renderItem(item: CanvasItem, focusInput = false): void {
		let element: HTMLElement;

		if (item.type === "note") {
			const note = document.createElement("div");
			note.className = "note item";
			const input = document.createElement("input");
			input.type = "text";
			input.placeholder = "Write a note…";
			input.value = item.text;
			input.setAttribute("aria-label", "Note content");
			input.disabled = true;
			input.addEventListener("input", () => {
				item.text = input.value;
			});
			note.addEventListener("dblclick", (event) => {
				event.preventDefault();
				event.stopPropagation();
				note.classList.add("is-editing");
				input.disabled = false;
				input.focus();
				input.select();
			});
			input.addEventListener("blur", () => {
				input.disabled = true;
				note.classList.remove("is-editing");
			});
			input.addEventListener("keydown", (event) => {
				if (event.key === "Enter" || event.key === "Escape") {
					input.blur();
				}
			});
			note.appendChild(input);
			element = note;

			if (focusInput) {
				queueMicrotask(() => {
					note.classList.add("is-editing");
					input.disabled = false;
					input.focus();
				});
			}
		} else {
			const groupButton = document.createElement("button");
			groupButton.type = "button";
			groupButton.className = "group-item item";
			groupButton.textContent = item.title;
			groupButton.setAttribute("aria-label", `Open group ${item.title}`);
			groupButton.addEventListener("dblclick", (event) => {
				event.preventDefault();
				event.stopPropagation();
				boardStack.push(item.board);
				renderBoard();
			});
			element = groupButton;
		}

		element.dataset.itemId = item.id;
		element.dataset.itemType = item.type;
		element.style.left = `${item.x}px`;
		element.style.top = `${item.y}px`;
		dom.canvas.appendChild(element);
		makeDraggable(element, item);
	}

	function renderBoard(): void {
		closeContextMenu();
		for (const element of dom.canvas.querySelectorAll(".item")) {
			element.remove();
		}
		for (const item of currentBoard().items) {
			renderItem(item);
		}
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
		renderItem(group);
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

		if (target && target.closest(".note")) {
			closeContextMenu();
			return;
		}

		const relative = getRelativePoint(dom.canvas, event.clientX, event.clientY);
		const groupTarget = target?.closest(".group-item");

		if (groupTarget instanceof HTMLElement) {
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
			dom.deleteGroupAction.hidden ? CONTEXT_MENU_HEIGHT : 52,
		);
		dom.contextMenu.style.left = `${clampedMenu.x}px`;
		dom.contextMenu.style.top = `${clampedMenu.y}px`;
		dom.contextMenu.hidden = false;
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

	document.addEventListener("pointerdown", (event) => {
		const target = event.target;
		if (target instanceof HTMLElement && target.closest("#context-menu")) {
			return;
		}
		closeContextMenu();
	});

	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape") {
			closeContextMenu();
		}
	});

	renderBoard();
}
