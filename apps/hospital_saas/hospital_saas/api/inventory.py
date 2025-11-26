"""
Inventory API Module

Integrates Hospital SAAS with ERPNext Stock module
for medicine inventory management with expiry tracking.
"""

import frappe
from frappe import _
from frappe.utils import nowdate, add_days, getdate, flt


@frappe.whitelist()
def get_stock_summary(hospital=None, warehouse=None):
    """
    Get stock summary for hospital

    Args:
        hospital: Hospital name (optional)
        warehouse: Warehouse name (optional)

    Returns:
        Stock summary dict
    """
    filters = {}

    if warehouse:
        filters["warehouse"] = warehouse

    # Get stock levels
    stock_data = frappe.db.sql("""
        SELECT
            bin.item_code,
            item.item_name,
            item.item_group,
            bin.warehouse,
            bin.actual_qty,
            bin.reserved_qty,
            bin.ordered_qty,
            item.custom_is_medicine,
            item.custom_generic_name
        FROM `tabBin` bin
        INNER JOIN `tabItem` item ON bin.item_code = item.name
        WHERE bin.actual_qty > 0
        {warehouse_filter}
        {hospital_filter}
        ORDER BY item.item_group, item.item_name
    """.format(
        warehouse_filter=f"AND bin.warehouse = '{warehouse}'" if warehouse else "",
        hospital_filter=f"AND item.custom_hospital = '{hospital}'" if hospital else ""
    ), as_dict=True)

    return {
        "items": stock_data,
        "total_items": len(stock_data),
        "total_qty": sum(item["actual_qty"] for item in stock_data)
    }


@frappe.whitelist()
def get_expiring_items(hospital=None, days=30):
    """
    Get items expiring within specified days

    Args:
        hospital: Hospital name (optional)
        days: Number of days to check (default 30)

    Returns:
        List of expiring items
    """
    today = getdate(nowdate())
    expiry_date = add_days(today, int(days))

    expiring = frappe.db.sql("""
        SELECT
            batch.name as batch_id,
            batch.item as item_code,
            item.item_name,
            batch.expiry_date,
            sle.warehouse,
            SUM(sle.actual_qty) as qty,
            DATEDIFF(batch.expiry_date, CURDATE()) as days_to_expiry
        FROM `tabBatch` batch
        INNER JOIN `tabItem` item ON batch.item = item.name
        LEFT JOIN `tabStock Ledger Entry` sle ON sle.batch_no = batch.name
        WHERE batch.expiry_date IS NOT NULL
        AND batch.expiry_date <= %s
        AND batch.expiry_date >= CURDATE()
        {hospital_filter}
        GROUP BY batch.name, sle.warehouse
        HAVING qty > 0
        ORDER BY batch.expiry_date ASC
    """.format(
        hospital_filter=f"AND batch.custom_hospital = '{hospital}'" if hospital else ""
    ), (expiry_date,), as_dict=True)

    # Categorize by urgency
    critical = []  # 0-7 days
    warning = []   # 8-15 days
    notice = []    # 16-30 days

    for item in expiring:
        days_left = item.get("days_to_expiry", 0)
        if days_left <= 7:
            critical.append(item)
        elif days_left <= 15:
            warning.append(item)
        else:
            notice.append(item)

    return {
        "all": expiring,
        "critical": critical,
        "warning": warning,
        "notice": notice,
        "total_count": len(expiring)
    }


@frappe.whitelist()
def get_low_stock_items(hospital=None, threshold_percentage=20):
    """
    Get items with low stock (below reorder level)

    Args:
        hospital: Hospital name (optional)
        threshold_percentage: Percentage of reorder level to consider low

    Returns:
        List of low stock items
    """
    low_stock = frappe.db.sql("""
        SELECT
            bin.item_code,
            item.item_name,
            item.item_group,
            bin.warehouse,
            bin.actual_qty,
            item.reorder_levels.warehouse_reorder_level as reorder_level,
            item.reorder_levels.warehouse_reorder_qty as reorder_qty
        FROM `tabBin` bin
        INNER JOIN `tabItem` item ON bin.item_code = item.name
        LEFT JOIN `tabItem Reorder` reorder ON reorder.parent = item.name
            AND reorder.warehouse = bin.warehouse
        WHERE bin.actual_qty <= COALESCE(reorder.warehouse_reorder_level, 10)
        {hospital_filter}
        ORDER BY bin.actual_qty ASC
    """.format(
        hospital_filter=f"AND item.custom_hospital = '{hospital}'" if hospital else ""
    ), as_dict=True)

    return {
        "items": low_stock,
        "count": len(low_stock)
    }


