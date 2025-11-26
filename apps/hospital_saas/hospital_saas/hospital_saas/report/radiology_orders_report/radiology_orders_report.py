# Copyright (c) 2024, Hospital SAAS and contributors
# For license information, please see license.txt

"""
Radiology Orders Report

Comprehensive report for radiology department analytics
"""

import frappe
from frappe import _
from frappe.utils import getdate, add_days, nowdate


def execute(filters=None):
    columns = get_columns()
    data = get_data(filters)
    chart = get_chart(filters)
    summary = get_summary(filters)

    return columns, data, None, chart, summary


def get_columns():
    return [
        {
            "fieldname": "name",
            "label": _("Order ID"),
            "fieldtype": "Link",
            "options": "Radiology Order",
            "width": 120
        },
        {
            "fieldname": "order_date",
            "label": _("Order Date"),
            "fieldtype": "Date",
            "width": 100
        },
        {
            "fieldname": "patient_name",
            "label": _("Patient"),
            "fieldtype": "Data",
            "width": 150
        },
        {
            "fieldname": "examination_type",
            "label": _("Examination"),
            "fieldtype": "Link",
            "options": "Radiology Examination Type",
            "width": 150
        },
        {
            "fieldname": "modality",
            "label": _("Modality"),
            "fieldtype": "Data",
            "width": 100
        },
        {
            "fieldname": "priority",
            "label": _("Priority"),
            "fieldtype": "Data",
            "width": 80
        },
        {
            "fieldname": "status",
            "label": _("Status"),
            "fieldtype": "Data",
            "width": 100
        },
        {
            "fieldname": "practitioner_name",
            "label": _("Ordering Doctor"),
            "fieldtype": "Data",
            "width": 140
        },
        {
            "fieldname": "rate",
            "label": _("Rate"),
            "fieldtype": "Currency",
            "width": 100
        },
        {
            "fieldname": "invoiced",
            "label": _("Invoiced"),
            "fieldtype": "Check",
            "width": 80
        },
        {
            "fieldname": "turnaround_hours",
            "label": _("TAT (Hours)"),
            "fieldtype": "Float",
            "precision": 1,
            "width": 100
        }
    ]


def get_data(filters):
    conditions = get_conditions(filters)

    data = frappe.db.sql("""
        SELECT
            ro.name,
            ro.order_date,
            ro.patient,
            ro.patient_name,
            ro.examination_type,
            ro.modality,
            ro.body_part,
            ro.priority,
            ro.status,
            ro.practitioner_name,
            ro.rate,
            ro.invoiced,
            ro.scheduled_date,
            ro.scheduled_time,
            rr.name as result_name,
            rr.examination_date as result_date,
            CASE
                WHEN rr.examination_date IS NOT NULL THEN
                    TIMESTAMPDIFF(HOUR,
                        CONCAT(ro.order_date, ' ', COALESCE(ro.order_time, '00:00:00')),
                        CONCAT(rr.examination_date, ' ', COALESCE(rr.examination_time, '00:00:00'))
                    )
                ELSE NULL
            END as turnaround_hours
        FROM `tabRadiology Order` ro
        LEFT JOIN `tabRadiology Result` rr ON rr.radiology_order = ro.name AND rr.docstatus = 1
        WHERE ro.docstatus = 1
        {conditions}
        ORDER BY ro.order_date DESC, ro.creation DESC
    """.format(conditions=conditions), filters, as_dict=True)

    return data


def get_conditions(filters):
    conditions = []

    if filters.get("from_date"):
        conditions.append("ro.order_date >= %(from_date)s")

    if filters.get("to_date"):
        conditions.append("ro.order_date <= %(to_date)s")

    if filters.get("modality"):
        conditions.append("ro.modality = %(modality)s")

    if filters.get("status"):
        conditions.append("ro.status = %(status)s")

    if filters.get("priority"):
        conditions.append("ro.priority = %(priority)s")

    if filters.get("practitioner"):
        conditions.append("ro.practitioner = %(practitioner)s")

    if filters.get("examination_type"):
        conditions.append("ro.examination_type = %(examination_type)s")

    return "AND " + " AND ".join(conditions) if conditions else ""


def get_chart(filters):
    """Get chart data for modality distribution"""
    conditions = get_conditions(filters)

    modality_data = frappe.db.sql("""
        SELECT
            ro.modality,
            COUNT(*) as count
        FROM `tabRadiology Order` ro
        WHERE ro.docstatus = 1
        {conditions}
        GROUP BY ro.modality
        ORDER BY count DESC
    """.format(conditions=conditions), filters, as_dict=True)

    if not modality_data:
        return None

    return {
        "data": {
            "labels": [d.modality for d in modality_data],
            "datasets": [
                {
                    "name": _("Orders"),
                    "values": [d.count for d in modality_data]
                }
            ]
        },
        "type": "bar",
        "colors": ["#4f46e5"],
        "barOptions": {
            "spaceRatio": 0.4
        }
    }


def get_summary(filters):
    """Get summary statistics"""
    conditions = get_conditions(filters)

    stats = frappe.db.sql("""
        SELECT
            COUNT(*) as total_orders,
            COUNT(CASE WHEN ro.status = 'Completed' THEN 1 END) as completed,
            COUNT(CASE WHEN ro.status IN ('Ordered', 'Scheduled', 'In Progress') THEN 1 END) as pending,
            COUNT(CASE WHEN ro.status = 'Cancelled' THEN 1 END) as cancelled,
            COUNT(CASE WHEN ro.priority = 'STAT' THEN 1 END) as stat_orders,
            COUNT(CASE WHEN ro.priority = 'Urgent' THEN 1 END) as urgent_orders,
            SUM(ro.rate) as total_revenue,
            SUM(CASE WHEN ro.invoiced = 1 THEN ro.rate ELSE 0 END) as invoiced_revenue,
            AVG(
                CASE
                    WHEN rr.examination_date IS NOT NULL THEN
                        TIMESTAMPDIFF(HOUR,
                            CONCAT(ro.order_date, ' ', COALESCE(ro.order_time, '00:00:00')),
                            CONCAT(rr.examination_date, ' ', COALESCE(rr.examination_time, '00:00:00'))
                        )
                    ELSE NULL
                END
            ) as avg_turnaround
        FROM `tabRadiology Order` ro
        LEFT JOIN `tabRadiology Result` rr ON rr.radiology_order = ro.name AND rr.docstatus = 1
        WHERE ro.docstatus = 1
        {conditions}
    """.format(conditions=conditions), filters, as_dict=True)[0]

    return [
        {
            "value": stats.total_orders or 0,
            "indicator": "Blue",
            "label": _("Total Orders"),
            "datatype": "Int"
        },
        {
            "value": stats.completed or 0,
            "indicator": "Green",
            "label": _("Completed"),
            "datatype": "Int"
        },
        {
            "value": stats.pending or 0,
            "indicator": "Orange",
            "label": _("Pending"),
            "datatype": "Int"
        },
        {
            "value": stats.stat_orders or 0,
            "indicator": "Red",
            "label": _("STAT Orders"),
            "datatype": "Int"
        },
        {
            "value": stats.total_revenue or 0,
            "indicator": "Blue",
            "label": _("Total Revenue"),
            "datatype": "Currency"
        },
        {
            "value": round(stats.avg_turnaround or 0, 1),
            "indicator": "Purple",
            "label": _("Avg TAT (Hours)"),
            "datatype": "Float"
        }
    ]
