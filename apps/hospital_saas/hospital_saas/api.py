"""
Hospital SAAS API Endpoints

Whitelisted methods for frontend API calls.
"""

import frappe
from frappe import _


@frappe.whitelist()
def get_dashboard_stats():
    """Get dashboard statistics for the current hospital"""
    user = frappe.session.user

    # Get user's hospital
    hospital = None
    if user != "Administrator":
        try:
            from hospital_saas.permissions import get_user_hospital
            hospital = get_user_hospital()
        except:
            pass

    # Get today's date
    today = frappe.utils.today()

    # Patient count
    try:
        total_patients = frappe.db.count("Patient") or 0
    except:
        total_patients = 0

    # Today's appointments
    try:
        todays_appointments = frappe.db.count("Patient Appointment", {"appointment_date": today}) or 0
    except:
        todays_appointments = 0

    # Today's tokens (OPD)
    try:
        active_tokens = frappe.db.count("OPD Token", {
            "token_date": today,
            "status": ["in", ["Waiting", "In Progress", "Called"]]
        }) or 0
    except:
        active_tokens = 0

    # Today's revenue
    try:
        todays_revenue = frappe.db.sql("""
            SELECT COALESCE(SUM(grand_total), 0) as total
            FROM `tabSales Invoice`
            WHERE posting_date = %s AND docstatus = 1
        """, today)[0][0] or 0
    except:
        todays_revenue = 0

    # IPD Admissions (Active)
    try:
        active_ipd = frappe.db.count("IPD Admission", {
            "status": ["in", ["Admitted", "In Treatment"]]
        }) or 0
    except:
        active_ipd = 0

    return {
        "total_patients": total_patients,
        "todays_appointments": todays_appointments,
        "active_tokens": active_tokens,
        "todays_revenue": todays_revenue,
        "active_ipd": active_ipd,
        "hospital": hospital or "All Hospitals"
    }


@frappe.whitelist(allow_guest=True)
def get_queue_display(hospital=None):
    """Get queue display data for TV/Display screens - linked to OPD Tokens"""
    today = frappe.utils.today()

    filters = {
        "token_date": today,
        "status": ["in", ["Waiting", "In Queue", "With Doctor", "Called"]]
    }

    if hospital:
        filters["hospital"] = hospital

    # Get all active tokens
    try:
        tokens = frappe.get_all(
            "OPD Token",
            filters=filters,
            fields=["name", "token_number", "patient", "patient_name", "status",
                    "department", "practitioner", "queue_position"],
            order_by="queue_position asc, token_number asc"
        )
    except Exception as e:
        frappe.log_error(f"Queue display error: {str(e)}")
        tokens = []

    # Get practitioner names
    for token in tokens:
        if token.get("practitioner"):
            try:
                token["practitioner_name"] = frappe.db.get_value(
                    "Healthcare Practitioner", token["practitioner"], "practitioner_name"
                ) or token["practitioner"]
            except:
                token["practitioner_name"] = token["practitioner"]
        else:
            token["practitioner_name"] = ""

    # Find current token (With Doctor or Called)
    current = None
    queue = []

    for token in tokens:
        if token.status in ["With Doctor", "Called"]:
            current = token
        else:
            queue.append(token)

    # Get hospital name
    hospital_name = "Hospital OPD"
    if hospital:
        try:
            hospital_name = frappe.db.get_value("Hospital", hospital, "hospital_name") or hospital
        except:
            pass

    # Return format matching frontend expectations
    return {
        "hospital_name": hospital_name,
        "current": current,
        "queue": queue,
        "total_waiting": len(queue),
        "date": today
    }


@frappe.whitelist()
def call_next_token(hospital=None):
    """Call the next waiting token"""
    today = frappe.utils.today()

    filters = {
        "token_date": today,
        "status": "Waiting"
    }

    if hospital:
        filters["hospital"] = hospital

    # Get next waiting token
    next_token = frappe.get_all(
        "OPD Token",
        filters=filters,
        fields=["name", "token_number"],
        order_by="token_number asc",
        limit=1
    )

    if not next_token:
        return {"success": False, "message": _("No waiting tokens")}

    # Update token status
    token = frappe.get_doc("OPD Token", next_token[0].name)
    token.status = "Called"
    token.save()

    # Publish realtime event
    frappe.publish_realtime(
        "token_called",
        {
            "token_number": token.token_number,
            "patient_name": token.patient_name
        },
        doctype="OPD Token"
    )

    return {
        "success": True,
        "token_number": token.token_number,
        "patient_name": token.patient_name
    }


