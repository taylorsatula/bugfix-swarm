/** One selectable row in the picker. */
export interface PickerItem {
	/** Short stable identifier returned verbatim in the selection. Unique across the whole brief. */
	id: string;
	/** One-line scannable description shown on the row. */
	label: string;
	/** Actionable detail rendered expanded under the row when the cursor is on it. Newlines preserved. */
	detail?: string;
	/** Optional short tag rendered in brackets at the end of the row. */
	tag?: string;
}

/** Visual grouping and bulk-select scope. Sections are not selectable themselves. */
export interface PickerSection {
	heading: string;
	/** Context shared by every item in this section, stated once. */
	context?: string;
	items: PickerItem[];
}

/** A row as reported back to the agent, including any margin note the user wrote on it. */
export interface PickerSelection {
	id: string;
	label: string;
	tag?: string;
	section: string;
	/** Margin note the user attached with TAB. Present on selected and unselected rows alike. */
	note?: string;
}

export interface CheckboxPickerResult {
	title: string;
	selected: PickerSelection[];
	unselected: PickerSelection[];
	cancelled: boolean;
}
