from io import BytesIO

from frappe.gettext.extractors.javascript import extract, extract_javascript
from frappe.tests import IntegrationTestCase


class TestJavaScript(IntegrationTestCase):
	def test_extract_javascript(self):
		code = "let test = `<p>${__('Test')}</p>`;"
		self.assertEqual(
			next(extract_javascript(code)),
			(1, "__", "Test"),
		)

		code = "let test = `<p>${__('Test', null, 'Context')}</p>`;"
		self.assertEqual(
			next(extract_javascript(code)),
			(1, "__", ("Test", None, "Context")),
		)

	def test_extract_javascript_from_template_literal_attribute(self):
		code = "let test = `<button title=\"${__('In attribute')}\">${__('In text')}</button>`;"
		self.assertEqual(
			list(extract_javascript(code)),
			[(1, "__", "In attribute"), (1, "__", "In text")],
		)

	def test_extract_javascript_template_literal_multiline_line_numbers(self):
		code = "let test = `\n<button title=\"${__('In attribute')}\">\n  ${__('In text')}\n</button>\n`;"
		self.assertEqual(
			list(extract_javascript(code)),
			[(2, "__", "In attribute"), (3, "__", "In text")],
		)

	def test_extract_javascript_from_tsx(self):
		code = 'const Demo = ({ name }: { name: string }) => <div>{_("Hello {0}", [name])}</div>;'
		self.assertEqual(
			list(extract(BytesIO(code.encode()), {"_": None}, (), {})),
			[(1, "gettext", "Hello {0}", [])],
		)
