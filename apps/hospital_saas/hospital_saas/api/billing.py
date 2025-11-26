"""
Billing API Module

Integrates Hospital SAAS with ERPNext Accounts module
for billing and payment workflows.
"""

import frappe
from frappe import _
from frappe.utils import nowdate, flt, now_datetime


@frappe.whitelist()
def create_consultation_invoice(patient, hospital, practitioner, amount, encounter=None):
    """
    Create Sales Invoice for OPD consultation

    Args:
        patient: Patient name
        hospital: Hospital name
        practitioner: Healthcare Practitioner name
        amount: Consultation amount
        encounter: Patient Encounter name (optional)

    Returns:
        Created Sales Invoice name
    """
    # Get hospital details
    hospital_doc = frappe.get_doc("Hospital", hospital)

    # Get or create customer for patient
    customer = get_or_create_patient_customer(patient)

    # Get company
    company = frappe.db.get_single_value("Global Defaults", "default_company")

    # Create invoice
    invoice = frappe.new_doc("Sales Invoice")
    invoice.customer = customer
    invoice.company = company
    invoice.posting_date = nowdate()
    invoice.due_date = nowdate()
    invoice.custom_hospital = hospital
    invoice.custom_patient = patient
    invoice.custom_service_type = "OPD Consultation"

    if encounter:
        invoice.custom_reference_doctype = "Patient Encounter"
        invoice.custom_reference_name = encounter

    # Get income account
    income_account = frappe.db.get_value(
        "Company", company, "default_income_account"
    )

    # Add consultation item
    invoice.append("items", {
        "item_name": f"OPD Consultation - {frappe.db.get_value('Healthcare Practitioner', practitioner, 'practitioner_name')}",
        "description": f"Consultation with {practitioner}",
        "qty": 1,
        "rate": flt(amount),
        "income_account": income_account
    })

    invoice.insert(ignore_permissions=True)

    return {
        "invoice": invoice.name,
        "amount": invoice.grand_total
    }


@frappe.whitelist()
def create_lab_invoice(lab_test, hospital=None):
    """
    Create Sales Invoice for Lab Test

    Args:
        lab_test: Lab Test name
        hospital: Hospital name (optional, fetched from lab test if not provided)

    Returns:
        Created Sales Invoice name
    """
    lab_doc = frappe.get_doc("Lab Test", lab_test)
    hospital = hospital or lab_doc.custom_hospital

    if not hospital:
        frappe.throw(_("Hospital not specified"))

    # Get test fee from template
    template_fee = 0
    if lab_doc.template:
        template_fee = frappe.db.get_value(
            "Lab Test Template", lab_doc.template, "custom_test_fee"
        ) or 0

    # Get or create customer
    customer = get_or_create_patient_customer(lab_doc.patient)

    # Get company
    company = frappe.db.get_single_value("Global Defaults", "default_company")
    income_account = frappe.db.get_value("Company", company, "default_income_account")

    # Create invoice
    invoice = frappe.new_doc("Sales Invoice")
    invoice.customer = customer
    invoice.company = company
    invoice.posting_date = nowdate()
    invoice.due_date = nowdate()
    invoice.custom_hospital = hospital
    invoice.custom_patient = lab_doc.patient
    invoice.custom_service_type = "Lab Test"
    invoice.custom_reference_doctype = "Lab Test"
    invoice.custom_reference_name = lab_test

    # Add test item
    test_name = lab_doc.template or "Lab Test"
    invoice.append("items", {
        "item_name": f"Lab Test - {test_name}",
        "description": f"Laboratory Test: {test_name}",
        "qty": 1,
        "rate": flt(template_fee),
        "income_account": income_account
    })

    invoice.insert(ignore_permissions=True)

    # Update lab test payment status
    lab_doc.db_set("custom_payment_status", "Pending")

    return {
        "invoice": invoice.name,
        "amount": invoice.grand_total
    }


