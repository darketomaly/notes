import { NOTE_WIDTH, type NoteItem } from "../model";

export interface NoteItemRenderDeps {
	normalizeRichEditorContent: (editor: HTMLElement) => void;
	reflowContainingOrganizer: (item: NoteItem) => void;
	renderConnections: () => void;
	refreshConnectionPreview: () => void;
	positionTextToolbar: (editor: HTMLElement) => void;
	refreshBoldButtonState: () => void;
	showTextToolbarFor: (editor: HTMLElement, note: NoteItem) => void;
	placeCaretNearPoint: (editor: HTMLElement, clientX: number, clientY: number) => void;
	syncEditorTypingBold: (typingBold: boolean) => void;
	clearBrowserSelection: () => void;
	hideTextToolbar: () => void;
}

export function createNoteItemElement(
	item: NoteItem,
	focusInput: boolean,
	deps: NoteItemRenderDeps,
): HTMLElement {
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
		deps.normalizeRichEditorContent(editor);
		item.htmlContent = editor.innerHTML;
		deps.reflowContainingOrganizer(item);
		deps.renderConnections();
		deps.refreshConnectionPreview();
		deps.positionTextToolbar(editor);
		deps.refreshBoldButtonState();
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
		deps.showTextToolbarFor(editor, item);
		deps.placeCaretNearPoint(editor, event.clientX, event.clientY);
		deps.syncEditorTypingBold(item.typingBold);
	});

	editor.addEventListener("blur", () => {
		deps.normalizeRichEditorContent(editor);
		editor.contentEditable = "false";
		note.classList.remove("is-editing");
		item.htmlContent = editor.innerHTML;
		deps.reflowContainingOrganizer(item);
		deps.clearBrowserSelection();
		deps.hideTextToolbar();
		deps.renderConnections();
		deps.refreshConnectionPreview();
	});

	editor.addEventListener("keydown", (event) => {
		if (event.key === "Escape") {
			editor.blur();
		}
	});

	editor.addEventListener("keyup", () => {
		deps.refreshBoldButtonState();
		deps.positionTextToolbar(editor);
	});

	editor.addEventListener("mouseup", () => {
		deps.refreshBoldButtonState();
		deps.positionTextToolbar(editor);
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
		deps.refreshBoldButtonState();
	});

	const resizeHandle = document.createElement("div");
	resizeHandle.className = "item-resize-handle subtle-resize-handle contextual-resize-handle";
	resizeHandle.setAttribute("aria-hidden", "true");

	note.appendChild(editor);
	note.appendChild(resizeHandle);

	if (focusInput) {
		queueMicrotask(() => {
			note.classList.add("is-editing");
			editor.contentEditable = "true";
			editor.focus();
			deps.showTextToolbarFor(editor, item);
			deps.syncEditorTypingBold(item.typingBold);
		});
	}

	return note;
}
