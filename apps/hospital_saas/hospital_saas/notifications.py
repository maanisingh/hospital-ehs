"""
Hospital SAAS Notification Configuration

Defines notification settings for the Hospital SAAS module.
"""

import frappe


def get_notification_config():
    """
    Return notification configuration for Hospital SAAS.
    This function is called by Frappe to get notification counts.
    """
    return {
        "for_doctype": {
            "Patient Appointment": {"status": ["in", ["Scheduled", "Open"]]},
            "Patient": {"status": "Active"},
            "Patient Encounter": {"docstatus": 0},
            "Lab Test": {"docstatus": 0},
            "Clinical Procedure": {"docstatus": 0},
        },
        "for_module_doctypes": {
            "Hospital SAAS": [
                "Patient",
                "Patient Appointment",
                "Patient Encounter",
                "Healthcare Practitioner",
                "Lab Test",
                "Clinical Procedure",
                "Vital Signs",
            ]
        },
        "for_module": {
            "Hospital SAAS": "hospital_saas.notifications.get_hospital_notifications"
        }
    }


def get_hospital_notifications():
    """
    Get count of pending items for Hospital SAAS module.
    """
    from frappe.utils import today

    notifications = {}

    try:
        # Today's appointments
        notifications["todays_appointments"] = frappe.db.count(
            "Patient Appointment",
            filters={
                "appointment_date": today(),
                "status": ["in", ["Scheduled", "Open"]]
            }
        )

        # Pending lab tests
        notifications["pending_lab_tests"] = frappe.db.count(
            "Lab Test",
            filters={"docstatus": 0}
        )

        # Draft encounters
        notifications["draft_encounters"] = frappe.db.count(
            "Patient Encounter",
            filters={"docstatus": 0}
        )

    except Exception as e:
        frappe.log_error(f"Notification Error: {str(e)}")

    return sum(notifications.values())


def send_notification(recipient, subject, message, notification_type="Alert"):
    """
    Send notification to a user.
    
    Args:
        recipient: User ID or email
        subject: Notification subject
        message: Notification body
        notification_type: Alert, Info, Warning, etc.
    """
    try:
        notification = frappe.new_doc("Notification Log")
        notification.subject = subject
        notification.for_user = recipient
        notification.type = notification_type
        notification.email_content = message
        notification.insert(ignore_permissions=True)
    except Exception as e:
        frappe.log_error(f"Send Notification Error: {str(e)}")


def notify_appointment_reminder(appointment):
    """Send appointment reminder notification"""
    try:
        patient_email = frappe.db.get_value("Patient", appointment.patient, "email")
        if not patient_email:
            return

        subject = f"Appointment Reminder - {appointment.appointment_date}"
        message = f"""
        Dear {appointment.patient_name},

        This is a reminder for your upcoming appointment:
        
        Date: {appointment.appointment_date}
        Time: {appointment.appointment_time}
        
        Please arrive 15 minutes before your scheduled time.
        
        Thank you,
        Hospital Team
        """

        send_notification(patient_email, subject, message, "Reminder")

    except Exception as e:
        frappe.log_error(f"Appointment Reminder Error: {str(e)}")