@frappe.whitelist()
def create_radiology_invoice(radiology_order, hospital=None):
    """
    Create Sales Invoice for Radiology Order

    Args:
        radiology_order: Radiology Order name
        hospital: Hospital name (optional)

    Returns:
        Created Sales Invoice name
    """
    order_doc = frappe.get_doc("Radiology Order", radiology_order)
    hospital = hospital or order_doc.hospital

    if not hospital:
        frappe.throw(_("Hospital not specified"))

    # Get exam fee
    exam_fee = 0
    if order_doc.examination_type:
        exam_fee = frappe.db.get_value(
            "Radiology Examination Type", order_doc.examination_type, "fee"
        ) or 0

    # Get or create customer
    customer = get_or_create_patient_customer(order_doc.patient)

    # Get company
    company = frappe.db.get_single_value("Global Defaults", "default_company")
    income_account = frappe.db.get_value("Company", company, "default_income_account")

    # Create invoice
    invoice = frappe.new_doc("Sales Invoice")
    invoice.customer = customer
    invoice.company = company
    invoice.posting_date = nowdate()
    invoice.due_date = nowdate()
    invoice.custom_hospital = hospital
    invoice.custom_patient = order_doc.patient
    invoice.custom_service_type = "Radiology"
    invoice.custom_reference_doctype = "Radiology Order"
    invoice.custom_reference_name = radiology_order

    # Add exam item
    exam_name = order_doc.examination_type or "Radiology"
    invoice.append("items", {
        "item_name": f"Radiology - {exam_name}",
        "description": f"Radiology Examination: {exam_name}",
        "qty": 1,
        "rate": flt(exam_fee),
        "income_account": income_account
    })

    invoice.insert(ignore_permissions=True)

    return {
        "invoice": invoice.name,
        "amount": invoice.grand_total
    }


@frappe.whitelist()
def create_pharmacy_invoice(prescription, hospital=None):
    """
    Create Sales Invoice for Pharmacy Prescription

    Args:
        prescription: Pharmacy Prescription name
        hospital: Hospital name (optional)

    Returns:
        Created Sales Invoice name
    """
    presc_doc = frappe.get_doc("Pharmacy Prescription", prescription)
    hospital = hospital or presc_doc.hospital

    if not hospital:
        frappe.throw(_("Hospital not specified"))

    # Get or create customer
    customer = get_or_create_patient_customer(presc_doc.patient)

    # Get company
    company = frappe.db.get_single_value("Global Defaults", "default_company")
    income_account = frappe.db.get_value("Company", company, "default_income_account")

    # Create invoice
    invoice = frappe.new_doc("Sales Invoice")
    invoice.customer = customer
    invoice.company = company
    invoice.posting_date = nowdate()
    invoice.due_date = nowdate()
    invoice.custom_hospital = hospital
    invoice.custom_patient = presc_doc.patient
    invoice.custom_service_type = "Pharmacy"
    invoice.custom_reference_doctype = "Pharmacy Prescription"
    invoice.custom_reference_name = prescription

    # Add prescription items
    for item in presc_doc.items:
        invoice.append("items", {
            "item_code": item.item_code if frappe.db.exists("Item", item.item_code) else None,
            "item_name": item.drug_name or item.item_code,
            "description": f"{item.drug_name} - {item.dosage or ''} x {item.quantity or 1}",
            "qty": flt(item.quantity) or 1,
            "rate": flt(item.rate) or 0,
            "income_account": income_account
        })

    invoice.insert(ignore_permissions=True)

    return {
        "invoice": invoice.name,
        "amount": invoice.grand_total
    }


@frappe.whitelist()
def record_payment(invoice, amount, mode_of_payment="Cash"):
    """
    Record payment for Sales Invoice

    Args:
        invoice: Sales Invoice name
        amount: Payment amount
        mode_of_payment: Payment mode (Cash, Card, UPI, etc.)

    Returns:
        Payment Entry name
    """
    invoice_doc = frappe.get_doc("Sales Invoice", invoice)

    if invoice_doc.docstatus != 1:
        # Submit invoice first if draft
        invoice_doc.submit()

    # Get company accounts
    company = invoice_doc.company
    mode = frappe.get_doc("Mode of Payment", mode_of_payment)
    payment_account = None

    for account in mode.accounts:
        if account.company == company:
            payment_account = account.default_account
            break

    if not payment_account:
        payment_account = frappe.db.get_value(
            "Company", company, "default_cash_account"
        )

    # Create Payment Entry
    payment = frappe.new_doc("Payment Entry")
    payment.payment_type = "Receive"
    payment.party_type = "Customer"
    payment.party = invoice_doc.customer
    payment.company = company
    payment.mode_of_payment = mode_of_payment
    payment.paid_from = invoice_doc.debit_to
    payment.paid_to = payment_account
    payment.paid_amount = flt(amount)
    payment.received_amount = flt(amount)
    payment.reference_no = invoice
    payment.reference_date = nowdate()

    payment.append("references", {
        "reference_doctype": "Sales Invoice",
        "reference_name": invoice,
        "allocated_amount": flt(amount)
    })

    payment.insert(ignore_permissions=True)
    payment.submit()

    # Update reference document payment status
    update_payment_status(invoice_doc)

    return {
        "payment": payment.name,
        "amount": payment.paid_amount
    }


