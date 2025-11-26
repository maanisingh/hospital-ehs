# Copyright (c) 2024, Hospital SAAS and contributors
# For license information, please see license.txt

"""
Radiology Module Events

Handles document events for Radiology Order and Radiology Result
"""

import frappe
from frappe import _
from frappe.utils import nowdate, nowtime, now_datetime, getdate, add_days


def on_order_submit(doc, method):
    """Handle Radiology Order submission"""
    # Set default status
    if doc.status == "Draft":
        doc.db_set("status", "Ordered")

    # Create billing invoice if auto-billing is enabled
    settings = frappe.get_cached_doc("Hospital SAAS Settings")
    if settings.auto_create_radiology_invoice:
        create_radiology_invoice(doc)

    # Send notification to radiology department
    notify_radiology_department(doc)

    # Update patient's radiology queue
    frappe.publish_realtime(
        event="radiology_order_update",
        message={
            "order": doc.name,
            "patient": doc.patient,
            "patient_name": doc.patient_name,
            "examination_type": doc.examination_type,
            "modality": doc.modality,
            "priority": doc.priority,
            "status": "Ordered"
        },
        after_commit=True
    )


def on_order_cancel(doc, method):
    """Handle Radiology Order cancellation"""
    # Update status
    doc.db_set("status", "Cancelled")

    # Cancel any linked invoices that are in draft
    if doc.sales_invoice:
        invoice = frappe.get_doc("Sales Invoice", doc.sales_invoice)
        if invoice.docstatus == 0:  # Draft
            frappe.delete_doc("Sales Invoice", invoice.name)

    # Notify radiology department
    frappe.publish_realtime(
        event="radiology_order_cancelled",
        message={
            "order": doc.name,
            "patient_name": doc.patient_name,
            "examination_type": doc.examination_type
        },
        after_commit=True
    )


def on_order_update(doc, method):
    """Handle Radiology Order updates"""
    # Track status changes for queue display
    if doc.has_value_changed("status"):
        frappe.publish_realtime(
            event="radiology_queue_update",
            message={
                "order": doc.name,
                "patient_name": doc.patient_name,
                "examination_type": doc.examination_type,
                "old_status": doc.get_doc_before_save().status if doc.get_doc_before_save() else None,
                "new_status": doc.status,
                "priority": doc.priority
            },
            after_commit=True
        )


def on_result_submit(doc, method):
    """Handle Radiology Result submission"""
    # Set reported date and time
    doc.db_set("reported_date", nowdate())
    doc.db_set("reported_time", nowtime())
    doc.db_set("status", "Pending Review")

    # Update linked order status
    if doc.radiology_order:
        frappe.db.set_value("Radiology Order", doc.radiology_order, "status", "Completed")

    # Notify ordering practitioner
    notify_ordering_practitioner(doc)

    # Send notification for review
    frappe.publish_realtime(
        event="radiology_result_ready",
        message={
            "result": doc.name,
            "patient": doc.patient,
            "patient_name": doc.patient_name,
            "examination_type": doc.examination_type,
            "status": "Pending Review"
        },
        after_commit=True
    )


def on_result_cancel(doc, method):
    """Handle Radiology Result cancellation"""
    # Revert order status
    if doc.radiology_order:
        frappe.db.set_value("Radiology Order", doc.radiology_order, "status", "In Progress")


