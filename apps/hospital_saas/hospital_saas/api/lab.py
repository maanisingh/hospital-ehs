"""
Lab API Module

Provides API endpoints for Lab Test queue management
integrated with ERPNext Healthcare Lab Test DocType.
"""

import frappe
from frappe import _
from frappe.utils import nowdate, now_datetime, getdate


@frappe.whitelist(allow_guest=True)
def get_lab_queue(hospital=None):
    """
    Get lab test queue data for display

    Args:
        hospital: Hospital name/ID (optional)

    Returns:
        dict with waiting, processing, completed counts and lists
    """
    filters = {"docstatus": ["<", 2]}
    today = nowdate()

    if hospital:
        filters["custom_hospital"] = hospital

    # Get waiting tests
    waiting = frappe.get_all(
        "Lab Test",
        filters={
            **filters,
            "custom_queue_status": "Waiting",
            "creation": [">=", today]
        },
        fields=[
            "name", "patient", "patient_name", "template",
            "custom_queue_number", "custom_hospital", "creation"
        ],
        order_by="custom_queue_number asc, creation asc",
        limit=50
    )

    # Get tests in sample collection
    collection = frappe.get_all(
        "Lab Test",
        filters={
            **filters,
            "custom_queue_status": "Sample Collection",
            "creation": [">=", today]
        },
        fields=[
            "name", "patient", "patient_name", "template",
            "custom_queue_number", "custom_hospital", "creation"
        ],
        order_by="creation asc",
        limit=10
    )

    # Get tests in processing
    processing = frappe.get_all(
        "Lab Test",
        filters={
            **filters,
            "custom_queue_status": "Processing",
            "creation": [">=", today]
        },
        fields=[
            "name", "patient", "patient_name", "template",
            "custom_queue_number", "custom_hospital", "creation"
        ],
        order_by="creation asc",
        limit=20
    )

    # Get completed today count
    completed_count = frappe.db.count(
        "Lab Test",
        filters={
            **filters,
            "custom_queue_status": "Completed",
            "modified": [">=", today]
        }
    )

    # Format test names
    for tests in [waiting, collection, processing]:
        for test in tests:
            test["queue_number"] = test.get("custom_queue_number") or test.get("name")[-5:]
            if test.get("template"):
                test["test_name"] = frappe.db.get_value(
                    "Lab Test Template", test["template"], "lab_test_name"
                ) or test["template"]
            else:
                test["test_name"] = "Lab Test"

    # Get current (first in sample collection)
    current = collection[0] if collection else None

    return {
        "waiting": waiting,
        "collection": collection,
        "processing": processing,
        "current": current,
        "waiting_count": len(waiting),
        "collection_count": len(collection),
        "processing_count": len(processing),
        "completed_count": completed_count
    }


@frappe.whitelist()
def update_lab_queue_status(lab_test, status):
    """
    Update lab test queue status

    Args:
        lab_test: Lab Test name
        status: New status (Waiting, Sample Collection, Processing, Completed)
    """
    if status not in ["Waiting", "Sample Collection", "Processing", "Completed"]:
        frappe.throw(_("Invalid status"))

    doc = frappe.get_doc("Lab Test", lab_test)
    doc.custom_queue_status = status
    doc.save(ignore_permissions=True)

    # Publish realtime update
    frappe.publish_realtime(
        "lab_queue_update",
        {"lab_test": lab_test, "status": status, "hospital": doc.custom_hospital},
        doctype="Lab Test"
    )

    return {"success": True, "status": status}


@frappe.whitelist()
def assign_queue_number(lab_test):
    """
    Assign queue number to lab test

    Args:
        lab_test: Lab Test name

    Returns:
        Queue number assigned
    """
    doc = frappe.get_doc("Lab Test", lab_test)
    today = nowdate()

    # Get max queue number for today
    max_queue = frappe.db.sql("""
        SELECT MAX(custom_queue_number)
        FROM `tabLab Test`
        WHERE custom_hospital = %s
        AND DATE(creation) = %s
    """, (doc.custom_hospital, today))[0][0] or 0

    new_queue = max_queue + 1
    doc.custom_queue_number = new_queue
    doc.custom_queue_status = "Waiting"
    doc.save(ignore_permissions=True)

    return {"queue_number": new_queue}


@frappe.whitelist()
def get_lab_stats(hospital=None, from_date=None, to_date=None):
    """
    Get lab statistics for reporting

    Args:
        hospital: Hospital name (optional)
        from_date: Start date (optional, defaults to today)
        to_date: End date (optional, defaults to today)
    """
    from_date = from_date or nowdate()
    to_date = to_date or nowdate()

    filters = {
        "creation": ["between", [from_date, to_date]],
        "docstatus": ["<", 2]
    }

    if hospital:
        filters["custom_hospital"] = hospital

    # Total tests
    total = frappe.db.count("Lab Test", filters)

    # By status
    status_counts = frappe.db.sql("""
        SELECT custom_queue_status, COUNT(*) as count
        FROM `tabLab Test`
        WHERE creation BETWEEN %s AND %s
        AND docstatus < 2
        {hospital_filter}
        GROUP BY custom_queue_status
    """.format(
        hospital_filter=f"AND custom_hospital = '{hospital}'" if hospital else ""
    ), (from_date, to_date), as_dict=True)

    # By test type
    test_types = frappe.db.sql("""
        SELECT template, COUNT(*) as count
        FROM `tabLab Test`
        WHERE creation BETWEEN %s AND %s
        AND docstatus < 2
        {hospital_filter}
        GROUP BY template
        ORDER BY count DESC
        LIMIT 10
    """.format(
        hospital_filter=f"AND custom_hospital = '{hospital}'" if hospital else ""
    ), (from_date, to_date), as_dict=True)

    return {
        "total": total,
        "by_status": {s["custom_queue_status"]: s["count"] for s in status_counts},
        "by_type": test_types,
        "from_date": from_date,
        "to_date": to_date
    }


@frappe.whitelist()
def create_lab_test_from_encounter(encounter, template):
    """
    Create lab test from patient encounter

    Args:
        encounter: Patient Encounter name
        template: Lab Test Template name

    Returns:
        Created Lab Test name
    """
    enc_doc = frappe.get_doc("Patient Encounter", encounter)

    lab_test = frappe.new_doc("Lab Test")
    lab_test.patient = enc_doc.patient
    lab_test.patient_name = enc_doc.patient_name
    lab_test.template = template
    lab_test.practitioner = enc_doc.practitioner
    lab_test.custom_hospital = enc_doc.custom_hospital
    lab_test.custom_queue_status = "Waiting"
    lab_test.custom_payment_status = "Pending"

    # Assign queue number
    today = nowdate()
    max_queue = frappe.db.sql("""
        SELECT MAX(custom_queue_number)
        FROM `tabLab Test`
        WHERE custom_hospital = %s
        AND DATE(creation) = %s
    """, (lab_test.custom_hospital, today))[0][0] or 0

    lab_test.custom_queue_number = max_queue + 1

    lab_test.insert(ignore_permissions=True)

    return {
        "lab_test": lab_test.name,
        "queue_number": lab_test.custom_queue_number
    }
