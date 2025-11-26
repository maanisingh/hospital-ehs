"""
IPD Admission Event Handlers
"""

import frappe


def after_admission(doc, method):
    """After IPD Admission is created"""
    # Log the admission
    frappe.log_error(
        title="IPD Admission",
        message=f"Patient {doc.patient_name} admitted with ID {doc.admission_id} at {doc.hospital}"
    )

    # Broadcast IPD update
    frappe.publish_realtime(
        event="ipd_update",
        message={
            "hospital": doc.hospital,
            "action": "new_admission",
            "admission_id": doc.admission_id,
            "patient_name": doc.patient_name,
            "ward": doc.ward,
            "bed": doc.bed,
            "indicator": "orange"
        },
        room=f"hospital_{doc.hospital}"
    )


def on_admission_update(doc, method):
    """When IPD Admission is updated"""
    # Broadcast status change
    frappe.publish_realtime(
        event="ipd_update",
        message={
            "hospital": doc.hospital,
            "action": "status_change",
            "admission_id": doc.admission_id,
            "patient_name": doc.patient_name,
            "status": doc.status,
            "indicator": "green" if doc.status == "Discharged" else "blue"
        },
        room=f"hospital_{doc.hospital}"
    )
