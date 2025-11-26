# Copyright (c) 2024, Hospital SAAS and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import nowdate, nowtime


class RadiologyOrder(Document):
    def before_insert(self):
        if not self.order_time:
            self.order_time = nowtime()

    def validate(self):
        self.set_title()
        self.validate_scheduled_date()

    def set_title(self):
        self.title = f"{self.patient_name} - {self.examination_type}"

    def validate_scheduled_date(self):
        if self.scheduled_date and self.scheduled_date < self.order_date:
            frappe.throw(_("Scheduled date cannot be before order date"))

    def on_submit(self):
        self.db_set("status", "Ordered")

    def on_cancel(self):
        self.db_set("status", "Cancelled")


@frappe.whitelist()
def get_radiology_queue():
    """Get pending radiology orders for queue display"""
    orders = frappe.get_all(
        "Radiology Order",
        filters={
            "status": ["in", ["Ordered", "Scheduled", "In Progress"]],
            "docstatus": 1
        },
        fields=[
            "name", "patient", "patient_name", "examination_type",
            "modality", "practitioner_name", "status", "priority",
            "order_date", "order_time", "scheduled_date", "scheduled_time",
            "creation"
        ],
        order_by="FIELD(priority, 'STAT', 'Urgent', 'Routine'), creation asc"
    )
    return orders


@frappe.whitelist()
def update_order_status(order_name, status):
    """Update radiology order status"""
    if not frappe.has_permission("Radiology Order", "write"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    doc = frappe.get_doc("Radiology Order", order_name)
    if doc.docstatus != 1:
        frappe.throw(_("Order must be submitted"))

    valid_transitions = {
        "Ordered": ["Scheduled", "In Progress", "Cancelled"],
        "Scheduled": ["In Progress", "Cancelled"],
        "In Progress": ["Completed", "Cancelled"]
    }

    if status not in valid_transitions.get(doc.status, []):
        frappe.throw(_("Invalid status transition from {0} to {1}").format(doc.status, status))

    doc.db_set("status", status)
    return {"success": True, "status": status}


@frappe.whitelist()
def create_radiology_result(order_name):
    """Create a radiology result from order"""
    if not frappe.has_permission("Radiology Result", "create"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    order = frappe.get_doc("Radiology Order", order_name)
    if order.status == "Completed":
        frappe.throw(_("Result already exists for this order"))

    result = frappe.new_doc("Radiology Result")
    result.radiology_order = order.name
    result.patient = order.patient
    result.patient_name = order.patient_name
    result.examination_type = order.examination_type
    result.modality = order.modality
    result.practitioner = order.practitioner
    result.practitioner_name = order.practitioner_name
    result.examination_date = nowdate()
    result.examination_time = nowtime()

    return result.as_dict()
