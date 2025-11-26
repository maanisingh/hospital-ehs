"""
Jinja Template Methods for Hospital SAAS
"""

import frappe
from frappe.utils import today


def get_hospital_name(hospital):
    """Get hospital name from hospital ID"""
    if not hospital:
        return ""
    return frappe.db.get_value("Hospital", hospital, "hospital_name") or hospital


def get_queue_count(hospital, status=None):
    """Get queue count for a hospital"""
    if not hospital:
        return 0

    filters = {
        "hospital": hospital,
        "token_date": today()
    }

    if status:
        filters["status"] = status

    return frappe.db.count("OPD Token", filters)
