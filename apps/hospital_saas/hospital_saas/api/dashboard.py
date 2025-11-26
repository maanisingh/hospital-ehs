"""
Dashboard API Module

Provides API endpoints for Super Admin Dashboard
and Hospital-specific dashboards.
"""

import frappe
from frappe import _
from frappe.utils import nowdate, add_days, getdate, now_datetime


@frappe.whitelist()
def get_super_admin_dashboard():
    """
    Get Super Admin dashboard data for all hospitals

    Returns:
        Dashboard data with hospital overview, stats, alerts
    """
    # Check if user is super admin
    if not frappe.has_permission("Hospital", "read"):
        frappe.throw(_("Access denied"))

    today = nowdate()

    # Get all hospitals
    hospitals = frappe.get_all(
        "Hospital",
        fields=[
            "name", "organisation_code", "business_name", "city", "state",
            "hospital_type", "status", "subscription_status", "subscription_end",
            "owner_name", "owner_email", "total_beds"
        ],
        order_by="creation desc"
    )

    # Add stats for each hospital
    for hospital in hospitals:
        hospital["patient_count"] = frappe.db.count(
            "Patient", {"custom_hospital": hospital.name}
        )
        hospital["staff_count"] = frappe.db.count(
            "Healthcare Practitioner", {"custom_hospital": hospital.name}
        )
        hospital["today_appointments"] = frappe.db.count(
            "Patient Appointment", {
                "custom_hospital": hospital.name,
                "appointment_date": today
            }
        )
        hospital["today_revenue"] = get_hospital_revenue(hospital.name, today, today)

    # Summary stats
    total_hospitals = len(hospitals)
    active_hospitals = len([h for h in hospitals if h.status == "Active"])
    total_patients = sum(h["patient_count"] for h in hospitals)
    total_staff = sum(h["staff_count"] for h in hospitals)
    total_revenue = sum(h["today_revenue"] or 0 for h in hospitals)

    # Subscription alerts
    subscription_alerts = []
    for hospital in hospitals:
        if hospital.subscription_end:
            days_left = (getdate(hospital.subscription_end) - getdate(today)).days
            if days_left <= 7:
                subscription_alerts.append({
                    "hospital": hospital.name,
                    "business_name": hospital.business_name,
                    "days_left": days_left,
                    "status": "critical" if days_left <= 0 else "warning"
                })

    return {
        "hospitals": hospitals,
        "summary": {
            "total_hospitals": total_hospitals,
            "active_hospitals": active_hospitals,
            "total_patients": total_patients,
            "total_staff": total_staff,
            "today_revenue": total_revenue
        },
        "subscription_alerts": subscription_alerts
    }


