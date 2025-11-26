"""
Patient Appointment Document Events

Handles events triggered on Patient Appointment documents.
"""

import frappe
from frappe import _
from frappe.utils import getdate, get_datetime, now_datetime, add_to_date


def on_submit(doc, method=None):
    """
    Called when appointment is submitted/confirmed.
    - Sends confirmation to patient
    - Creates calendar event
    - Schedules reminder
    """
    # Auto-assign hospital if not set
    if not doc.get("custom_hospital"):
        assign_hospital_to_appointment(doc)

    # Send confirmation
    send_appointment_confirmation(doc)

    # Create invoice if auto-billing enabled
    create_appointment_invoice(doc)

    frappe.logger("hospital_saas").info(
        f"Appointment confirmed: {doc.name} for {doc.patient_name} on {doc.appointment_date}"
    )


def on_cancel(doc, method=None):
    """
    Called when appointment is cancelled.
    - Sends cancellation notice
    - Frees up the time slot
    - Cancels any linked invoices
    """
    send_cancellation_notice(doc)

    # Cancel linked draft invoice if exists
    cancel_draft_invoice(doc)

    frappe.logger("hospital_saas").info(
        f"Appointment cancelled: {doc.name}"
    )


def assign_hospital_to_appointment(doc):
    """Assign hospital based on practitioner or creator"""
    from hospital_saas.permissions import get_user_hospital

    # First try to get from practitioner
    if doc.practitioner:
        practitioner_hospital = frappe.db.get_value(
            "Healthcare Practitioner",
            doc.practitioner,
            "custom_hospital"
        )
        if practitioner_hospital:
            doc.custom_hospital = practitioner_hospital
            return

    # Otherwise use creator's hospital
    hospital = get_user_hospital()
    if hospital:
        doc.custom_hospital = hospital


def send_appointment_confirmation(doc):
    """Send appointment confirmation to patient"""
    settings = frappe.get_single("Hospital SAAS Settings")

    if not settings.enable_email_notifications:
        return

    patient_email = frappe.db.get_value("Patient", doc.patient, "email")
    if not patient_email:
        return

    try:
        practitioner_name = frappe.db.get_value(
            "Healthcare Practitioner",
            doc.practitioner,
            "practitioner_name"
        ) if doc.practitioner else "Doctor"

        subject = _("Appointment Confirmed - {0}").format(doc.appointment_date)

        message = _("""
Dear {patient_name},

Your appointment has been confirmed with the following details:

Date: {date}
Time: {time}
Doctor: {doctor}
Department: {department}

Appointment ID: {appointment_id}

Please arrive 15 minutes before your scheduled time.

Thank you for choosing our hospital.

Best regards,
Hospital Team
        """).format(
            patient_name=doc.patient_name,
            date=doc.appointment_date,
            time=doc.appointment_time,
            doctor=practitioner_name,
            department=doc.department or "General",
            appointment_id=doc.name
        )

        frappe.sendmail(
            recipients=[patient_email],
            subject=subject,
            message=message,
            delayed=True
        )
    except Exception as e:
        frappe.logger("hospital_saas").error(f"Failed to send confirmation: {e}")


def send_cancellation_notice(doc):
    """Send cancellation notice to patient"""
    settings = frappe.get_single("Hospital SAAS Settings")

    if not settings.enable_email_notifications:
        return

    patient_email = frappe.db.get_value("Patient", doc.patient, "email")
    if not patient_email:
        return

    try:
        subject = _("Appointment Cancelled - {0}").format(doc.appointment_date)

        message = _("""
Dear {patient_name},

Your appointment scheduled for {date} at {time} has been cancelled.

If you did not request this cancellation, please contact us immediately.

To reschedule, please visit our booking portal or contact our reception.

Best regards,
Hospital Team
        """).format(
            patient_name=doc.patient_name,
            date=doc.appointment_date,
            time=doc.appointment_time
        )

        frappe.sendmail(
            recipients=[patient_email],
            subject=subject,
            message=message,
            delayed=True
        )
    except Exception as e:
        frappe.logger("hospital_saas").error(f"Failed to send cancellation: {e}")


def create_appointment_invoice(doc):
    """Create sales invoice for the appointment if enabled"""
    settings = frappe.get_single("Hospital SAAS Settings")

    if not settings.auto_create_invoice:
        return

    # Check if invoice already exists
    existing = frappe.db.exists(
        "Sales Invoice",
        {"patient": doc.patient, "custom_appointment": doc.name}
    )
    if existing:
        return

    try:
        # Get consultation charges
        consultation_charge = 0
        if doc.practitioner:
            consultation_charge = frappe.db.get_value(
                "Healthcare Practitioner",
                doc.practitioner,
                "op_consulting_charge"
            ) or 0

        if consultation_charge <= 0:
            return  # No charge to invoice

        # Create invoice
        invoice = frappe.new_doc("Sales Invoice")
        invoice.patient = doc.patient
        invoice.customer = frappe.db.get_value("Patient", doc.patient, "customer")
        invoice.custom_appointment = doc.name

        invoice.append("items", {
            "item_code": "Consultation",  # Assumes this item exists
            "qty": 1,
            "rate": consultation_charge
        })

        invoice.flags.ignore_permissions = True
        invoice.save()

        frappe.msgprint(
            _("Invoice {0} created for this appointment").format(invoice.name),
            alert=True
        )

    except Exception as e:
        frappe.logger("hospital_saas").error(f"Failed to create invoice: {e}")


def cancel_draft_invoice(doc):
    """Cancel draft invoice linked to cancelled appointment"""
    invoice = frappe.db.get_value(
        "Sales Invoice",
        {"custom_appointment": doc.name, "docstatus": 0},
        "name"
    )

    if invoice:
        try:
            frappe.delete_doc("Sales Invoice", invoice, force=True)
        except Exception as e:
            frappe.logger("hospital_saas").error(f"Failed to cancel invoice: {e}")