def create_radiology_invoice(order):
    """Create Sales Invoice for Radiology Order"""
    if not order.rate or order.invoiced:
        return

    try:
        # Get patient's customer
        patient = frappe.get_doc("Patient", order.patient)
        customer = patient.customer

        if not customer:
            frappe.log_error(
                f"Cannot create invoice: Patient {order.patient} has no linked customer",
                "Radiology Billing Error"
            )
            return

        # Get examination item
        exam_type = frappe.get_doc("Radiology Examination Type", order.examination_type)
        item = exam_type.item or frappe.db.get_single_value("Hospital SAAS Settings", "default_radiology_item")

        if not item:
            frappe.log_error(
                f"No item configured for {order.examination_type}",
                "Radiology Billing Error"
            )
            return

        # Create invoice
        invoice = frappe.new_doc("Sales Invoice")
        invoice.customer = customer
        invoice.posting_date = nowdate()
        invoice.due_date = add_days(nowdate(), 30)
        invoice.radiology_order = order.name

        invoice.append("items", {
            "item_code": item,
            "qty": 1,
            "rate": order.rate,
            "description": f"Radiology: {order.examination_type} for {order.patient_name}"
        })

        invoice.flags.ignore_permissions = True
        invoice.insert()

        # Link invoice to order
        order.db_set("sales_invoice", invoice.name)
        order.db_set("invoiced", 1)

        frappe.msgprint(_("Invoice {0} created").format(invoice.name), indicator="green")

    except Exception as e:
        frappe.log_error(
            f"Error creating radiology invoice for {order.name}: {str(e)}",
            "Radiology Billing Error"
        )


def notify_radiology_department(order):
    """Send notification to radiology department about new order"""
    try:
        # Get radiology users
        radiology_users = frappe.get_all(
            "Has Role",
            filters={"role": ["in", ["Hospital Radiology Technician", "Hospital Radiologist"]]},
            pluck="parent"
        )

        if not radiology_users:
            return

        priority_color = {
            "STAT": "red",
            "Urgent": "orange",
            "Routine": "blue"
        }.get(order.priority, "blue")

        for user in set(radiology_users):
            frappe.publish_realtime(
                event="notification",
                message={
                    "title": _("New Radiology Order"),
                    "message": _(
                        "New {0} order: {1} for {2}"
                    ).format(order.priority, order.examination_type, order.patient_name),
                    "type": priority_color,
                    "doctype": "Radiology Order",
                    "name": order.name
                },
                user=user,
                after_commit=True
            )
    except Exception as e:
        frappe.log_error(f"Radiology notification error: {str(e)}")


def notify_ordering_practitioner(result):
    """Notify the ordering practitioner when result is ready"""
    try:
        if not result.practitioner:
            return

        practitioner = frappe.get_doc("Healthcare Practitioner", result.practitioner)
        if not practitioner.user_id:
            return

        frappe.publish_realtime(
            event="notification",
            message={
                "title": _("Radiology Result Ready"),
                "message": _(
                    "Radiology result for {0} ({1}) is ready for review"
                ).format(result.patient_name, result.examination_type),
                "type": "green",
                "doctype": "Radiology Result",
                "name": result.name
            },
            user=practitioner.user_id,
            after_commit=True
        )
    except Exception as e:
        frappe.log_error(f"Practitioner notification error: {str(e)}")


# ============================================
# WHITELISTED API METHODS
# ============================================

@frappe.whitelist()
def get_radiology_statistics(from_date=None, to_date=None):
    """Get radiology department statistics"""
    if not from_date:
        from_date = add_days(nowdate(), -30)
    if not to_date:
        to_date = nowdate()

    # Total orders
    total_orders = frappe.db.count("Radiology Order", {
        "order_date": ["between", [from_date, to_date]],
        "docstatus": 1
    })

    # Orders by status
    status_breakdown = frappe.db.sql("""
        SELECT status, COUNT(*) as count
        FROM `tabRadiology Order`
        WHERE order_date BETWEEN %s AND %s
        AND docstatus = 1
        GROUP BY status
    """, (from_date, to_date), as_dict=True)

    # Orders by modality
    modality_breakdown = frappe.db.sql("""
        SELECT modality, COUNT(*) as count
        FROM `tabRadiology Order`
        WHERE order_date BETWEEN %s AND %s
        AND docstatus = 1
        GROUP BY modality
        ORDER BY count DESC
    """, (from_date, to_date), as_dict=True)

    # Pending results
    pending_results = frappe.db.count("Radiology Result", {
        "status": "Pending Review",
        "docstatus": 1
    })

    # Average turnaround time (order to result)
    avg_turnaround = frappe.db.sql("""
        SELECT AVG(
            TIMESTAMPDIFF(HOUR,
                CONCAT(ro.order_date, ' ', COALESCE(ro.order_time, '00:00:00')),
                CONCAT(rr.examination_date, ' ', COALESCE(rr.examination_time, '00:00:00'))
            )
        ) as avg_hours
        FROM `tabRadiology Order` ro
        INNER JOIN `tabRadiology Result` rr ON rr.radiology_order = ro.name
        WHERE ro.order_date BETWEEN %s AND %s
        AND ro.docstatus = 1
        AND rr.docstatus = 1
    """, (from_date, to_date), as_dict=True)

    return {
        "total_orders": total_orders,
        "status_breakdown": status_breakdown,
        "modality_breakdown": modality_breakdown,
        "pending_results": pending_results,
        "avg_turnaround_hours": round(avg_turnaround[0].avg_hours or 0, 1) if avg_turnaround else 0
    }


