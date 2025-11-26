"""
Department DocType

This DocType represents a department within a Hospital in the
Hospital SAAS system.
"""

import frappe
from frappe import _
from frappe.model.document import Document


class Department(Document):
    def validate(self):
        """Validate department data before saving"""
        self.validate_parent_department()
        self.generate_department_code()

    def validate_parent_department(self):
        """Ensure parent department is from the same hospital"""
        if self.parent_department:
            parent = frappe.get_doc("Department", self.parent_department)
            if parent.hospital != self.hospital:
                frappe.throw(
                    _("Parent department must belong to the same hospital")
                )

    def generate_department_code(self):
        """Auto-generate department code if not provided"""
        if not self.department_code:
            # Get hospital code
            hospital_code = frappe.db.get_value("Hospital", self.hospital, "hospital_code") or "HOSP"
            # Generate code from first 3 letters of department name
            dept_prefix = self.department_name[:3].upper()
            count = frappe.db.count("Department", {
                "hospital": self.hospital,
                "department_code": ["like", f"{hospital_code}-{dept_prefix}%"]
            })
            self.department_code = f"{hospital_code}-{dept_prefix}{str(count + 1).zfill(2)}"

    def on_update(self):
        """Actions after department is updated"""
        pass

    @frappe.whitelist()
    def get_practitioners(self):
        """Get healthcare practitioners in this department"""
        return frappe.get_all(
            "Healthcare Practitioner",
            filters={"department": self.name},
            fields=["name", "practitioner_name", "designation"]
        )

    @frappe.whitelist()
    def get_today_appointments(self):
        """Get today's appointments for this department"""
        from frappe.utils import nowdate
        return frappe.get_all(
            "Patient Appointment",
            filters={
                "department": self.name,
                "appointment_date": nowdate(),
                "status": ["not in", ["Cancelled"]]
            },
            fields=["name", "patient_name", "appointment_time", "status"]
        )


@frappe.whitelist()
def get_departments_by_hospital(hospital):
    """Get all departments for a specific hospital"""
    return frappe.get_all(
        "Department",
        filters={"hospital": hospital, "status": "Active"},
        fields=["name", "department_name", "department_code", "specialization", "department_head"]
    )


@frappe.whitelist()
def get_department_stats(department_name):
    """Get statistics for a specific department"""
    dept = frappe.get_doc("Department", department_name)

    return {
        "name": dept.name,
        "department_name": dept.department_name,
        "consultation_rooms": dept.consultation_rooms,
        "beds_allocated": dept.beds_allocated,
        "daily_opd_capacity": dept.daily_opd_capacity,
        "practitioners": len(dept.get_practitioners()),
        "today_appointments": len(dept.get_today_appointments())
    }
