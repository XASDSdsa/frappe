// Run with: node --test frappe/tests/test_list_columns.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function fixture() {
	const meta = {
		fields: [
			{ fieldname: "status", label: "Status", fieldtype: "Select", in_list_view: 1 },
			{ fieldname: "amount", label: "Amount", fieldtype: "Currency", in_list_view: 1 },
		],
	};
	const frappe = {
		views: {},
		provide() {},
		has_indicator: () => true,
		is_mobile: () => false,
		perm: { has_perm: () => true },
		boot: { link_title_doctypes: [] },
		model: {
			std_fields_list: ["name", "modified"],
			no_value_type: [],
			is_value_type: () => true,
			is_numeric_field: () => false,
			get_full_column_name: (field) => field,
		},
		meta: {
			get_docfield: (_, name) => meta.fields.find((df) => df.fieldname === name),
			has_field: (_, name) => meta.fields.some((df) => df.fieldname === name),
		},
	};
	const context = vm.createContext({ frappe, window: { innerWidth: 1600 }, __: (s) => s });
	for (const filename of ["base_list.js", "list_view.js", "list_settings.js"]) {
		const source = fs
			.readFileSync(path.join(__dirname, "../public/js/frappe/list", filename), "utf8")
			.replace(/^import .*;\n/gm, "")
			.replace("export default class ListSettings", "globalThis.ListSettings = class ListSettings");
		vm.runInContext(source, context, { filename });
	}
	const view = Object.assign(Object.create(frappe.views.ListView.prototype), {
		doctype: "Example",
		meta,
		settings: {
			additional_columns: [
				{
					fieldname: "sf_freight",
					label: "Freight",
					fieldtype: "Data",
					in_list_view: 1,
					width: 220,
					insert_after: "status_field",
				},
			],
		},
		fields: [],
		list_view_settings: {},
		column_max_widths: { sf_freight: 180, amount: 150 },
		max_number_of_fields: 50,
		link_field_title_fields: {},
	});
	view.setup_columns();
	return { view, frappe, ListSettings: context.ListSettings };
}

test("display-only columns use native order without becoming query fields or shared metadata", async () => {
	const { view } = fixture();
	assert.deepEqual(Array.from(view.columns, (col) => col.df?.fieldname).filter(Boolean), [
		"name", "status_field", "sf_freight", "amount",
	]);
	await view.set_fields();
	assert(!view.get_fields().includes("sf_freight"));
	assert(!view.meta.fields.some((df) => df.fieldname === "sf_freight"));
	const header = view.get_header_html();
	assert(header.includes('data-fieldname="sf_freight"'));
	assert(header.includes('data-fieldname="status_field"'));
	assert(!header.includes('data-sort-by="sf_freight"'));
	assert(!header.includes('data-sort-by="status_field"'));
});

test("saved visibility and order are respected, and report views get no synthetic columns", () => {
	const { view } = fixture();
	view.list_view_settings.fields = JSON.stringify([
		{ fieldname: "name" }, { fieldname: "amount" }, { fieldname: "status_field" },
	]);
	view.setup_columns();
	assert.deepEqual(Array.from(view.columns, (col) => col.df?.fieldname).filter(Boolean), [
		"name", "amount", "status_field",
	]);
	Object.defineProperty(view, "view_name", { value: "Report" });
	assert.equal(view.get_additional_columns().length, 0);
});

test("fixed widths apply equally to header and rows; clearing restores native sizing", () => {
	const { view, frappe } = fixture();
	const cells = ["sf_freight", "sf_freight", "amount"].map((fieldname) => ({
		dataset: { fieldname }, style: {},
	}));
	const collection = (items) => ({
		css(styles) { items.forEach((cell) => Object.assign(cell.style, styles)); },
		filter(fn) { return collection(items.filter((cell, i) => fn(i, cell))); },
	});
	view.$result = { find: () => collection(cells) };
	view.apply_column_widths();
	assert.equal(cells[0].style.width, 220);
	view.list_view_settings.fields = JSON.stringify([{ fieldname: "sf_freight", width: 340 }]);
	view.apply_column_widths();
	for (const cell of cells.slice(0, 2)) {
		assert.equal(cell.style.width, 340);
		assert.equal(cell.style.flex, "0 0 340px");
	}
	view.list_view_settings.fields = JSON.stringify([{ fieldname: "sf_freight" }]);
	view.apply_column_widths();
	assert.equal(cells[0].style.width, 180);
	assert.equal(cells[0].style.flex, "1 0 180px");
	assert.equal(cells[0].style.maxWidth, "");
	frappe.is_mobile = () => true;
	view.apply_column_widths();
	assert.equal(cells[0].style.width, "");
});

test("settings save widths with reordered canonical labels, clear widths and reject invalid inputs", () => {
	const { ListSettings } = fixture();
	const settings = Object.assign(Object.create(ListSettings.prototype), { field_settings: {} });
	let saved;
	const values = [
		{ fieldname: "name", label: "ID", width: "" },
		{ fieldname: "sf_freight", label: "Freight", width: "340" },
		{ fieldname: "amount", label: "Amount", width: "200" },
	];
	const rows = values.map((field) => ({
		getAttribute: (key) => field[key.slice(5)],
		querySelector: () => ({
			value: field.width,
			checkValidity: () => field.width === "" ||
				(Number.isInteger(Number(field.width)) && Number(field.width) >= 60 && Number(field.width) <= 1200),
			reportValidity() {},
		}),
	}));
	rows.item = (i) => rows[i];
	settings.dialog = {
		get_field: () => ({ $wrapper: [{ getElementsByClassName: () => rows }] }),
		set_value: (_, value) => { saved = JSON.parse(value); },
	};
	assert(settings.update_fields());
	assert.deepEqual(saved[1], { fieldname: "sf_freight", label: "Freight", width: 340 });
	[rows[1], rows[2]] = [rows[2], rows[1]];
	assert(settings.update_fields());
	assert.equal(saved[2].width, 340);
	values[1].width = "";
	assert(settings.update_fields());
	assert(!Object.hasOwn(saved[2], "width"));
	values[1].width = "59";
	assert.equal(settings.update_fields(), false);
	values[1].width = "240.5";
	assert.equal(settings.update_fields(), false);
});