def update_payment_status(invoice_doc):
    """Update payment status on reference document"""
    if invoice_doc.custom_reference_doctype and invoice_doc.custom_reference_name:
        ref_doc = frappe.get_doc(
            invoice_doc.custom_reference_doctype,
            invoice_doc.custom_reference_name
        )

        if hasattr(ref_doc, "custom_payment_status"):
            if invoice_doc.outstanding_amount <= 0:
                ref_doc.db_set("custom_payment_status", "Paid")
            elif invoice_doc.outstanding_amount < invoice_doc.grand_total:
                ref_doc.db_set("custom_payment_status", "Partial")


def get_or_create_patient_customer(patient):
    """Get or create Customer linked to Patient"""
    # Check if customer exists for patient
    existing = frappe.db.get_value("Customer", {"customer_name": patient})
    if existing:
        return existing

    # Get patient details
    patient_doc = frappe.get_doc("Patient", patient)

    # Create customer
    customer = frappe.new_doc("Customer")
    customer.customer_name = patient_doc.patient_name
    customer.customer_type = "Individual"
    customer.customer_group = "Individual"
    customer.territory = frappe.db.get_single_value("Selling Settings", "territory") or "All Territories"

    customer.insert(ignore_permissions=True)

    return customer.name


@frappe.whitelist()
def get_billing_summary(hospital=None, from_date=None, to_date=None):
    """
    Get billing summary for dashboard

    Args:
        hospital: Hospital name (optional)
        from_date: Start date
        to_date: End date

    Returns:
        Billing summary dict
    """
    from_date = from_date or nowdate()
    to_date = to_date or nowdate()

    filters = {
        "posting_date": ["between", [from_date, to_date]],
        "docstatus": 1
    }

    if hospital:
        filters["custom_hospital"] = hospital

    # Total revenue
    total_revenue = frappe.db.sql("""
        SELECT SUM(grand_total) as total
        FROM `tabSales Invoice`
        WHERE posting_date BETWEEN %s AND %s
        AND docstatus = 1
        {hospital_filter}
    """.format(
        hospital_filter=f"AND custom_hospital = '{hospital}'" if hospital else ""
    ), (from_date, to_date))[0][0] or 0

    # Outstanding
    outstanding = frappe.db.sql("""
        SELECT SUM(outstanding_amount) as total
        FROM `tabSales Invoice`
        WHERE posting_date BETWEEN %s AND %s
        AND docstatus = 1
        {hospital_filter}
    """.format(
        hospital_filter=f"AND custom_hospital = '{hospital}'" if hospital else ""
    ), (from_date, to_date))[0][0] or 0

    # By service type
    by_service = frappe.db.sql("""
        SELECT custom_service_type, SUM(grand_total) as total, COUNT(*) as count
        FROM `tabSales Invoice`
        WHERE posting_date BETWEEN %s AND %s
        AND docstatus = 1
        {hospital_filter}
        GROUP BY custom_service_type
    """.format(
        hospital_filter=f"AND custom_hospital = '{hospital}'" if hospital else ""
    ), (from_date, to_date), as_dict=True)

    return {
        "total_revenue": total_revenue,
        "outstanding": outstanding,
        "collected": total_revenue - outstanding,
        "by_service": by_service,
        "from_date": from_date,
        "to_date": to_date
    }


@frappe.whitelist()
def get_pending_payments(hospital=None, limit=50):
    """
    Get list of pending payments

    Args:
        hospital: Hospital name (optional)
        limit: Number of records to return

    Returns:
        List of pending invoices
    """
    filters = {
        "docstatus": 1,
        "outstanding_amount": [">", 0]
    }

    if hospital:
        filters["custom_hospital"] = hospital

    invoices = frappe.get_all(
        "Sales Invoice",
        filters=filters,
        fields=[
            "name", "customer", "custom_patient", "custom_hospital",
            "grand_total", "outstanding_amount", "posting_date",
            "custom_service_type"
        ],
        order_by="posting_date desc",
        limit=limit
    )

    return invoices
