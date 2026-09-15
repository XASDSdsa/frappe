export default class ListSettings {
	constructor({ listview, doctype, meta, settings }) {
		if (!doctype) {
			frappe.throw("DocType required");
		}

		this.listview = listview;
		this.doctype = doctype;
		this.meta = meta;
		this.settings = settings;
		this.dialog = null;
		this.fields =
			this.settings && this.settings.fields ? JSON.parse(this.settings.fields) : [];
		this.subject_field = null;
		this.field_settings = {};
		this.max_number_of_fields = 50;

		frappe.model.with_doctype("List View Settings", () => {
			this.make();
			this.get_listview_fields(meta);
			this.setup_fields();
			this.setup_remove_fields();
			this.add_new_fields();
			this.show_dialog();
		});
	}

	make() {
		let me = this;

		let list_view_settings = frappe.get_meta("List View Settings");

		me.dialog = new frappe.ui.Dialog({
			title:
				me.doctype === "List View Settings"
					? __("List View Settings")
					: __("{0} List View Settings", [__(me.doctype)]),
			fields: list_view_settings.fields,
		});
		me.dialog.set_values(me.settings);
		me.dialog.set_primary_action(__("Save"), () => {
			if (!me.update_fields()) return;
			let values = me.dialog.get_values();
			if (!values) return;

			frappe.show_alert({
				message: __("Saving"),
				indicator: "green",
			});

			frappe.call({
				method: "frappe.desk.doctype.list_view_settings.list_view_settings.save_listview_settings",
				args: {
					doctype: me.doctype,
					listview_settings: values,
					removed_listview_fields: me.removed_fields || [],
				},
				callback: function (r) {
					me.listview.refresh_columns(r.message.meta, r.message.listview_settings);
					me.dialog.hide();
				},
			});
		});
	}

	refresh() {
		let me = this;

		me.setup_fields();
		me.add_new_fields();
		me.setup_remove_fields();
	}

	show_dialog() {
		let me = this;

		me.update_fields();

		if (!me.dialog.get_value("total_fields")) {
			let field_count = this.settings.total_fields;

			if (!field_count) {
				field_count = me.fields.length;
				if (field_count < 4) {
					field_count = 4;
				} else if (field_count > 10) {
					field_count = 10;
				}
			}

			me.dialog.set_value("total_fields", field_count);
		}

		me.dialog.show();
	}

	setup_fields() {
		function is_status_field(field) {
			return field.fieldname === "status_field";
		}

		let me = this;

		let fields_html = me.dialog.get_field("fields_html");
		let wrapper = fields_html.$wrapper[0];
		let fields = ``;

		for (let idx in me.fields) {
			if (idx == parseInt(this.max_number_of_fields)) {
				break;
			}
			const fixed = idx == 0 || me.is_fixed_name(me.fields[idx]);
			let is_sortable = fixed ? `` : `sortable`;
			let show_sortable_handle = fixed ? `hide` : ``;
			let can_remove =
				idx == 0 || is_status_field(me.fields[idx]) || me.is_fixed_name(me.fields[idx])
					? `hide`
					: `d-flex`;
			const label = frappe.utils.escape_html(me.fields[idx].label);
			const width = Number(me.fields[idx].width);

			fields += `
				<div class="control-input form-control fields_order ${is_sortable} flex"
	 				style="margin-bottom: 5px; padding-bottom: 1.5px;"
	 				data-fieldname="${me.fields[idx].fieldname}"
					data-label="${label}"
	 				data-type="${me.fields[idx].type}">

					<div class="row flex-fill align-items-center">
						<div class="col-1 d-flex align-items-center justify-content-center px-1">
							${frappe.utils.icon("drag", "xs", "", "", "sortable-handle " + show_sortable_handle)}
						</div>

						<div class="col d-flex align-items-center px-0">
							${__(me.fields[idx].label, null, me.doctype)}
						</div>

						<div class="col-4 px-2">
							<input type="number" class="form-control input-xs column-width"
								min="60" max="1200" step="1"
								value="${Number.isInteger(width) && width >= 60 && width <= 1200 ? width : ""}"
								placeholder="${__("Automatic")}" aria-label="${__("Column Width (px)")}">
						</div>

						<div class="col-1 d-flex align-items-center justify-content-center px-0">
							<a class="text-muted remove-field align-items-center ${can_remove}"
							   data-fieldname="${me.fields[idx].fieldname}">
								${frappe.utils.icon("x", "xs")}
							</a>
						</div>
					</div>
				</div>`;
		}

		fields_html.html(`
			<div class="form-group">
				<div class="clearfix">
					<label class="control-label" style="padding-right: 0px;">${__("Fields")}</label>
					<label class="text-extra-muted float-right">
						<a class="add-new-fields text-muted">
							${__("+ Add / Remove Fields")}
						</a>
					</label>
				</div>
				<div class="text-muted small mb-2">${__("Column Width (px)")}: ${__(
					"Leave blank for automatic width."
				)}</div>
				<div class="control-input-wrapper">
				${fields}
				</div>
			</div>
		`);

		new Sortable(wrapper.getElementsByClassName("control-input-wrapper")[0], {
			handle: ".sortable-handle",
			draggable: ".sortable",
			onUpdate: () => {
				if (me.update_fields()) me.refresh();
			},
		});
	}

	add_new_fields() {
		let me = this;

		let fields_html = me.dialog.get_field("fields_html");
		let add_new_fields = fields_html.$wrapper[0].getElementsByClassName("add-new-fields")[0];
		add_new_fields.onclick = () => me.column_selector();
	}

	setup_remove_fields() {
		let me = this;

		let fields_html = me.dialog.get_field("fields_html");
		let remove_fields = fields_html.$wrapper[0].getElementsByClassName("remove-field");

		for (let idx = 0; idx < remove_fields.length; idx++) {
			remove_fields.item(idx).onclick = () =>
				me.remove_fields(remove_fields.item(idx).getAttribute("data-fieldname"));
		}
	}

	remove_fields(fieldname) {
		let me = this;
		if (!me.update_fields()) return;
		let existing_fields = me.fields.map((f) => f.fieldname);

		for (let idx in me.fields) {
			let field = me.fields[idx];

			if (field.fieldname == fieldname) {
				me.fields.splice(idx, 1);
				break;
			}
		}
		me.set_removed_fields(
			me.get_removed_listview_fields(
				me.fields.map((f) => f.fieldname),
				existing_fields
			)
		);
		me.refresh();
		me.update_fields();
	}

	update_fields() {
		let me = this;

		let fields_html = me.dialog.get_field("fields_html");
		let wrapper = fields_html.$wrapper[0];

		let fields_order = wrapper.getElementsByClassName("fields_order");
		let fields = [];

		for (let idx = 0; idx < fields_order.length; idx++) {
			const row = fields_order.item(idx);
			const input = row.querySelector(".column-width");
			if (!input.checkValidity()) {
				input.reportValidity();
				return false;
			}
			const field = {
				fieldname: row.getAttribute("data-fieldname"),
				label: row.getAttribute("data-label"),
			};
			if (input.value !== "") field.width = Number(input.value);
			fields.push(field);
		}

		me.fields = fields;
		for (const field of fields) me.field_settings[field.fieldname] = { ...field };
		me.dialog.set_value("fields", JSON.stringify(me.fields));
		return true;
	}

	column_selector() {
		let me = this;
		if (!me.update_fields()) return;

		let d = new frappe.ui.Dialog({
			title: __("{0} Fields", [__(me.doctype)]),
			fields: [
				{
					label: __("Reset Fields"),
					fieldtype: "Button",
					fieldname: "reset_fields",
					click: () => me.reset_listview_fields(d),
				},
				{
					label: __("Select Fields (Up to {0})", [this.max_number_of_fields]),
					fieldtype: "MultiCheck",
					fieldname: "fields",
					options: me.get_doctype_fields(
						me.meta,
						me.fields.map((f) => f.fieldname)
					),
					columns: 2,
				},
			],
		});
		d.set_primary_action(__("Save"), () => {
			let values = d.get_values().fields;

			me.set_removed_fields(
				me.get_removed_listview_fields(
					values,
					me.fields.map((f) => f.fieldname)
				)
			);

			// Retain the order and widths of selected columns, then append new ones.
			me.fields = me.fields.filter(
				(field, index) =>
					index === 0 ||
					field.fieldname === "status_field" ||
					me.is_fixed_name(field) ||
					values.includes(field.fieldname)
			);
			for (const fieldname of values) {
				if (me.fields.length >= me.max_number_of_fields) break;
				if (me.fields.some((field) => field.fieldname === fieldname)) continue;
				const field = me.listview.get_column_docfield(fieldname);
				if (field) {
					const new_field = {
						...me.field_settings[fieldname],
						label: field.label,
						fieldname,
					};
					const name_index = me.fields.findIndex((value) => me.is_fixed_name(value));
					if (name_index > 0) me.fields.splice(name_index, 0, new_field);
					else me.fields.push(new_field);
				}
			}

			me.refresh();
			me.dialog.set_value("fields", JSON.stringify(me.fields));
			d.hide();
		});
		d.show();
	}

	reset_listview_fields(dialog) {
		let me = this;

		frappe
			.xcall(
				"frappe.desk.doctype.list_view_settings.list_view_settings.get_default_listview_fields",
				{
					doctype: me.doctype,
				}
			)
			.then((fields) => {
				fields.push(
					...me.listview
						.get_additional_columns()
						.filter((df) => df.in_list_view)
						.map((df) => df.fieldname)
				);
				let field = dialog.get_field("fields");
				field.df.options = me.get_doctype_fields(me.meta, fields);
				dialog.refresh();
			});
	}

	get_listview_fields(meta) {
		let me = this;
		const saved = me.fields;
		// Use exactly the visible native columns, including display-only columns.
		me.fields = me.listview.columns
			.filter((col) => col.df?.fieldname)
			.map((col) => {
				const field = { label: col.df.label, fieldname: col.df.fieldname };
				const previous = saved.find((value) => value.fieldname === field.fieldname);
				const width = me.settings.fields ? previous?.width : col.additional && col.df.width;
				if (width) field.width = width;
				return field;
			})
			.uniqBy((field) => field.fieldname);
		me.subject_field = me.fields[0];
	}

	is_fixed_name(field) {
		return (
			field.fieldname === "name" &&
			this.meta.title_field &&
			!this.listview.settings.hide_name_column
		);
	}

	set_list_view_fields(meta) {
		let me = this;

		me.set_subject_field(meta);
		me.set_status_field();

		[...meta.fields, ...me.listview.get_additional_columns()].forEach((field) => {
			if (
				field.in_list_view &&
				!field.is_virtual &&
				!(frappe.has_indicator(me.doctype) && field.fieldname === "status") &&
				!frappe.model.no_value_type.includes(field.fieldtype) &&
				me.subject_field.fieldname != field.fieldname
			) {
				me.fields.push({
					label: field.label,
					fieldname: field.fieldname,
				});
			}
		});
	}

	set_subject_field(meta) {
		let me = this;

		me.subject_field = {
			label: "ID",
			fieldname: "name",
		};

		if (meta.title_field) {
			let field = frappe.meta.get_docfield(me.doctype, meta.title_field.trim());

			me.subject_field = {
				label: field.label,
				fieldname: field.fieldname,
			};
		}

		me.fields.push(me.subject_field);
	}

	set_status_field() {
		let me = this;

		if (frappe.has_indicator(me.doctype)) {
			me.fields.push({
				type: "Status",
				label: "Status",
				fieldname: "status_field",
			});
		}
	}

	get_doctype_fields(meta, fields) {
		let multiselect_fields = [];

		[...meta.fields, ...this.listview.get_additional_columns()].forEach((field) => {
			if (
				!frappe.model.no_value_type.includes(field.fieldtype) &&
				!field.is_virtual &&
				!(frappe.has_indicator(this.doctype) && field.fieldname === "status")
			) {
				multiselect_fields.push({
					label: __(field.label, null, field.doctype),
					value: field.fieldname,
					checked: fields.includes(field.fieldname),
				});
			}
		});

		return multiselect_fields;
	}

	get_removed_listview_fields(new_fields, existing_fields) {
		let me = this;
		let removed_fields = [];

		if (frappe.has_indicator(me.doctype)) {
			new_fields.push("status_field");
		}

		existing_fields.forEach((column) => {
			if (!new_fields.includes(column)) {
				removed_fields.push(column);
			}
		});

		return removed_fields;
	}

	set_removed_fields(fields) {
		let me = this;

		if (me.removed_fields) {
			me.removed_fields = me.removed_fields.concat(fields);
		} else {
			me.removed_fields = fields;
		}
	}
}
