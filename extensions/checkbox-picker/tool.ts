import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { CheckboxPicker, type PickerTheme } from "./picker.ts";
import type { CheckboxPickerResult, PickerSelection } from "./types.ts";

const PickerItemSchema = Type.Object({
	id: Type.String({
		description:
			"Short stable identifier for this row, 3-6 characters (e.g. 'BND1', 'fix-7'). Returned verbatim in the selection, so it must be unique across the whole picker and meaningful out of context.",
	}),
	label: Type.String({
		description: "One-line description of the item, about eight words. This is the scannable text on the row itself.",
	}),
	detail: Type.Optional(
		Type.String({
			description:
				"Actionable specifics rendered expanded under the row while the cursor is on it: file:symbol, the exact mechanism, the decisive evidence. Keep to 1-4 lines. The reader must be able to locate and act on the item from this text alone. Newlines are preserved; do not pad with prose that repeats the label.",
		}),
	),
	tag: Type.Optional(
		Type.String({
			description:
				"Optional short tag rendered in brackets at the end of the row, e.g. 'H', 'M', 'L', 'new', 'verified'. Tags 'H'/'high', 'M'/'medium', 'L'/'low' are color-coded.",
		}),
	),
});

const PickerSectionSchema = Type.Object({
	heading: Type.String({ description: "Section heading, e.g. 'TIER 1 — EXTERNAL CONTENT INTO THE SYSTEM PROMPT'." }),
	context: Type.Optional(
		Type.String({
			description:
				"One or two sentences of context shared by every item in this section. State it once here; never repeat it in each item's detail.",
		}),
	),
	items: Type.Array(PickerItemSchema, { description: "The selectable rows in this section." }),
});

const CheckboxPickerParams = Type.Object({
	title: Type.String({ description: "Heading shown at the top of the picker, e.g. 'CATEGORY C2 — Untrusted-content boundary'." }),
	summary: Type.Optional(
		Type.String({
			description:
				"Plain factual statement of what is being decided, 2-5 short lines: what is true, how many items are in scope. No dramatic prose — the reader decides from this plus the rows.",
		}),
	),
	sections: Type.Array(PickerSectionSchema, {
		description: "Grouped items. Sections provide visual grouping and the scope for the a/n bulk keys; they are not selectable themselves.",
	}),
	submitLabel: Type.Optional(Type.String({ description: "Label for the submit row. Defaults to 'Submit'." })),
	timestamp: Type.Optional(Type.String({ description: "Optional stamp rendered in the footer, e.g. '[11:02pm - 9/16/26]'." })),
	preselected: Type.Optional(
		Type.Array(Type.String(), { description: "Item ids that start checked, e.g. every item already independently verified." }),
	),
});

function errorResult(message: string, title = ""): { content: Array<{ type: "text"; text: string }>; details: CheckboxPickerResult } {
	return {
		content: [{ type: "text" as const, text: message }],
		details: { title, selected: [], unselected: [], cancelled: true },
	};
}

interface FlatItem {
	id: string;
	label: string;
	tag?: string;
	section: string;
}

function flatten(sections: Array<{ heading: string; items?: Array<{ id: string; label: string; tag?: string }> }>): FlatItem[] {
	const out: FlatItem[] = [];
	for (const section of sections) {
		for (const item of section.items ?? []) {
			out.push({ id: item.id, label: item.label, tag: item.tag, section: section.heading });
		}
	}
	return out;
}

function withNotes(items: FlatItem[], notes: Record<string, string>): PickerSelection[] {
	return items.map((item) => (notes[item.id] ? { ...item, note: notes[item.id] } : { ...item }));
}

