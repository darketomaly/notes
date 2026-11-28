import { type OrganizerItem } from "../model";

export interface OrganizerItemRenderDeps {
	exitInlineEditMode: (container: HTMLElement, input: HTMLInputElement) => void;
	headerHeight: number;
}

export function createOrganizerItemElement(
	item: OrganizerItem,
	focusInput: boolean,
	deps: OrganizerItemRenderDeps,
): HTMLElement {
	const organizerItem = document.createElement("div");
	organizerItem.className = "organizer-item item";
	organizerItem.style.width = `${item.width}px`;
	organizerItem.style.height = `${item.height}px`;

	const header = document.createElement("div");
	header.className = "organizer-header";

	const titleInput = document.createElement("input");
	titleInput.type = "text";
	titleInput.value = item.title;
	titleInput.disabled = true;
	titleInput.setAttribute("aria-label", `Organizer title ${item.title}`);
	titleInput.addEventListener("input", () => {
		item.title = titleInput.value || "Untitled organizer";
	});
	titleInput.addEventListener("blur", () => {
		if (!titleInput.value.trim()) {
			titleInput.value = "Untitled organizer";
		}
		item.title = titleInput.value;
		deps.exitInlineEditMode(organizerItem, titleInput);
	});
	titleInput.addEventListener("keydown", (event) => {
		if (event.key === "Enter" || event.key === "Escape") {
			titleInput.blur();
		}
	});
	header.appendChild(titleInput);

	const body = document.createElement("div");
	body.className = "organizer-body";

	organizerItem.addEventListener("dblclick", (event) => {
		event.preventDefault();
		event.stopPropagation();
		if (organizerItem.classList.contains("is-editing")) {
			return;
		}
		const pointerY = event.clientY - organizerItem.getBoundingClientRect().top;
		if (pointerY > deps.headerHeight) {
			return;
		}
		organizerItem.classList.add("is-editing");
		titleInput.disabled = false;
		titleInput.focus();
		titleInput.select();
	});

	organizerItem.appendChild(header);
	organizerItem.appendChild(body);

	if (focusInput) {
		queueMicrotask(() => {
			organizerItem.classList.add("is-editing");
			titleInput.disabled = false;
			titleInput.focus();
			titleInput.select();
		});
	}

	return organizerItem;
}
