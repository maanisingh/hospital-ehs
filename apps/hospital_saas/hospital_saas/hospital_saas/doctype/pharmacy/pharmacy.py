# Copyright (c) 2024, Hospital SAAS and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class Pharmacy(Document):
    def validate(self):
        if self.is_default:
            # Unset other default pharmacies for this hospital
            frappe.db.sql("""
                UPDATE `tabPharmacy`
                SET is_default = 0
                WHERE hospital = %s AND name != %s AND is_default = 1
            """, (self.hospital, self.name))

    def before_save(self):
        # Generate pharmacy code if not set
        if not self.pharmacy_code:
            hospital_code = frappe.db.get_value("Hospital", self.hospital, "hospital_code") or "H"
            count = frappe.db.count("Pharmacy", {"hospital": self.hospital}) + 1
            self.pharmacy_code = f"{hospital_code}-PH{count:02d}"


def get_default_pharmacy(hospital=None):
    """Get the default pharmacy for a hospital"""
    filters = {"is_active": 1, "is_default": 1}
    if hospital:
        filters["hospital"] = hospital

    pharmacy = frappe.db.get_value("Pharmacy", filters, "name")

    if not pharmacy and hospital:
        # Get any active pharmacy for the hospital
        pharmacy = frappe.db.get_value(
            "Pharmacy",
            {"is_active": 1, "hospital": hospital},
            "name"
        )

    return pharmacy