@frappe.whitelist()
def generate_opd_token(patient, practitioner=None, department=None, hospital=None):
    """Generate a new OPD token for a patient"""
    today = frappe.utils.today()

    # Get next token number for today
    last_token = frappe.db.sql("""
        SELECT MAX(token_number) as max_token
        FROM `tabOPD Token`
        WHERE token_date = %s
    """, today)[0][0] or 0

    next_number = int(last_token) + 1

    # Get patient details
    patient_doc = frappe.get_doc("Patient", patient)

    # Create new token
    token = frappe.get_doc({
        "doctype": "OPD Token",
        "token_date": today,
        "token_number": next_number,
        "patient": patient,
        "patient_name": patient_doc.patient_name,
        "practitioner": practitioner,
        "department": department,
        "hospital": hospital,
        "status": "Waiting"
    })
    token.insert()

    # Publish realtime event
    frappe.publish_realtime(
        "new_token",
        {
            "token_number": next_number,
            "patient_name": patient_doc.patient_name
        },
        doctype="OPD Token"
    )

    return {
        "success": True,
        "token_number": next_number,
        "token_name": token.name
    }


@frappe.whitelist()
def update_token_status(token_name, status):
    """Update OPD token status"""
    valid_statuses = ["Waiting", "Called", "In Progress", "Completed", "Cancelled", "No Show"]

    if status not in valid_statuses:
        frappe.throw(_("Invalid status: {0}").format(status))

    token = frappe.get_doc("OPD Token", token_name)
    old_status = token.status
    token.status = status
    token.save()

    # Publish realtime event
    frappe.publish_realtime(
        "token_status_changed",
        {
            "token_name": token_name,
            "token_number": token.token_number,
            "old_status": old_status,
            "new_status": status
        },
        doctype="OPD Token"
    )

    return {"success": True, "status": status}


@frappe.whitelist()
def get_practitioner_tokens(practitioner):
    """Get tokens assigned to a specific practitioner"""
    today = frappe.utils.today()

    tokens = frappe.get_all(
        "OPD Token",
        filters={
            "token_date": today,
            "practitioner": practitioner,
            "status": ["in", ["Waiting", "Called", "In Progress"]]
        },
        fields=["name", "token_number", "patient", "patient_name", "status", "creation"],
        order_by="token_number asc"
    )

    return tokens


@frappe.whitelist()
def get_ipd_dashboard_data(hospital=None):
    """Get IPD dashboard data"""
    filters = {"status": ["in", ["Admitted", "In Treatment"]]}
    if hospital:
        filters["hospital"] = hospital

    try:
        admissions = frappe.get_all(
            "IPD Admission",
            filters=filters,
            fields=[
                "name", "patient", "patient_name", "admission_date",
                "bed", "ward", "attending_physician", "status"
            ],
            order_by="admission_date desc",
            limit=50
        )
    except:
        admissions = []

    # Get bed occupancy stats
    try:
        total_beds = frappe.db.count("Healthcare Service Unit", {"is_bed": 1}) or 100
        occupied_beds = frappe.db.count(
            "IPD Admission",
            {"status": ["in", ["Admitted", "In Treatment"]], "bed": ["is", "set"]}
        ) or 0
    except:
        total_beds = 100
        occupied_beds = 0

    return {
        "admissions": admissions,
        "total_beds": total_beds,
        "occupied_beds": occupied_beds,
        "available_beds": total_beds - occupied_beds,
        "occupancy_rate": round((occupied_beds / total_beds * 100), 1) if total_beds > 0 else 0
    }


@frappe.whitelist()
def get_next_token_number(hospital=None, token_date=None):
    """Get the next token number for a hospital on a given date"""
    if not token_date:
        token_date = frappe.utils.today()

    filters = {"token_date": token_date}
    if hospital:
        filters["hospital"] = hospital

    # Get the maximum token number for today
    try:
        result = frappe.db.sql("""
            SELECT MAX(CAST(token_number AS UNSIGNED)) as max_token
            FROM `tabOPD Token`
            WHERE token_date = %s
            {hospital_filter}
        """.format(
            hospital_filter=f"AND hospital = {frappe.db.escape(hospital)}" if hospital else ""
        ), token_date)

        max_token = result[0][0] if result and result[0][0] else 0
        return int(max_token) + 1
    except Exception:
        return 1


@frappe.whitelist(allow_guest=True)
def get_queue_for_hospital(hospital):
    """Get queue display data for a specific hospital - public endpoint"""
    return get_queue_display(hospital=hospital)
