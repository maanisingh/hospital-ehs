"""
Lab Queue Display Page Controller

Displays lab test queue status for patients to see
which tests are being processed.
"""

import frappe
from frappe import _


def get_context(context):
    """Get context for lab queue page"""
    hospital = frappe.form_dict.get("hospital")

    context.no_cache = 1
    context.show_sidebar = False

    if hospital:
        try:
            hospital_doc = frappe.get_doc("Hospital", hospital)
            context.hospital = hospital
            context.hospital_name = hospital_doc.business_name
            context.footer_text = hospital_doc.dashboard_footer_text
        except Exception:
            context.hospital = None
            context.hospital_name = "Lab Queue"
            context.footer_text = "Hospital Management System"
    else:
        context.hospital = None
        context.hospital_name = "Lab Queue"
        context.footer_text = "Hospital Management System"

    return context
