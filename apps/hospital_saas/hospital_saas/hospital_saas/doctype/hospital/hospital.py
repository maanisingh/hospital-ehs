"""
Hospital DocType

This DocType represents a Hospital or Clinic entity in the multi-tenant
Hospital SAAS system. Each hospital is a separate tenant with its own
data isolation.
"""

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate, nowdate


class Hospital(Document):
    def validate(self):
        """Validate hospital data before saving"""
        self.validate_license_expiry()
        self.generate_hospital_code()

    def validate_license_expiry(self):
        """Check if license is expiring soon"""
        if self.license_expiry_date:
            expiry_date = getdate(self.license_expiry_date)
            today = getdate(nowdate())
            days_until_expiry = (expiry_date - today).days

            if days_until_expiry < 0:
                frappe.msgprint(
                    _("Hospital license has expired!"),
                    indicator="red",
                    alert=True
                )
            elif days_until_expiry < 30:
                frappe.msgprint(
                    _("Hospital license will expire in {0} days").format(days_until_expiry),
                    indicator="orange",
                    alert=True
                )

    def generate_hospital_code(self):
        """Auto-generate hospital code if not provided"""
        if not self.hospital_code:
            # Generate code from first 3 letters of name + random number
            prefix = "".join(self.hospital_name.split()[:2])[:4].upper()
            count = frappe.db.count("Hospital", {"hospital_code": ["like", f"{prefix}%"]})
            self.hospital_code = f"{prefix}{str(count + 1).zfill(3)}"

    def on_update(self):
        """Actions after hospital is updated"""
        self.update_related_records()

    def update_related_records(self):
        """Update any records that reference this hospital"""
        pass  # Will be implemented when Department and other DocTypes are ready

    def before_save(self):
        """Actions before saving"""
        if self.status == "Active" and not self.admin_user:
            frappe.msgprint(
                _("Consider assigning an Admin User for this hospital"),
                indicator="yellow"
            )

    @frappe.whitelist()
    def get_department_count(self):
        """Get count of departments in this hospital"""
        return frappe.db.count("Department", {"hospital": self.name})

    @frappe.whitelist()
    def get_staff_count(self):
        """Get count of staff in this hospital"""
        # Will be implemented when staff management is ready
        return 0

    @frappe.whitelist()
    def get_patient_count(self):
        """Get count of patients registered in this hospital"""
        # Will query patients linked to this hospital
        return 0


def get_active_hospitals():
    """Get list of all active hospitals"""
    return frappe.get_all(
        "Hospital",
        filters={"status": "Active"},
        fields=["name", "hospital_name", "hospital_code", "city"]
    )


@frappe.whitelist()
def get_hospital_stats(hospital_name):
    """Get statistics for a specific hospital"""
    hospital = frappe.get_doc("Hospital", hospital_name)

    return {
        "name": hospital.name,
        "total_beds": hospital.total_beds,
        "icu_beds": hospital.icu_beds,
        "emergency_beds": hospital.emergency_beds,
        "operation_theaters": hospital.operation_theaters,
        "departments": hospital.get_department_count(),
        "staff": hospital.get_staff_count(),
        "patients": hospital.get_patient_count()
    }
