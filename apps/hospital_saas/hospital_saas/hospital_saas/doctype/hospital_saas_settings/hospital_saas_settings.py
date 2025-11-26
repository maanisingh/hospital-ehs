"""
Hospital SAAS Settings

Single DocType for global Hospital SAAS configuration.
"""

import frappe
from frappe.model.document import Document


class HospitalSAASSettings(Document):
    pass


def get_settings():
    """Get Hospital SAAS Settings"""
    return frappe.get_single("Hospital SAAS Settings")
