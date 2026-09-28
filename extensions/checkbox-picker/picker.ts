import { Editor, type EditorTheme, Key, matchesKey, truncateToWidth, type TUI, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { PickerItem, PickerSection } from "./types.ts";

/** Structural subset of pi's theme used by this component. */
export interface PickerTheme {
	fg(color: string, text: string): string;
	bold(text: string): string;
}

export interface CheckboxPickerOptions {
	title: string;
	summary?: string;
	submitLabel?: string;
	timestamp?: string;
	preselected?: string[];
}

/** What the picker hands back on submit: the chosen subset plus every margin note. */
export interface PickerSubmission {
	ids: string[];
	notes: Record<string, string>;
}

type RowKind = "section" | "item" | "submit";

interface Row {
	kind: RowKind;
	sectionIdx: number;
	itemIdx: number;
}

interface Span {
	rowIdx: number;
	start: number;
	end: number;
}

const TAG_COLORS: Record<string, string> = {
	h: "error",
	high: "error",
	m: "warning",
	medium: "warning",
	l: "muted",
	low: "muted",
};

const NOTE_MARK = "✎";

/** Rows reserved for the app's own chrome around a custom component. */
const CHROME_RESERVE = 6;

function terminalHeight(): number {
	const rows = typeof process !== "undefined" ? process.stdout?.rows : undefined;
	return Math.max(12, (rows || 24) - CHROME_RESERVE);
}

/**
 * Grouped checkbox picker: every row is independently selectable, the whole
 * subset is committed once at submit, and any row — selected or not — can carry
 * a margin note. Sections are grouping and bulk-select scope only; they are not
 * selectable themselves.
 */
export class CheckboxPicker {
	onSubmit?: (submission: PickerSubmission) => void;
	/** Cancel still reports the notes, so nothing the user typed is lost. */
	onCancel?: (notes: Record<string, string>) => void;

	private readonly rows: Row[] = [];
	/** Row indices the cursor can land on (items plus the submit row). */
	private readonly nav: number[] = [];
	private cursor = 0;
	private readonly selected = new Set<string>();
	private readonly notes = new Map<string, string>();
	private editMode = false;
	private scroll = 0;
	private cache?: { width: number; height: number; lines: string[] };
	private readonly editor: Editor;

	private _focused = false;
	/** Focusable: propagates to the embedded editor so the hardware cursor tracks it for IME. */
	get focused(): boolean {
		return this._focused;
	}
	set focused(value: boolean) {
		this._focused = value;
		this.editor.focused = value && this.editMode;
	}

	constructor(
		private readonly sections: PickerSection[],
		private readonly opts: CheckboxPickerOptions,
		private readonly theme: PickerTheme,
		tui: TUI,
	) {
		const editorTheme: EditorTheme = {
			borderColor: (s: string) => theme.fg("accent", s),
			selectList: {
				selectedPrefix: (t: string) => theme.fg("accent", t),
				selectedText: (t: string) => theme.fg("accent", t),
				description: (t: string) => theme.fg("muted", t),
				scrollInfo: (t: string) => theme.fg("dim", t),
				noMatch: (t: string) => theme.fg("warning", t),
			},
		};
		this.editor = new Editor(tui, editorTheme, { paddingX: 1 });
		this.editor.onSubmit = (value: string) => this.saveNote(value);

		sections.forEach((section, sectionIdx) => {
			this.rows.push({ kind: "section", sectionIdx, itemIdx: -1 });
			section.items.forEach((_item, itemIdx) => {
				this.rows.push({ kind: "item", sectionIdx, itemIdx });
				this.nav.push(this.rows.length - 1);
			});
		});
		this.rows.push({ kind: "submit", sectionIdx: -1, itemIdx: -1 });
		this.nav.push(this.rows.length - 1);
		for (const id of opts.preselected ?? []) this.selected.add(id);
	}

	// ── State ──────────────────────────────────────────────────────────

	private get totalItems(): number {
		return this.nav.length - 1; // the submit row is navigable but not an item
	}

	private get noteCount(): number {
		return this.notes.size;
	}

	private rowIdx(): number {
		return this.nav[Math.min(this.cursor, this.nav.length - 1)] ?? 0;
	}

	private currentSectionIdx(): number {
		return this.rows[this.rowIdx()]?.sectionIdx ?? -1;
	}

	private itemAt(rowIdx: number): PickerItem | undefined {
		const row = this.rows[rowIdx];
		if (!row || row.kind !== "item") return undefined;
		return this.sections[row.sectionIdx]?.items[row.itemIdx];
	}

	/** Item ids in row order, optionally restricted to one section. */
	private idsInSection(sectionIdx: number | null): string[] {
		const ids: string[] = [];
		for (const navIdx of this.nav) {
			const row = this.rows[navIdx];
			if (!row || row.kind !== "item") continue;
			if (sectionIdx !== null && row.sectionIdx !== sectionIdx) continue;
			const item = this.sections[row.sectionIdx]?.items[row.itemIdx];
			if (item) ids.push(item.id);
		}
		return ids;
	}

	private bulk(sectionIdx: number | null, select: boolean): void {
		const ids = this.idsInSection(sectionIdx);
		const allOn = ids.length > 0 && ids.every((id) => this.selected.has(id));
		// Toggling "select all" over an already-complete set clears it instead.
		const apply = select && !allOn;
		for (const id of ids) {
			if (apply) this.selected.add(id);
			else this.selected.delete(id);
		}
		this.dirty();
	}

	private move(delta: number): void {
		this.cursor = Math.max(0, Math.min(this.nav.length - 1, this.cursor + delta));
		this.dirty();
	}

	private pageSize(): number {
		return Math.max(3, terminalHeight() - 10);
	}

	private dirty(): void {
		this.cache = undefined;
	}

	private startNote(): void {
		const item = this.itemAt(this.rowIdx());
		if (!item) return; // the submit row carries no note
		this.editor.setText(this.notes.get(item.id) ?? "");
		this.editMode = true;
		this.editor.focused = this._focused;
		this.dirty();
	}

	private saveNote(value: string): void {
		const item = this.itemAt(this.rowIdx());
		if (item) {
			const note = value.trim();
			if (note) this.notes.set(item.id, note);
			else this.notes.delete(item.id);
		}
		this.editMode = false;
		this.editor.focused = false;
		this.editor.setText("");
		this.dirty();
	}

	private cancelNote(): void {
		this.editMode = false;
		this.editor.focused = false;
		this.editor.setText("");
		this.dirty();
	}

	private notesSnapshot(): Record<string, string> {
		const notes: Record<string, string> = {};
		for (const [id, note] of this.notes) notes[id] = note;
		return notes;
	}

	private submit(): void {
		const ids = this.idsInSection(null).filter((id) => this.selected.has(id));
		this.onSubmit?.({ ids, notes: this.notesSnapshot() });
	}

	// ── Input ──────────────────────────────────────────────────────────

	handleInput(data: string): void {
		if (this.editMode) {
			// The editor owns every key except the escape that abandons the note.
			if (matchesKey(data, Key.escape)) {
				this.cancelNote();
				return;
			}
			this.editor.handleInput(data);
			this.dirty();
			return;
		}

		if (matchesKey(data, Key.escape)) {
			this.onCancel?.(this.notesSnapshot());
			return;
		}
		if (matchesKey(data, Key.enter)) {
			this.submit();
			return;
		}
		if (matchesKey(data, Key.tab)) {
			this.startNote();
			return;
		}
		if (matchesKey(data, Key.up) || data === "k") {
			this.move(-1);
			return;
		}
		if (matchesKey(data, Key.down) || data === "j") {
			this.move(1);
			return;
		}
		if (matchesKey(data, Key.pageUp)) {
			this.move(-this.pageSize());
			return;
		}
		if (matchesKey(data, Key.pageDown)) {
			this.move(this.pageSize());
			return;
		}
		if (matchesKey(data, Key.home) || data === "g") {
			this.cursor = 0;
			this.dirty();
			return;
		}
		if (matchesKey(data, Key.end) || data === "G") {
			this.cursor = this.nav.length - 1;
			this.dirty();
			return;
		}
		if (matchesKey(data, Key.space) || data === " ") {
			const item = this.itemAt(this.rowIdx());
			if (!item) {
				// Space on the submit row commits, same as Enter.
				this.submit();
				return;
			}
			if (this.selected.has(item.id)) this.selected.delete(item.id);
			else this.selected.add(item.id);
			this.dirty();
			return;
		}
		if (data === "a") {
			this.bulk(this.currentSectionIdx(), true);
			return;
		}
		if (data === "n") {
			this.bulk(this.currentSectionIdx(), false);
			return;
		}
		if (data === "A") {
			this.bulk(null, true);
			return;
		}
		if (data === "N" || data === "0") {
			this.bulk(null, false);
			return;
		}
	}

	// ── Render ─────────────────────────────────────────────────────────

	invalidate(): void {
		this.editor.invalidate();
		this.dirty();
	}

	private wrap(text: string, width: number): string[] {
		return wrapTextWithAnsi(text, Math.max(8, width));
	}

	/** Indent that aligns detail and note text under the row's label. */
	private detailIndent(id: string): string {
		return " ".repeat(Math.min(16, Math.max(6, 1 + 1 + 3 + 1 + visibleWidth(id) + 2)));
	}

	private renderItemRow(width: number, item: PickerItem, isCursor: boolean, isSelected: boolean): string {
		const marker = isCursor ? this.theme.fg("accent", ">") : " ";
		const box = isSelected ? this.theme.fg("success", "[x]") : this.theme.fg("dim", "[ ]");
		const idText = this.theme.fg(isCursor ? "accent" : "muted", item.id);
		const hasNote = this.notes.has(item.id);
		const noteMark = hasNote ? " " + this.theme.fg(isCursor ? "accent" : "muted", NOTE_MARK) : "";
		const fixed = 1 + 1 + 3 + 1 + visibleWidth(item.id) + 2 + (hasNote ? 1 + visibleWidth(NOTE_MARK) : 0);
		const tagText = (item.tag ?? "").trim() ? `[${(item.tag as string).trim()}]` : "";
		const tagColor = TAG_COLORS[((item.tag ?? "").trim()).toLowerCase()] ?? "dim";
		let tagRoom = tagText ? tagText.length + 2 : 0;
		let avail = width - fixed - tagRoom - 1;
		if (avail < 12 && tagText) {
			// Label wins over tag on narrow terminals.
			tagRoom = 0;
			avail = width - fixed - 1;
		}
		const plainLabel = avail > 4 ? truncateToWidth(item.label, avail) : "";
		const label = isCursor ? this.theme.bold(this.theme.fg("text", plainLabel)) : this.theme.fg("text", plainLabel);
		const tag = tagRoom ? "  " + this.theme.fg(tagColor, tagText) : "";
		return truncateToWidth(`${marker} ${box} ${idText}  ${label}${tag}${noteMark}`, width);
	}

	/** Detail and note lines for the row under the cursor. */
	private renderCursorExtras(width: number, item: PickerItem, out: string[]): void {
		const indent = this.detailIndent(item.id);
		const innerWidth = Math.max(8, width - indent.length);
		const detail = (item.detail ?? "").trim();
		if (detail) {
			for (const raw of detail.replace(/\r\n?/g, "\n").split("\n")) {
				const text = raw.trimEnd();
				if (!text) {
					out.push("");
					continue;
				}
				for (const line of this.wrap(this.theme.fg("muted", text), innerWidth)) out.push(indent + line);
			}
		}

		if (this.editMode) {
			out.push(indent + this.theme.fg("accent", `note on ${item.id}:`));
			for (const line of this.editor.render(innerWidth)) out.push(indent + line);
			out.push(indent + this.theme.fg("dim", "Enter save · Esc discard note"));
			return;
		}

		const note = this.notes.get(item.id);
		if (note) {
			for (const raw of note.replace(/\r\n?/g, "\n").split("\n")) {
				const text = raw.trimEnd();
				if (!text) continue;
				const lines = this.wrap(text, innerWidth - 6);
				lines.forEach((line, i) => {
					const prefix = i === 0 ? this.theme.fg("accent", "note: ") : "      ";
					out.push(indent + prefix + this.theme.fg("text", line));
				});
			}
		} else if (detail) {
			out.push(indent + this.theme.fg("dim", "TAB adds a note to this row"));
		}
	}

	private renderBody(width: number): { lines: string[]; spans: Span[] } {
		const lines: string[] = [];
		const spans: Span[] = [];
		const cursorRow = this.rowIdx();

		this.rows.forEach((row, rowIdx) => {
			const start = lines.length;

			if (row.kind === "section") {
				const section = this.sections[row.sectionIdx];
				if (section) {
					if (lines.length > 0) lines.push("");
					for (const line of this.wrap(this.theme.bold(this.theme.fg("accent", section.heading)), width - 2)) lines.push(" " + line);
					const context = (section.context ?? "").trim();
					if (context) {
						lines.push("");
						for (const line of this.wrap(this.theme.fg("muted", context), width - 4)) lines.push("   " + line);
					}
					lines.push("");
				}
			} else if (row.kind === "item") {
				const item = this.itemAt(rowIdx);
				if (item) {
					const isCursor = rowIdx === cursorRow;
					lines.push(this.renderItemRow(width, item, isCursor, this.selected.has(item.id)));
					if (isCursor) this.renderCursorExtras(width, item, lines);
				}
			} else {
				lines.push("");
				const isCursor = rowIdx === cursorRow;
				const label = (this.opts.submitLabel ?? "").trim() || "Submit";
				const noted = this.noteCount > 0 ? `, ${this.noteCount} noted` : "";
				const text = `✓ ${label} (${this.selected.size} of ${this.totalItems}${noted})`;
				const prefix = isCursor ? this.theme.fg("accent", "> ") : "  ";
				const body = isCursor ? this.theme.bold(this.theme.fg("accent", text)) : this.theme.fg("dim", text);
				lines.push(truncateToWidth(prefix + body, width));
			}

			spans.push({ rowIdx, start, end: lines.length });
		});

		return { lines, spans };
	}

	private clampScroll(spans: Span[], totalLines: number, bodyHeight: number): void {
		const span = spans.find((s) => s.rowIdx === this.rowIdx());
		if (span) {
			if (span.start < this.scroll) this.scroll = span.start;
			else if (span.end > this.scroll + bodyHeight) this.scroll = span.end - bodyHeight;
		}
		this.scroll = Math.max(0, Math.min(this.scroll, Math.max(0, totalLines - bodyHeight)));
	}

	render(width: number): string[] {
		const height = terminalHeight();
		if (this.cache && this.cache.width === width && this.cache.height === height) return this.cache.lines;

		const w = Math.max(24, width);
		const rule = this.theme.fg("accent", "─".repeat(w));

		const head: string[] = [rule];
		for (const line of this.wrap(" " + this.theme.bold(this.theme.fg("accent", this.opts.title)), w)) head.push(line);
		const summary = (this.opts.summary ?? "").trim();
		if (summary) {
			head.push("");
			for (const line of this.wrap(summary, w - 2)) head.push(" " + line);
		}
		head.push("");

		const body = this.renderBody(w);
		const footHeight = 3; // count line, help line, closing rule
		const bodyHeight = Math.max(3, height - head.length - footHeight);
		this.clampScroll(body.spans, body.lines.length, bodyHeight);
		const end = Math.min(body.lines.length, this.scroll + bodyHeight);
		const start = Math.max(0, Math.min(this.scroll, end - bodyHeight));
		this.scroll = start;
		const windowed = body.lines.slice(start, end);

		const chosen = this.selected.size;
		const range = body.lines.length > windowed.length ? ` · rows ${start + 1}-${end} of ${body.lines.length}` : "";
		const stamp = (this.opts.timestamp ?? "").trim() ? "   " + (this.opts.timestamp as string).trim() : "";
		const notes = this.noteCount > 0 ? ` · ${this.noteCount} ${NOTE_MARK}` : "";
		const foot: string[] = [
			truncateToWidth(
				" " + this.theme.fg(chosen > 0 ? "success" : "muted", `selected ${chosen} of ${this.totalItems}`) + this.theme.fg("dim", notes + range + stamp),
				w,
			),
			truncateToWidth(" " + this.theme.fg("dim", "SPACE toggle · TAB note · ↑↓ move · a/n section · A/N all · ENTER submit · ESC cancel"), w),
			rule,
		];

		const lines = [...head, ...windowed, ...foot];
		this.cache = { width, height, lines };
		return lines;
	}
}