@frappe.whitelist()
def get_today_radiology_queue():
    """Get today's radiology queue with priority sorting"""
    today = nowdate()

    orders = frappe.db.sql("""
        SELECT
            ro.name,
            ro.patient,
            ro.patient_name,
            ro.patient_age,
            ro.patient_sex,
            ro.examination_type,
            ro.modality,
            ro.body_part,
            ro.practitioner_name,
            ro.status,
            ro.priority,
            ro.order_date,
            ro.order_time,
            ro.scheduled_date,
            ro.scheduled_time,
            ro.radiology_room,
            ro.technician,
            ro.clinical_history
        FROM `tabRadiology Order` ro
        WHERE ro.docstatus = 1
        AND ro.status IN ('Ordered', 'Scheduled', 'In Progress')
        AND (ro.scheduled_date = %s OR ro.scheduled_date IS NULL OR ro.order_date = %s)
        ORDER BY
            FIELD(ro.priority, 'STAT', 'Urgent', 'Routine'),
            ro.order_date ASC,
            ro.order_time ASC
    """, (today, today), as_dict=True)

    return orders


@frappe.whitelist()
def schedule_radiology_order(order_name, scheduled_date, scheduled_time, radiology_room=None, technician=None):
    """Schedule a radiology order"""
    if not frappe.has_permission("Radiology Order", "write"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    order = frappe.get_doc("Radiology Order", order_name)

    if order.docstatus != 1:
        frappe.throw(_("Order must be submitted"))

    if order.status not in ["Ordered", "Scheduled"]:
        frappe.throw(_("Cannot schedule order with status {0}").format(order.status))

    # Check for scheduling conflicts
    if radiology_room and scheduled_date and scheduled_time:
        conflicts = frappe.db.sql("""
            SELECT name, patient_name
            FROM `tabRadiology Order`
            WHERE radiology_room = %s
            AND scheduled_date = %s
            AND scheduled_time = %s
            AND name != %s
            AND docstatus = 1
            AND status NOT IN ('Completed', 'Cancelled')
        """, (radiology_room, scheduled_date, scheduled_time, order_name), as_dict=True)

        if conflicts:
            frappe.throw(_(
                "Scheduling conflict: Room {0} is booked for {1} at this time"
            ).format(radiology_room, conflicts[0].patient_name))

    # Update order
    order.db_set("scheduled_date", scheduled_date)
    order.db_set("scheduled_time", scheduled_time)
    if radiology_room:
        order.db_set("radiology_room", radiology_room)
    if technician:
        order.db_set("technician", technician)
    order.db_set("status", "Scheduled")

    return {"success": True, "message": _("Order scheduled successfully")}


@frappe.whitelist()
def start_examination(order_name):
    """Mark examination as started"""
    if not frappe.has_permission("Radiology Order", "write"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    order = frappe.get_doc("Radiology Order", order_name)

    if order.status not in ["Ordered", "Scheduled"]:
        frappe.throw(_("Cannot start examination with status {0}").format(order.status))

    order.db_set("status", "In Progress")

    frappe.publish_realtime(
        event="radiology_exam_started",
        message={
            "order": order_name,
            "patient_name": order.patient_name,
            "examination_type": order.examination_type
        },
        after_commit=True
    )

    return {"success": True, "status": "In Progress"}
