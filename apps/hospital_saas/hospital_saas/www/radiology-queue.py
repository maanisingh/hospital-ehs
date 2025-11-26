# Copyright (c) 2024, Hospital SAAS and contributors
# For license information, please see license.txt

"""
Radiology Queue Display Page

Public page for displaying radiology department queue
"""

import frappe
from frappe.utils import nowdate

no_cache = 1


def get_context(context):
    """Get context for radiology queue page"""
    context.no_cache = 1
    context.show_sidebar = False

    # Get hospital from route or default
    hospital = frappe.form_dict.get("hospital")

    if hospital:
        context.hospital = frappe.get_doc("Hospital", hospital)
        context.hospital_name = context.hospital.hospital_name
    else:
        context.hospital_name = "Radiology Department"

    context.title = f"Radiology Queue - {context.hospital_name}"

    return context
