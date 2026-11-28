import { GROUP_WIDTH, type GroupItem } from "../model";

export interface GroupItemRenderDeps {
	growGroupWidthToFitTitle: (
		groupItem: HTMLElement,
		input: HTMLInputElement,
		group: GroupItem,
	) => void;
	reflowContainingOrganizer: (item: GroupItem) => void;
	refreshBoardHeader: () => void;
	exitInlineEditMode: (container: HTMLElement, input: HTMLInputElement) => void;
	openBoard: (group: GroupItem) => void;
}

export function createGroupItemElement(
	item: GroupItem,
	focusInput: boolean,
	deps: GroupItemRenderDeps,
): HTMLElement {
	const groupItem = document.createElement("div");
	groupItem.className = "group-item item";
	if (!item.width) {
		item.width = GROUP_WIDTH;
	}
	groupItem.style.width = `${item.width}px`;
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
		deps.growGroupWidthToFitTitle(groupItem, input, item);
		deps.reflowContainingOrganizer(item);
		deps.refreshBoardHeader();
	});

	input.addEventListener("blur", () => {
		if (!input.value.trim()) {
			input.value = "Untitled group";
		}
		item.title = input.value;
		item.board.title = item.title;
		deps.growGroupWidthToFitTitle(groupItem, input, item);
		deps.reflowContainingOrganizer(item);
		deps.exitInlineEditMode(groupItem, input);
		deps.refreshBoardHeader();
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
		deps.openBoard(item);
	});

	groupItem.appendChild(input);

	if (focusInput) {
		queueMicrotask(() => {
			groupItem.classList.add("is-editing");
			input.disabled = false;
			input.focus();
			input.select();
		});
	}

	return groupItem;
}
