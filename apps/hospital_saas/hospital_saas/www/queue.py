"""
Queue Display Page Context
"""
import frappe


def get_context(context):
    """Get context for queue display page"""
    hospital = frappe.form_dict.get('hospital')

    if hospital:
        context.hospital = hospital
        context.hospital_name = frappe.db.get_value(
            "Hospital", hospital, "hospital_name"
        ) or hospital
    else:
        context.hospital = ""
        context.hospital_name = "Hospital OPD"

    context.no_cache = 1
    context.show_sidebar = False

    return context
