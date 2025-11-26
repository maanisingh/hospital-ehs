"""
Hospital SAAS Hooks Configuration

This file contains the hooks for the Hospital SAAS application.
Hooks are used to extend or override the behavior of Frappe/ERPNext.
"""

app_name = "hospital_saas"
app_title = "Hospital SAAS"
app_publisher = "Alexandra Tech Lab"
app_description = "Multi-Tenant Hospital Management SAAS Platform"
app_email = "maanindersinghsidhu@gmail.com"
app_license = "MIT"
app_version = "1.0.0"

# Required Apps
required_apps = ["frappe", "erpnext", "healthcare"]

# Includes in <head>
# ------------------

# Include JS/CSS in header
app_include_css = "/assets/hospital_saas/css/hospital_saas.css"
app_include_js = "/assets/hospital_saas/js/hospital_saas.js"

# Include JS/CSS in web pages
# web_include_css = "/assets/hospital_saas/css/hospital_saas.css"
# web_include_js = "/assets/hospital_saas/js/hospital_saas.js"

# Home Pages
# ----------

# Default landing page for desk users
default_home_page = "Hospital SAAS"

# Website user home page (by Role)
role_home_page = {
    "Healthcare Administrator": "Hospital SAAS",
    "Physician": "Hospital SAAS",
    "Nursing User": "Hospital SAAS",
    "Laboratory User": "Hospital SAAS",
}

# Installation
# ------------

after_install = "hospital_saas.setup.install.after_install"
after_migrate = "hospital_saas.setup.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "hospital_saas.uninstall.before_uninstall"

# Desk Notifications
# ------------------

notification_config = "hospital_saas.notifications.get_notification_config"

# Permissions
# -----------

permission_query_conditions = {
    "Patient": "hospital_saas.permissions.patient_query",
    "Patient Appointment": "hospital_saas.permissions.appointment_query",
}

# Document Events
# ---------------

doc_events = {
    "Patient": {
        "after_insert": "hospital_saas.events.patient.after_insert",
    },
    "Patient Appointment": {
        "on_submit": "hospital_saas.events.appointment.on_submit",
        "on_cancel": "hospital_saas.events.appointment.on_cancel",
    }
}

# Scheduled Tasks
# ---------------

scheduler_events = {
    "daily": [
        "hospital_saas.tasks.daily.run_daily_tasks"
    ],
    "hourly": [
        "hospital_saas.tasks.hourly.run_hourly_tasks"
    ],
    "weekly": [
        "hospital_saas.tasks.weekly.run_weekly_tasks"
    ],
    "cron": {
        # Send appointment reminders at 8 AM
        "0 8 * * *": [
            "hospital_saas.tasks.daily.send_appointment_reminders"
        ]
    }
}

# Fixtures - Export these DocTypes
# --------------------------------

fixtures = [
    {
        "dt": "Workspace",
        "filters": [["module", "=", "Hospital SAAS"]]
    },
    {
        "dt": "Role",
        "filters": [["name", "in", [
            "Hospital Administrator",
            "Hospital Doctor",
            "Hospital Nurse",
            "Hospital Receptionist",
            "Hospital Pharmacist",
            "Hospital Lab Technician",
            "Hospital Accountant",
            "Tenant Admin"
        ]]]
    }
]

# Multi-Tenant Settings
# ---------------------

tenant_field = "hospital"

# Boot Session Info
# -----------------

boot_session = "hospital_saas.boot.get_boot_info"

# Website Route Rules
# -------------------

website_route_rules = [
    {"from_route": "/hospital/<path:app_path>", "to_route": "hospital"},
    {"from_route": "/book-appointment", "to_route": "book_appointment"},
]

# Default Module Order (Hospital SAAS first)
# ------------------------------------------

default_module_order = [
    "Hospital SAAS",
    "Healthcare",
    "Accounts",
    "Stock",
]

# Modules to Hide from Non-Admin Users
# ------------------------------------

modules_to_hide = [
    "Manufacturing",
    "Quality",
    "Projects",
    "CRM",
    "Buying",
    "Selling",
    "Assets",
]

# Standard Portal Menu Items (for patients)
# -----------------------------------------

standard_portal_menu_items = [
    {"title": "My Appointments", "route": "/appointments", "reference_doctype": "Patient Appointment"},
    {"title": "My Records", "route": "/patient-records", "reference_doctype": "Patient"},
]

# Onboarding Steps
# ----------------

setup_wizard_requires = "assets/hospital_saas/js/setup_wizard.js"

# Workspace Icons
# ---------------

workspace_icons = {
    "Hospital SAAS": "hospital"
}
