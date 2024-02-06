import frappe
from frappe.www.printview import get_print_format
from frappe.utils import nowdate
from frappe.utils.safe_exec import get_safe_globals
from frappe.utils.user import get_user_fullname

@frappe.whitelist()
def get_print_content(reference_doctype, reference_docname, print_format):
    doc = frappe.get_doc(reference_doctype, reference_docname)
    pf_doc = frappe.get_doc("Print Format", print_format)
    data_to_render = get_print_format(reference_doctype, pf_doc)
    context = get_context(doc)
    template = frappe.render_template(data_to_render, context)
    return {"print_data": template, "raw_printing": pf_doc.raw_printing}



def get_context(doc):
	return {
		"doc": doc,
		"nowdate": nowdate,
		"session_user": get_user_fullname(frappe.session.user),
		"frappe_utils": frappe._dict(utils=get_safe_globals().get("frappe").get("utils")),
	}
