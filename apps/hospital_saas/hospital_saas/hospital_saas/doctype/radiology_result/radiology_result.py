# Copyright (c) 2024, Hospital SAAS and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import nowdate, nowtime, now_datetime


class RadiologyResult(Document):
    def validate(self):
        self.validate_order()

    def validate_order(self):
        if self.radiology_order:
            order = frappe.get_doc("Radiology Order", self.radiology_order)
            if order.docstatus != 1:
                frappe.throw(_("Radiology Order must be submitted"))

    def before_submit(self):
        self.reported_date = nowdate()
        self.reported_time = nowtime()
        self.status = "Pending Review"

    def on_submit(self):
        # Update order status
        if self.radiology_order:
            frappe.db.set_value("Radiology Order", self.radiology_order, "status", "Completed")

    def on_cancel(self):
        # Revert order status
        if self.radiology_order:
            frappe.db.set_value("Radiology Order", self.radiology_order, "status", "In Progress")


@frappe.whitelist()
def approve_result(result_name):
    """Approve a radiology result"""
    if not frappe.has_permission("Radiology Result", "write"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    doc = frappe.get_doc("Radiology Result", result_name)
    if doc.docstatus != 1:
        frappe.throw(_("Result must be submitted before approval"))

    if doc.status == "Approved":
        frappe.throw(_("Result is already approved"))

    doc.db_set("status", "Approved")
    doc.db_set("approved_by", frappe.session.user)
    doc.db_set("approval_date", now_datetime())

    return {"success": True, "message": "Result approved successfully"}


@frappe.whitelist()
def get_patient_radiology_history(patient):
    """Get radiology history for a patient"""
    results = frappe.get_all(
        "Radiology Result",
        filters={
            "patient": patient,
            "docstatus": 1
        },
        fields=[
            "name", "examination_type", "modality", "examination_date",
            "status", "findings", "impression", "reporting_radiologist",
            "radiologist_name"
        ],
        order_by="examination_date desc"
    )
    return results