export function installCheckboxPickerTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "checkbox_picker",
		label: "Checkbox Picker",
		description:
			"Present a grouped list the user cherry-picks from: SPACE toggles each row independently, TAB attaches a margin note to any row (selected or not), and ENTER submits the whole subset at once. Returns the selected items, the items left unchecked, and every note keyed to its row. Use this when the decision is WHICH items to act on — findings to fix, files to include, tasks to run, options to keep. Use `questionnaire` instead when the decision is a single mutually-exclusive choice among approaches.",
		promptSnippet:
			"Multi-select cherry-picker with per-row margin notes: the user toggles any subset with SPACE, annotates rows with TAB, and submits once; returns selected, unselected, and notes",
		promptGuidelines: [
			"Choose checkbox_picker when the answer is a subset (which of these do we act on); choose questionnaire when the answer is one mutually-exclusive choice (which approach).",
			"Rows are the unit of decision. Give each a 3-6 char id, an ~8-word label, and a `detail` carrying the actionable specifics — location, mechanism, evidence — so the user can act from the row alone.",
			"Put shared context in the section's `context`, stated once. Never repeat it per item.",
			"State the problem plainly in `summary`: what is true and how many items are in scope. No dramatic framing.",
			"Group rows into sections by the thing that makes them similar to fix or decide together — the section is also the scope of the a/n bulk-select keys.",
			"The selection IS the strategy: do not also offer approach-level options. If the user checks every row, that is 'do all of them'.",
			"Margin notes come back attached to their row, on selected and unselected rows alike. Read them as binding instructions: a note on a selected row adjusts HOW to implement it; a note on an unchecked row usually records why it stays as-is — often a code comment to leave behind so a future pass does not re-flag it. Act on every note; never discard one silently.",
			"Use `preselected` for items already confirmed or already agreed, so the user only reviews the remainder.",
			"Keep the picker to roughly 5-25 rows. Beyond that, split by category and ask in sequence.",
		],
		parameters: CheckboxPickerParams,

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (ctx.mode !== "tui") {
				return errorResult("Checkbox picker cancelled: interactive TUI mode is required.", params?.title ?? "");
			}
			const sections = Array.isArray(params?.sections) ? params.sections : [];
			const items = flatten(sections);
			if (items.length === 0) {
				return errorResult("Checkbox picker cancelled: no selectable items were provided.", params?.title ?? "");
			}
			const seen = new Set<string>();
			for (const item of items) {
				if (!item.id || !item.id.trim()) {
					return errorResult(`Checkbox picker cancelled: an item is missing its id (${item.label}).`, params.title);
				}
				if (seen.has(item.id)) {
					return errorResult(`Checkbox picker cancelled: duplicate item id '${item.id}'. Ids must be unique across the whole picker.`, params.title);
				}
				seen.add(item.id);
			}

			const title = params.title ?? "";
			const result = await ctx.ui.custom<CheckboxPickerResult>((tui, theme, _kb, done) => {
				const pickerTheme: PickerTheme = {
					fg: (color: string, text: string) => theme.fg(color as never, text),
					bold: (text: string) => theme.bold(text),
				};
				const picker = new CheckboxPicker(
					sections,
					{
						title,
						summary: params.summary,
						submitLabel: params.submitLabel,
						timestamp: params.timestamp,
						preselected: Array.isArray(params.preselected) ? params.preselected : [],
					},
					pickerTheme,
					tui,
				);

				picker.onSubmit = ({ ids, notes }) => {
					const chosen = new Set(ids);
					done({
						title,
						selected: withNotes(
							items.filter((item) => chosen.has(item.id)),
							notes,
						),
						unselected: withNotes(
							items.filter((item) => !chosen.has(item.id)),
							notes,
						),
						cancelled: false,
					});
				};
				// A cancelled pick still reports its notes: nothing the user typed is thrown away.
				picker.onCancel = (notes) =>
					done({
						title,
						selected: [],
						unselected: withNotes(items, notes),
						cancelled: true,
					});

				return {
					render: (width: number) => picker.render(width),
					invalidate: () => picker.invalidate(),
					handleInput: (data: string) => {
						picker.handleInput(data);
						tui.requestRender();
					},
					// Focusable container: propagate focus so the embedded editor positions the
					// hardware cursor correctly for IME input while a note is being written.
					get focused(): boolean {
						return picker.focused;
					},
					set focused(value: boolean) {
						picker.focused = value;
					},
				};
			});

			if (result.cancelled) {
				const noted = result.unselected.filter((item) => item.note);
				const lines = ["User cancelled the checkbox picker."];
				if (noted.length > 0) {
					lines.push(
				"",
				"Notes written before cancelling (still binding — act on them):",
				...noted.map((item) => `- ${item.id}: ${item.note}`),
			);
				}
				return { content: [{ type: "text", text: lines.join("\n") }], details: result };
			}

			const noteCount = [...result.selected, ...result.unselected].filter((item) => item.note).length;
			const lines: string[] = [`Selected ${result.selected.length} of ${items.length} item(s).`];
			if (noteCount > 0) lines.push(`${noteCount} margin note(s) attached — each is a binding instruction for its row.`);
			if (result.selected.length > 0) lines.push("", "Selected:", ...result.selected.map(itemRow));
			if (result.unselected.length > 0) lines.push("", "Left unchecked:", ...result.unselected.map(itemRow));
			return { content: [{ type: "text", text: lines.join("\n") }], details: result };
		},

		renderCall(args, theme) {
			const title = (args?.title as string) || "";
			const sections = (args?.sections as Array<{ items?: unknown[] }>) || [];
			const count = sections.reduce((n, s) => n + (s.items?.length ?? 0), 0);
			let text =
				theme.fg("toolTitle", theme.bold("checkbox_picker ")) +
				theme.fg("muted", `${count} item${count === 1 ? "" : "s"} in ${sections.length} section${sections.length === 1 ? "" : "s"}`);
			if (title) text += theme.fg("dim", ` — ${title}`);
			return new Text(text, 0, 0);
		},

		renderResult(result, _options, theme) {
			const details = result?.details as CheckboxPickerResult | undefined;
			if (!details) {
				const first = result?.content?.[0];
				return new Text(first?.type === "text" ? first.text : "", 0, 0);
			}
			const notes = [...details.selected, ...details.unselected].filter((item) => item.note).length;
			const noted = notes > 0 ? theme.fg("dim", `, ${notes} noted`) : "";
			if (details.cancelled) return new Text(theme.fg("warning", `Checkbox picker cancelled${noted}`), 0, 0);
			const ids = details.selected.map((item) => item.id).join(", ");
			const head = `${theme.fg("success", "✓")} ${details.selected.length} selected${noted}`;
			return new Text(ids ? `${head}: ${theme.fg("accent", ids)}` : head, 0, 0);
		},
	});
}

function itemRow(item: PickerSelection): string {
	const head = `- ${item.id}: ${item.label}${item.tag ? ` [${item.tag}]` : ""}`;
	if (!item.note) return head;
	const noteLines = item.note.replace(/\r\n?/g, "\n").split("\n");
	return [head, ...noteLines.map((line) => `    note: ${line}`)].join("\n");
}

