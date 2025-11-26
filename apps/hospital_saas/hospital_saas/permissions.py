"""
Hospital SAAS Permission Queries

Multi-tenant permission queries to ensure data isolation between hospitals.
"""

import frappe


def get_user_hospital():
    """Get the hospital associated with the current user"""
    try:
        user = frappe.session.user

        if user == "Administrator":
            return None  # Administrator can see all

        # Check if user has a linked employee with hospital
        try:
            employee = frappe.db.get_value(
                "Employee",
                {"user_id": user},
                ["custom_hospital"],
                as_dict=True
            )
            if employee and employee.get("custom_hospital"):
                return employee.custom_hospital
        except Exception:
            pass

        # Check if user has hospital in User document (custom field)
        try:
            user_hospital = frappe.db.get_value("User", user, "custom_hospital")
            if user_hospital:
                return user_hospital
        except Exception:
            pass

        # Check Healthcare Practitioner link
        try:
            practitioner = frappe.db.get_value(
                "Healthcare Practitioner",
                {"user_id": user},
                ["custom_hospital"],
                as_dict=True
            )
            if practitioner and practitioner.get("custom_hospital"):
                return practitioner.custom_hospital
        except Exception:
            pass

        return None
    except Exception:
        return None


def patient_query(user):
    """
    Permission query for Patient doctype.
    Restricts patients to their associated hospital.
    """
    try:
        if not user or user == "Administrator":
            return ""

        if "System Manager" in frappe.get_roles(user):
            return ""

        hospital = get_user_hospital()

        if hospital:
            escaped = frappe.db.escape(hospital)
            return f"(`tabPatient`.`custom_hospital` = {escaped} OR `tabPatient`.`custom_hospital` IS NULL OR `tabPatient`.`custom_hospital` = '')"

        return ""  # No restriction if no hospital assigned
    except Exception:
        return ""


def appointment_query(user):
    """
    Permission query for Patient Appointment doctype.
    Restricts appointments to the user's hospital.
    """
    try:
        if not user or user == "Administrator":
            return ""

        if "System Manager" in frappe.get_roles(user):
            return ""

        hospital = get_user_hospital()

        if hospital:
            escaped = frappe.db.escape(hospital)
            return f"(`tabPatient Appointment`.`custom_hospital` = {escaped} OR `tabPatient Appointment`.`custom_hospital` IS NULL OR `tabPatient Appointment`.`custom_hospital` = '')"

        return ""
    except Exception:
        return ""


def encounter_query(user):
    """
    Permission query for Patient Encounter doctype.
    """
    try:
        if not user or user == "Administrator":
            return ""

        if "System Manager" in frappe.get_roles(user):
            return ""

        hospital = get_user_hospital()

        if hospital:
            escaped = frappe.db.escape(hospital)
            return f"(`tabPatient Encounter`.`custom_hospital` = {escaped} OR `tabPatient Encounter`.`custom_hospital` IS NULL OR `tabPatient Encounter`.`custom_hospital` = '')"

        return ""
    except Exception:
        return ""


def lab_test_query(user):
    """
    Permission query for Lab Test doctype.
    """
    try:
        if not user or user == "Administrator":
            return ""

        if "System Manager" in frappe.get_roles(user):
            return ""

        hospital = get_user_hospital()

        if hospital:
            escaped = frappe.db.escape(hospital)
            return f"(`tabLab Test`.`custom_hospital` = {escaped} OR `tabLab Test`.`custom_hospital` IS NULL OR `tabLab Test`.`custom_hospital` = '')"

        return ""
    except Exception:
        return ""


def hospital_query(user):
    """
    Generic permission query for hospital-scoped doctypes.
    Used for OPD Token, IPD Admission, and other hospital-specific documents.
    Uses the `hospital` field.
    """
    try:
        if not user or user == "Administrator":
            return ""

        if "System Manager" in frappe.get_roles(user):
            return ""

        hospital = get_user_hospital()

        if hospital:
            escaped = frappe.db.escape(hospital)
            return f"(`hospital` = {escaped} OR `hospital` IS NULL OR `hospital` = '')"

        return ""
    except Exception:
        return ""


def custom_hospital_query(user):
    """
    Permission query for ERPNext DocTypes with custom_hospital field.
    Used for Patient, Patient Encounter, Lab Test, Sales Invoice, etc.
    Uses the `custom_hospital` field.
    """
    try:
        if not user or user == "Administrator":
            return ""

        if "System Manager" in frappe.get_roles(user):
            return ""

        hospital = get_user_hospital()

        if hospital:
            escaped = frappe.db.escape(hospital)
            return f"(`custom_hospital` = {escaped} OR `custom_hospital` IS NULL OR `custom_hospital` = '')"

        return ""
    except Exception:
        return ""


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
