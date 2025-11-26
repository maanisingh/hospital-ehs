"""
Hospital SAAS Hooks Configuration

Multi-Tenant Hospital Management SAAS Platform
Includes OPD Token System, IPD Management, Queue Display
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

# ============================================
# INCLUDES IN <head>
# ============================================

# Include JS/CSS in header (desk)
app_include_css = "/assets/hospital_saas/css/hospital_saas.css"
app_include_js = "/assets/hospital_saas/js/hospital_saas.js"

# Include JS/CSS in web pages (portal)
web_include_css = "/assets/hospital_saas/css/hospital_saas.css"
web_include_js = "/assets/hospital_saas/js/hospital_saas.js"

# ============================================
# HOME PAGES - Use standard Frappe desk
# ============================================

# Let Frappe handle home page routing
# Users will land on /app which shows the desk with our custom navbar

# ============================================
# WEBSITE ROUTE RULES (Patient Portal, Queue Display)
# ============================================

website_route_rules = [
    {"from_route": "/queue/<hospital>", "to_route": "queue"},
    {"from_route": "/radiology-queue", "to_route": "radiology-queue"},
    {"from_route": "/radiology-queue/<hospital>", "to_route": "radiology-queue"},
    {"from_route": "/pharmacy-queue", "to_route": "pharmacy-queue"},
    {"from_route": "/pharmacy-queue/<hospital>", "to_route": "pharmacy-queue"},
    {"from_route": "/patient-portal", "to_route": "patient_portal"},
    {"from_route": "/book-appointment/<hospital>", "to_route": "book_appointment"},
    {"from_route": "/hospital/<path:app_path>", "to_route": "hospital"},
]

# ============================================
# INSTALLATION
# ============================================

after_install = "hospital_saas.setup.install.after_install"
after_migrate = "hospital_saas.setup.install.after_install"

# ============================================
# DESK NOTIFICATIONS
# ============================================

notification_config = "hospital_saas.notifications.get_notification_config"

# ============================================
# DOCUMENT EVENTS
# ============================================

doc_events = {
    # OPD Token Events
    "OPD Token": {
        "after_insert": "hospital_saas.events.opd.after_token_insert",
        "on_update": "hospital_saas.events.opd.on_token_update",
    },
    # IPD Admission Events
    "IPD Admission": {
        "after_insert": "hospital_saas.events.ipd.after_admission",
        "on_update": "hospital_saas.events.ipd.on_admission_update",
    },
    # Patient Events
    "Patient": {
        "after_insert": "hospital_saas.events.patient.after_insert",
    },
    # Appointment Events
    "Patient Appointment": {
        "on_submit": "hospital_saas.events.appointment.on_submit",
        "on_cancel": "hospital_saas.events.appointment.on_cancel",
    },
    # Lab Test Events
    "Lab Test": {
        "on_submit": "hospital_saas.events.lab.on_submit",
    },
    # Invoice Events (Billing)
    "Sales Invoice": {
        "on_submit": "hospital_saas.events.billing.on_invoice_submit",
    },
    # Radiology Events
    "Radiology Order": {
        "on_submit": "hospital_saas.events.radiology.on_order_submit",
        "on_cancel": "hospital_saas.events.radiology.on_order_cancel",
        "on_update": "hospital_saas.events.radiology.on_order_update",
    },
    "Radiology Result": {
        "on_submit": "hospital_saas.events.radiology.on_result_submit",
        "on_cancel": "hospital_saas.events.radiology.on_result_cancel",
    }
}

# ============================================
# SCHEDULED TASKS
# ============================================

scheduler_events = {
    "daily": [
        "hospital_saas.tasks.daily.reset_daily_tokens",
        "hospital_saas.tasks.daily.send_appointment_reminders",
        "hospital_saas.tasks.daily.run_daily_tasks",
    ],
    "hourly": [
        "hospital_saas.tasks.hourly.check_pending_payments",
        "hospital_saas.tasks.hourly.run_hourly_tasks",
    ],
    "weekly": [
        "hospital_saas.tasks.weekly.run_weekly_tasks",
    ],
    "cron": {
        # Send appointment reminders at 8 AM
        "0 8 * * *": [
            "hospital_saas.tasks.daily.send_appointment_reminders"
        ]
    }
}

# ============================================
# PERMISSION QUERY (Multi-tenant isolation)
# ============================================

permission_query_conditions = {
    "Patient": "hospital_saas.permissions.patient_query",
    "Patient Appointment": "hospital_saas.permissions.appointment_query",
    "OPD Token": "hospital_saas.permissions.hospital_query",
    "IPD Admission": "hospital_saas.permissions.hospital_query",
    "Lab Test": "hospital_saas.permissions.hospital_query",
    "Sales Invoice": "hospital_saas.permissions.hospital_query",
    "Healthcare Practitioner": "hospital_saas.permissions.hospital_query",
    "Radiology Order": "hospital_saas.permissions.hospital_query",
    "Radiology Result": "hospital_saas.permissions.hospital_query",
}

# ============================================
# FIXTURES
# ============================================

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
            "Hospital Radiology Technician",
            "Hospital Radiologist",
            "Hospital Accountant",
            "Tenant Admin",
        ]]]
    },
    {
        "dt": "Custom Field",
        "filters": [["module", "=", "Hospital SAAS"]]
    }
]

# ============================================
# BOOT SESSION INFO
# ============================================

boot_session = "hospital_saas.boot.get_boot_info"

# ============================================
# MULTI-TENANT SETTINGS
# ============================================

tenant_field = "hospital"

# ============================================
# MODULE CONFIGURATION
# ============================================

# Default Module Order (Hospital SAAS first)
default_module_order = [
    "Hospital SAAS",
    "Healthcare",
    "Accounts",
    "Stock",
]

# Modules to Hide from Non-Admin Users
modules_to_hide = [
    "Manufacturing",
    "Quality",
    "Projects",
    "CRM",
    "Buying",
    "Selling",
    "Assets",
    "HR",
    "Payroll",
    "Support",
    "Website",
    "E Commerce",
]

# ============================================
# STANDARD PORTAL MENU
# ============================================

standard_portal_menu_items = [
    {"title": "My Appointments", "route": "/appointments", "reference_doctype": "Patient Appointment"},
    {"title": "My Records", "route": "/patient-records", "reference_doctype": "Patient"},
    {"title": "Lab Reports", "route": "/lab-reports", "reference_doctype": "Lab Test"},
    {"title": "Radiology Reports", "route": "/radiology-reports", "reference_doctype": "Radiology Result"},
]

# ============================================
# TOP NAVBAR ITEMS
# ============================================

navbar_settings = {
    "links": [
        {
            "item_label": "Radiology",
            "item_type": "DocType",
            "link_to": "Radiology Order",
            "is_enabled": 1,
            "parent_label": ""
        },
        {
            "item_label": "Radiology Queue",
            "item_type": "Route",
            "link_to": "/radiology-queue",
            "is_enabled": 1,
            "parent_label": "Radiology"
        },
        {
            "item_label": "Orders",
            "item_type": "DocType",
            "link_to": "Radiology Order",
            "is_enabled": 1,
            "parent_label": "Radiology"
        },
        {
            "item_label": "Results",
            "item_type": "DocType",
            "link_to": "Radiology Result",
            "is_enabled": 1,
            "parent_label": "Radiology"
        },
        {
            "item_label": "Exam Types",
            "item_type": "DocType",
            "link_to": "Radiology Examination Type",
            "is_enabled": 1,
            "parent_label": "Radiology"
        },
        {
            "item_label": "Reports",
            "item_type": "Report",
            "link_to": "Radiology Orders Report",
            "is_enabled": 1,
            "parent_label": "Radiology"
        }
    ]
}

# ============================================
# WORKSPACE ICONS
# ============================================

workspace_icons = {
    "Hospital SAAS": "hospital"
}

# ============================================
# JINJA METHODS (for templates)
# ============================================

jinja = {
    "methods": [
        "hospital_saas.utils.jinja_methods.get_hospital_name",
        "hospital_saas.utils.jinja_methods.get_queue_count",
    ]
}

# ============================================
# OVERRIDE WHITELISTED METHODS
# ============================================

# override_whitelisted_methods = {
#     "frappe.desk.doctype.event.event.get_events": "hospital_saas.event.get_events"
# }

# ============================================
# OVERRIDE DOCTYPE CLASS
# ============================================

# override_doctype_class = {
#     "Patient": "hospital_saas.overrides.patient.CustomPatient"
# }

# ============================================
# WEBSITE GENERATORS
# ============================================

# website_generators = ["Patient Portal"]

# ============================================
# EMAIL/SMS INTEGRATION READY
# ============================================

# Has Email Templates
has_email_templates = True

# ============================================
# SETUP WIZARD
# ============================================

# setup_wizard_requires = "assets/hospital_saas/js/setup_wizard.js"