@frappe.whitelist()
def get_hospital_dashboard(hospital):
    """
    Get dashboard data for specific hospital

    Args:
        hospital: Hospital name

    Returns:
        Hospital dashboard data
    """
    today = nowdate()
    hospital_doc = frappe.get_doc("Hospital", hospital)

    # Patient stats
    total_patients = frappe.db.count("Patient", {"custom_hospital": hospital})
    new_patients_today = frappe.db.count("Patient", {
        "custom_hospital": hospital,
        "creation": [">=", today]
    })

    # Appointment stats
    today_appointments = frappe.db.count("Patient Appointment", {
        "custom_hospital": hospital,
        "appointment_date": today
    })
    pending_appointments = frappe.db.count("Patient Appointment", {
        "custom_hospital": hospital,
        "appointment_date": today,
        "status": "Open"
    })

    # OPD Queue stats
    opd_waiting = frappe.db.count("OPD Token", {
        "hospital": hospital,
        "token_date": today,
        "status": ["in", ["Waiting", "In Queue"]]
    })
    opd_completed = frappe.db.count("OPD Token", {
        "hospital": hospital,
        "token_date": today,
        "status": "Completed"
    })

    # Lab stats
    lab_pending = frappe.db.count("Lab Test", {
        "custom_hospital": hospital,
        "custom_queue_status": ["in", ["Waiting", "Sample Collection", "Processing"]]
    })
    lab_completed_today = frappe.db.count("Lab Test", {
        "custom_hospital": hospital,
        "custom_queue_status": "Completed",
        "modified": [">=", today]
    })

    # Radiology stats
    radiology_pending = frappe.db.count("Radiology Order", {
        "hospital": hospital,
        "status": ["in", ["Pending", "In Progress"]]
    })

    # IPD stats
    ipd_admitted = frappe.db.count("IPD Admission", {
        "hospital": hospital,
        "status": "Admitted"
    })

    # Revenue
    today_revenue = get_hospital_revenue(hospital, today, today)
    month_start = today[:8] + "01"
    month_revenue = get_hospital_revenue(hospital, month_start, today)

    # Outstanding
    outstanding = frappe.db.sql("""
        SELECT COALESCE(SUM(outstanding_amount), 0)
        FROM `tabSales Invoice`
        WHERE custom_hospital = %s AND docstatus = 1
    """, hospital)[0][0] or 0

    # Staff on duty
    staff_count = frappe.db.count("Healthcare Practitioner", {"custom_hospital": hospital})

    return {
        "hospital": {
            "name": hospital_doc.name,
            "business_name": hospital_doc.business_name,
            "organisation_code": hospital_doc.organisation_code,
            "subscription_status": hospital_doc.subscription_status
        },
        "patients": {
            "total": total_patients,
            "new_today": new_patients_today
        },
        "appointments": {
            "today": today_appointments,
            "pending": pending_appointments
        },
        "opd": {
            "waiting": opd_waiting,
            "completed": opd_completed
        },
        "lab": {
            "pending": lab_pending,
            "completed_today": lab_completed_today
        },
        "radiology": {
            "pending": radiology_pending
        },
        "ipd": {
            "admitted": ipd_admitted,
            "available_beds": (hospital_doc.total_beds or 0) - ipd_admitted
        },
        "revenue": {
            "today": today_revenue,
            "month": month_revenue,
            "outstanding": outstanding
        },
        "staff": {
            "total": staff_count
        }
    }


def get_hospital_revenue(hospital, from_date, to_date):
    """Get revenue for hospital between dates"""
    result = frappe.db.sql("""
        SELECT COALESCE(SUM(grand_total), 0)
        FROM `tabSales Invoice`
        WHERE custom_hospital = %s
        AND posting_date BETWEEN %s AND %s
        AND docstatus = 1
    """, (hospital, from_date, to_date))
    return result[0][0] if result else 0


@frappe.whitelist()
def get_recent_activity(hospital=None, limit=20):
    """
    Get recent activity for dashboard

    Args:
        hospital: Hospital name (optional, all if not provided)
        limit: Number of records

    Returns:
        List of recent activities
    """
    activities = []

    # Recent patients
    patient_filters = {}
    if hospital:
        patient_filters["custom_hospital"] = hospital

    recent_patients = frappe.get_all(
        "Patient",
        filters=patient_filters,
        fields=["name", "patient_name", "custom_hospital", "creation"],
        order_by="creation desc",
        limit=5
    )
    for p in recent_patients:
        activities.append({
            "type": "patient",
            "icon": "user",
            "message": f"New patient registered: {p.patient_name}",
            "time": p.creation,
            "hospital": p.custom_hospital
        })

    # Recent appointments
    appt_filters = {"status": "Open"}
    if hospital:
        appt_filters["custom_hospital"] = hospital

    recent_appointments = frappe.get_all(
        "Patient Appointment",
        filters=appt_filters,
        fields=["name", "patient_name", "practitioner_name", "custom_hospital", "creation"],
        order_by="creation desc",
        limit=5
    )
    for a in recent_appointments:
        activities.append({
            "type": "appointment",
            "icon": "calendar",
            "message": f"Appointment booked: {a.patient_name} with {a.practitioner_name}",
            "time": a.creation,
            "hospital": a.custom_hospital
        })

    # Recent invoices
    inv_filters = {"docstatus": 1}
    if hospital:
        inv_filters["custom_hospital"] = hospital

    recent_invoices = frappe.get_all(
        "Sales Invoice",
        filters=inv_filters,
        fields=["name", "customer", "grand_total", "custom_hospital", "creation"],
        order_by="creation desc",
        limit=5
    )
    for i in recent_invoices:
        activities.append({
            "type": "invoice",
            "icon": "file-text",
            "message": f"Invoice created: ₹{i.grand_total:.2f}",
            "time": i.creation,
            "hospital": i.custom_hospital
        })

    # Sort by time and limit
    activities.sort(key=lambda x: x["time"], reverse=True)
    return activities[:limit]


