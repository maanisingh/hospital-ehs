# Copyright (c) 2024, Hospital SAAS and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import nowdate, now_datetime, flt


class PharmacyPrescription(Document):
    def validate(self):
        self.calculate_totals()
        self.set_status()
        self.validate_items()

    def before_submit(self):
        if not self.items:
            frappe.throw(_("Please add prescription items before submitting"))

    def on_submit(self):
        self.status = "Pending"
        self.db_set("status", "Pending")

    def on_cancel(self):
        self.status = "Cancelled"

    def calculate_totals(self):
        """Calculate total quantity and amount"""
        total_qty = 0
        total_amount = 0

        for item in self.items:
            # Get item rate if not set
            if not item.rate:
                item.rate = frappe.db.get_value("Item", item.medication, "standard_rate") or 0

            item.amount = flt(item.quantity) * flt(item.rate)
            total_qty += flt(item.quantity)
            total_amount += flt(item.amount)

        self.total_quantity = total_qty
        self.total_amount = total_amount
        self.net_amount = total_amount - flt(self.discount_amount)

    def set_status(self):
        """Set prescription status based on dispensing"""
        if self.docstatus == 2:
            self.status = "Cancelled"
            return

        if self.docstatus == 0:
            self.status = "Draft"
            return

        # Check if items are dispensed
        all_dispensed = True
        any_dispensed = False

        for item in self.items:
            if item.is_dispensed:
                any_dispensed = True
            else:
                all_dispensed = False

        if all_dispensed and any_dispensed:
            self.status = "Dispensed"
        elif any_dispensed:
            self.status = "Partially Dispensed"
        else:
            self.status = "Pending"

    def validate_items(self):
        """Validate prescription items"""
        for item in self.items:
            if not item.medication:
                frappe.throw(_("Row {0}: Please select a medication").format(item.idx))
            if flt(item.quantity) <= 0:
                frappe.throw(_("Row {0}: Quantity must be greater than 0").format(item.idx))

    @frappe.whitelist()
    def dispense_all(self):
        """Dispense all items in the prescription"""
        if self.status == "Dispensed":
            frappe.throw(_("Prescription already dispensed"))

        pharmacy = self.pharmacy
        if not pharmacy:
            # Get default pharmacy
            from hospital_saas.hospital_saas.doctype.pharmacy.pharmacy import get_default_pharmacy
            pharmacy = get_default_pharmacy(self.hospital)

        if not pharmacy:
            frappe.throw(_("Please select a pharmacy"))

        warehouse = frappe.db.get_value("Pharmacy", pharmacy, "warehouse")
        auto_deduct = frappe.db.get_value("Pharmacy", pharmacy, "auto_deduct_stock")

        # Dispense each item
        for item in self.items:
            if not item.is_dispensed:
                item.dispensed_qty = item.quantity
                item.is_dispensed = 1
                item.dispensed_by = frappe.session.user
                item.dispensed_at = now_datetime()

        self.dispensed_by = frappe.session.user
        self.dispensed_at = now_datetime()
        self.status = "Dispensed"
        self.save()

        # Create stock entry if auto-deduct is enabled
        if auto_deduct and warehouse:
            self.create_stock_entry(warehouse)

        # Create sales invoice
        self.create_sales_invoice()

        frappe.msgprint(_("Prescription dispensed successfully"))

        return {"success": True}

    def create_stock_entry(self, warehouse):
        """Create Material Issue stock entry for dispensed items"""
        try:
            items = []
            for item in self.items:
                if item.is_dispensed:
                    items.append({
                        "item_code": item.medication,
                        "qty": item.dispensed_qty,
                        "s_warehouse": warehouse,
                        "batch_no": item.batch_no
                    })

            if items:
                stock_entry = frappe.get_doc({
                    "doctype": "Stock Entry",
                    "stock_entry_type": "Material Issue",
                    "posting_date": nowdate(),
                    "company": frappe.defaults.get_user_default("Company"),
                    "items": items,
                    "custom_pharmacy_prescription": self.name
                })
                stock_entry.insert(ignore_permissions=True)
                stock_entry.submit()

                self.db_set("stock_entry", stock_entry.name)

        except Exception as e:
            frappe.log_error(f"Stock entry creation error: {str(e)}")

    def create_sales_invoice(self):
        """Create sales invoice for dispensed medications"""
        try:
            items = []
            for item in self.items:
                if item.is_dispensed:
                    items.append({
                        "item_code": item.medication,
                        "item_name": item.medication_name,
                        "qty": item.dispensed_qty,
                        "rate": item.rate
                    })

            if items:
                # Get customer from patient
                customer = frappe.db.get_value("Patient", self.patient, "customer")
                if not customer:
                    customer = frappe.db.get_single_value("Selling Settings", "default_customer")

                if customer:
                    invoice = frappe.get_doc({
                        "doctype": "Sales Invoice",
                        "customer": customer,
                        "posting_date": nowdate(),
                        "patient": self.patient,
                        "custom_pharmacy_prescription": self.name,
                        "items": items
                    })
                    invoice.insert(ignore_permissions=True)

                    self.db_set("sales_invoice", invoice.name)

        except Exception as e:
            frappe.log_error(f"Sales invoice creation error: {str(e)}")


@frappe.whitelist()
def get_pharmacy_queue(pharmacy=None, hospital=None):
    """Get pending prescriptions queue for pharmacy"""
    filters = {"status": ["in", ["Pending", "Partially Dispensed"]], "docstatus": 1}

    if pharmacy:
        filters["pharmacy"] = pharmacy
    if hospital:
        filters["hospital"] = hospital

    prescriptions = frappe.get_all(
        "Pharmacy Prescription",
        filters=filters,
        fields=[
            "name", "patient", "patient_name", "prescription_date",
            "practitioner_name", "status", "total_amount", "creation"
        ],
        order_by="creation asc"
    )

    return prescriptions


@frappe.whitelist()
def dispense_prescription(prescription_name):
    """Dispense a prescription"""
    doc = frappe.get_doc("Pharmacy Prescription", prescription_name)
    return doc.dispense_all()
