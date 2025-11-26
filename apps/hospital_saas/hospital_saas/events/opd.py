"""
OPD Token Event Handlers
"""

import frappe
from frappe.utils import today


def after_token_insert(doc, method):
    """After OPD Token is created"""
    # Log the token creation
    frappe.log_error(
        title="OPD Token Created",
        message=f"Token {doc.token_number} created for {doc.patient_name} at {doc.hospital}"
    )

    # Broadcast queue update
    frappe.publish_realtime(
        event="queue_update",
        message={
            "hospital": doc.hospital,
            "action": "new_token",
            "current_token": doc.token_number,
            "current_patient": doc.patient_name,
            "queue_position": doc.queue_position
        },
        room=f"hospital_{doc.hospital}"
    )


def on_token_update(doc, method):
    """When OPD Token is updated"""
    # Broadcast status change
    frappe.publish_realtime(
        event="queue_update",
        message={
            "hospital": doc.hospital,
            "action": "status_change",
            "token": doc.token_number,
            "status": doc.status,
            "patient_name": doc.patient_name
        },
        room=f"hospital_{doc.hospital}"
    )

    # If status changed to "With Doctor", notify
    if doc.status == "With Doctor":
        frappe.publish_realtime(
            event="patient_called",
            message={
                "token": doc.token_number,
                "patient_name": doc.patient_name,
                "practitioner": doc.practitioner
            },
            room=f"hospital_{doc.hospital}"
        )