@frappe.whitelist()
def get_medicine_stock(hospital=None, warehouse=None):
    """
    Get medicine-specific stock with batch details

    Args:
        hospital: Hospital name (optional)
        warehouse: Warehouse name (optional)

    Returns:
        List of medicines with batch details
    """
    medicines = frappe.db.sql("""
        SELECT
            item.name as item_code,
            item.item_name,
            item.custom_generic_name as generic_name,
            item.custom_manufacturer as manufacturer,
            COALESCE(SUM(sle.actual_qty), 0) as total_qty,
            GROUP_CONCAT(DISTINCT batch.name) as batches
        FROM `tabItem` item
        LEFT JOIN `tabStock Ledger Entry` sle ON sle.item_code = item.name
        LEFT JOIN `tabBatch` batch ON batch.name = sle.batch_no
        WHERE item.custom_is_medicine = 1
        {hospital_filter}
        {warehouse_filter}
        GROUP BY item.name
        HAVING total_qty > 0
        ORDER BY item.item_name
    """.format(
        hospital_filter=f"AND item.custom_hospital = '{hospital}'" if hospital else "",
        warehouse_filter=f"AND sle.warehouse = '{warehouse}'" if warehouse else ""
    ), as_dict=True)

    # Get batch details for each medicine
    for med in medicines:
        if med.batches:
            batch_list = med.batches.split(",")
            med["batch_details"] = frappe.get_all(
                "Batch",
                filters={"name": ["in", batch_list]},
                fields=["name", "expiry_date", "manufacturing_date"]
            )

    return medicines


@frappe.whitelist()
def create_stock_entry(items, stock_entry_type, hospital=None, warehouse=None):
    """
    Create stock entry for hospital inventory

    Args:
        items: List of items [{item_code, qty, batch_no, rate}]
        stock_entry_type: Type (Material Receipt, Material Issue, etc.)
        hospital: Hospital name
        warehouse: Target/Source warehouse

    Returns:
        Stock Entry name
    """
    company = frappe.db.get_single_value("Global Defaults", "default_company")

    stock_entry = frappe.new_doc("Stock Entry")
    stock_entry.stock_entry_type = stock_entry_type
    stock_entry.company = company
    stock_entry.custom_hospital = hospital

    for item in items:
        entry_item = {
            "item_code": item.get("item_code"),
            "qty": flt(item.get("qty")),
            "basic_rate": flt(item.get("rate", 0))
        }

        if item.get("batch_no"):
            entry_item["batch_no"] = item.get("batch_no")

        if stock_entry_type == "Material Receipt":
            entry_item["t_warehouse"] = warehouse
        elif stock_entry_type == "Material Issue":
            entry_item["s_warehouse"] = warehouse
        else:
            entry_item["s_warehouse"] = item.get("source_warehouse")
            entry_item["t_warehouse"] = item.get("target_warehouse")

        stock_entry.append("items", entry_item)

    stock_entry.insert(ignore_permissions=True)

    return {"stock_entry": stock_entry.name}


@frappe.whitelist()
def dispense_medicine(prescription, items, warehouse):
    """
    Dispense medicines from pharmacy for a prescription

    Args:
        prescription: Pharmacy Prescription name
        items: List of items to dispense [{item_code, qty, batch_no}]
        warehouse: Source warehouse

    Returns:
        Stock Entry name
    """
    presc_doc = frappe.get_doc("Pharmacy Prescription", prescription)

    # Create material issue
    result = create_stock_entry(
        items=items,
        stock_entry_type="Material Issue",
        hospital=presc_doc.hospital,
        warehouse=warehouse
    )

    # Update prescription status
    presc_doc.db_set("status", "Dispensed")
    presc_doc.db_set("dispensed_date", nowdate())

    return result


@frappe.whitelist()
def get_inventory_valuation(hospital=None, warehouse=None):
    """
    Get inventory valuation for hospital

    Args:
        hospital: Hospital name (optional)
        warehouse: Warehouse name (optional)

    Returns:
        Valuation summary
    """
    valuation = frappe.db.sql("""
        SELECT
            item.item_group,
            SUM(bin.actual_qty * bin.valuation_rate) as value,
            SUM(bin.actual_qty) as qty,
            COUNT(DISTINCT bin.item_code) as items
        FROM `tabBin` bin
        INNER JOIN `tabItem` item ON bin.item_code = item.name
        WHERE bin.actual_qty > 0
        {hospital_filter}
        {warehouse_filter}
        GROUP BY item.item_group
        ORDER BY value DESC
    """.format(
        hospital_filter=f"AND item.custom_hospital = '{hospital}'" if hospital else "",
        warehouse_filter=f"AND bin.warehouse = '{warehouse}'" if warehouse else ""
    ), as_dict=True)

    total_value = sum(v["value"] or 0 for v in valuation)
    total_qty = sum(v["qty"] or 0 for v in valuation)

    return {
        "by_group": valuation,
        "total_value": total_value,
        "total_qty": total_qty
    }


@frappe.whitelist()
def get_expiry_alerts():
    """
    Get expiry alerts for scheduled task

    Returns:
        List of expiring items to alert
    """
    alerts = []

    # Items expiring in 7 days
    expiring_7 = get_expiring_items(days=7)
    if expiring_7["critical"]:
        alerts.append({
            "type": "critical",
            "message": f"{len(expiring_7['critical'])} items expiring within 7 days",
            "items": expiring_7["critical"]
        })

    # Items expiring in 15 days
    expiring_15 = get_expiring_items(days=15)
    if expiring_15["warning"]:
        alerts.append({
            "type": "warning",
            "message": f"{len(expiring_15['warning'])} items expiring within 15 days",
            "items": expiring_15["warning"]
        })

    return alerts
