"""
Hospital SAAS Permission Queries

Multi-tenant permission queries to ensure data isolation between hospitals.
"""

import frappe


def get_user_hospital():
    """Get the hospital associated with the current user"""
    user = frappe.session.user

    if user == "Administrator":
        return None  # Administrator can see all

    # Check if user has a linked employee with hospital
    employee = frappe.db.get_value(
        "Employee",
        {"user_id": user},
        ["custom_hospital"],
        as_dict=True
    )

    if employee and employee.get("custom_hospital"):
        return employee.custom_hospital

    # Check if user has hospital in User document (custom field)
    user_hospital = frappe.db.get_value("User", user, "custom_hospital")
    if user_hospital:
        return user_hospital

    # Check Healthcare Practitioner link
    practitioner = frappe.db.get_value(
        "Healthcare Practitioner",
        {"user_id": user},
        ["custom_hospital"],
        as_dict=True
    )

    if practitioner and practitioner.get("custom_hospital"):
        return practitioner.custom_hospital

    return None


def patient_query(user):
    """
    Permission query for Patient doctype.
    Restricts patients to their associated hospital.
    """
    if user == "Administrator":
        return ""

    if "System Manager" in frappe.get_roles(user):
        return ""

    hospital = get_user_hospital()

    if hospital:
        return f"(`tabPatient`.`custom_hospital` = '{hospital}' OR `tabPatient`.`custom_hospital` IS NULL)"

    # If no hospital assigned, only show unassigned patients
    return "`tabPatient`.`custom_hospital` IS NULL"


def appointment_query(user):
    """
    Permission query for Patient Appointment doctype.
    Restricts appointments to the user's hospital.
    """
    if user == "Administrator":
        return ""

    if "System Manager" in frappe.get_roles(user):
        return ""

    hospital = get_user_hospital()

    if hospital:
        return f"(`tabPatient Appointment`.`custom_hospital` = '{hospital}' OR `tabPatient Appointment`.`custom_hospital` IS NULL)"

    return "`tabPatient Appointment`.`custom_hospital` IS NULL"


def encounter_query(user):
    """
    Permission query for Patient Encounter doctype.
    """
    if user == "Administrator":
        return ""

    if "System Manager" in frappe.get_roles(user):
        return ""

    hospital = get_user_hospital()

    if hospital:
        return f"(`tabPatient Encounter`.`custom_hospital` = '{hospital}' OR `tabPatient Encounter`.`custom_hospital` IS NULL)"

    return "`tabPatient Encounter`.`custom_hospital` IS NULL"


def lab_test_query(user):
    """
    Permission query for Lab Test doctype.
    """
    if user == "Administrator":
        return ""

    if "System Manager" in frappe.get_roles(user):
        return ""

    hospital = get_user_hospital()

    if hospital:
        return f"(`tabLab Test`.`custom_hospital` = '{hospital}' OR `tabLab Test`.`custom_hospital` IS NULL)"

    return "`tabLab Test`.`custom_hospital` IS NULL"


def has_hospital_permission(doc, user=None, permission_type=None):
    """
    Standard permission check for hospital-scoped documents.
    Can be used as has_permission hook.
    """
    if not user:
        user = frappe.session.user

    if user == "Administrator":
        return True

    if "System Manager" in frappe.get_roles(user):
        return True

    user_hospital = get_user_hospital()

    if not user_hospital:
        return True  # No hospital restriction

    doc_hospital = doc.get("custom_hospital") or doc.get("hospital")

    if not doc_hospital:
        return True  # Document not assigned to any hospital

    return doc_hospital == user_hospital
