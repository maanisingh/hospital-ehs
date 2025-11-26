"""
Patient Document Events

Handles events triggered on Patient documents.
"""

import frappe
from frappe import _


def after_insert(doc, method=None):
    """
    Called after a new Patient is created.
    - Assigns hospital based on creator's hospital
    - Creates welcome notification
    - Triggers any integrations
    """
    # Auto-assign hospital if not set
    if not doc.get("custom_hospital"):
        assign_hospital_to_patient(doc)

    # Send welcome notification/email if enabled
    send_patient_welcome(doc)

    # Log patient creation
    frappe.logger("hospital_saas").info(
        f"New patient created: {doc.name} - {doc.patient_name}"
    )


def assign_hospital_to_patient(doc):
    """Assign the creating user's hospital to the patient"""
    from hospital_saas.permissions import get_user_hospital

    hospital = get_user_hospital()
    if hospital:
        frappe.db.set_value("Patient", doc.name, "custom_hospital", hospital)
        doc.custom_hospital = hospital


def send_patient_welcome(doc):
    """Send welcome communication to new patient"""
    settings = frappe.get_single("Hospital SAAS Settings")

    if not settings.enable_email_notifications:
        return

    if not doc.email:
        return

    try:
        # Check if welcome template exists
        if frappe.db.exists("Email Template", "Patient Welcome"):
            frappe.sendmail(
                recipients=[doc.email],
                subject=_("Welcome to {0}").format(
                    frappe.db.get_single_value("Website Settings", "app_name") or "Hospital"
                ),
                template="Patient Welcome",
                args={
                    "patient_name": doc.patient_name,
                    "patient_id": doc.name,
                },
                delayed=True
            )
    except Exception as e:
        frappe.logger("hospital_saas").error(f"Failed to send welcome email: {e}")


def before_save(doc, method=None):
    """
    Called before Patient is saved.
    - Validates required fields
    - Formats data
    """
    # Format phone number if present
    if doc.mobile:
        doc.mobile = format_phone_number(doc.mobile)


def on_update(doc, method=None):
    """
    Called when Patient is updated.
    """
    pass


def format_phone_number(phone):
    """Basic phone number formatting"""
    if not phone:
        return phone

    # Remove common separators
    cleaned = ''.join(c for c in phone if c.isdigit() or c == '+')
    return cleaned
