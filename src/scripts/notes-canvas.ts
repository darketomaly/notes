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
	backButton: HTMLButtonElement;
	boardLabel: HTMLElement;
}

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
	const backButton = document.getElementById("back-button");
	const boardLabel = document.getElementById("board-label");

	if (
		!(canvas instanceof HTMLElement) ||
		!(contextMenu instanceof HTMLElement) ||
		!(createNoteAction instanceof HTMLButtonElement) ||
		!(createGroupAction instanceof HTMLButtonElement) ||
		!(backButton instanceof HTMLButtonElement) ||
		!(boardLabel instanceof HTMLElement)
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
		backButton,
		boardLabel,
	};

	let contextPoint: Point | null = null;
	const rootBoard = createBoard("Home");
	const boardStack: Board[] = [rootBoard];

	function currentBoard(): Board {
		return boardStack[boardStack.length - 1];
	}

	function closeContextMenu(): void {
		dom.contextMenu.hidden = true;
	}

	function refreshBoardHeader(): void {
		dom.boardLabel.textContent = boardStack.map((board) => board.title).join(" / ");
		dom.backButton.hidden = boardStack.length === 1;
	}

	function canOpenCanvasMenu(eventTarget: EventTarget | null): boolean {
		return !(eventTarget instanceof HTMLElement && eventTarget.closest(".item"));
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
			input.addEventListener("input", () => {
				item.text = input.value;
			});
			note.appendChild(input);
			element = note;

			if (focusInput) {
				queueMicrotask(() => input.focus());
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

		if (!canOpenCanvasMenu(event.target)) {
			closeContextMenu();
			return;
		}

		const relative = getRelativePoint(dom.canvas, event.clientX, event.clientY);
		const clampedMenu = clampToCanvas(
			dom.canvas,
			relative.x,
			relative.y,
			CONTEXT_MENU_WIDTH,
			CONTEXT_MENU_HEIGHT,
		);
		contextPoint = relative;
		dom.contextMenu.style.left = `${clampedMenu.x}px`;
		dom.contextMenu.style.top = `${clampedMenu.y}px`;
		dom.contextMenu.hidden = false;
	});

	dom.createNoteAction.addEventListener("click", () => {
		if (!contextPoint) {
			return;
		}
		createNoteAt(contextPoint.x, contextPoint.y);
		closeContextMenu();
	});

	dom.createGroupAction.addEventListener("click", () => {
		if (!contextPoint) {
			return;
		}
		createGroupAt(contextPoint.x, contextPoint.y);
		closeContextMenu();
	});

	dom.backButton.addEventListener("click", () => {
		if (boardStack.length <= 1) {
			return;
		}
		boardStack.pop();
		renderBoard();
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