@frappe.whitelist()
def get_revenue_chart_data(hospital=None, period="month"):
    """
    Get revenue data for charts

    Args:
        hospital: Hospital name (optional)
        period: 'week', 'month', 'year'

    Returns:
        Chart data with dates and values
    """
    today = getdate(nowdate())

    if period == "week":
        from_date = add_days(today, -7)
        group_by = "DATE(posting_date)"
    elif period == "month":
        from_date = add_days(today, -30)
        group_by = "DATE(posting_date)"
    else:  # year
        from_date = add_days(today, -365)
        group_by = "DATE_FORMAT(posting_date, '%Y-%m')"

    data = frappe.db.sql("""
        SELECT
            {group_by} as date,
            SUM(grand_total) as revenue,
            COUNT(*) as count
        FROM `tabSales Invoice`
        WHERE posting_date >= %s
        AND docstatus = 1
        {hospital_filter}
        GROUP BY {group_by}
        ORDER BY date ASC
    """.format(
        group_by=group_by,
        hospital_filter=f"AND custom_hospital = '{hospital}'" if hospital else ""
    ), (from_date,), as_dict=True)

    return {
        "labels": [str(d["date"]) for d in data],
        "values": [float(d["revenue"] or 0) for d in data],
        "counts": [d["count"] for d in data]
    }


@frappe.whitelist()
def get_department_stats(hospital):
    """
    Get department-wise statistics

    Args:
        hospital: Hospital name

    Returns:
        Department statistics
    """
    today = nowdate()

    # Get departments
    departments = frappe.get_all(
        "Medical Department",
        filters={"custom_hospital": ["in", [hospital, None, ""]]},
        fields=["name", "department"]
    )

    stats = []
    for dept in departments:
        # Appointments today
        appointments = frappe.db.count("Patient Appointment", {
            "custom_hospital": hospital,
            "department": dept.name,
            "appointment_date": today
        })

        # Staff count
        staff = frappe.db.count("Healthcare Practitioner", {
            "custom_hospital": hospital,
            "department": dept.name
        })

        stats.append({
            "department": dept.department or dept.name,
            "appointments_today": appointments,
            "staff_count": staff
        })

    return stats


@frappe.whitelist()
def create_hospital_wizard(hospital_data, admin_data=None):
    """
    Create new hospital with optional admin user (for Super Admin)

    Args:
        hospital_data: Hospital details dict
        admin_data: Admin user details dict (optional)

    Returns:
        Created hospital details
    """
    # Validate required fields
    required = ["business_name", "email", "address_line_1", "city", "state", "pincode",
                "owner_name", "owner_email", "owner_mobile"]

    for field in required:
        if not hospital_data.get(field):
            frappe.throw(_("{0} is required").format(field))

    # Create hospital
    hospital = frappe.new_doc("Hospital")
    for key, value in hospital_data.items():
        if hasattr(hospital, key):
            setattr(hospital, key, value)

    hospital.status = "Active"
    hospital.subscription_status = "Trial"
    hospital.insert(ignore_permissions=True)

    result = {
        "hospital": hospital.name,
        "organisation_code": hospital.organisation_code,
        "business_name": hospital.business_name
    }

    # Create admin user if provided
    if admin_data and admin_data.get("email"):
        try:
            user = frappe.new_doc("User")
            user.email = admin_data.get("email")
            user.first_name = admin_data.get("first_name", "Admin")
            user.last_name = admin_data.get("last_name", "")
            user.send_welcome_email = 1
            user.append("roles", {"role": "Hospital Administrator"})
            user.insert(ignore_permissions=True)

            # Link admin to hospital
            hospital.db_set("admin_user", user.name)
            result["admin_user"] = user.name

        except Exception as e:
            result["admin_error"] = str(e)

    frappe.db.commit()
    return result
