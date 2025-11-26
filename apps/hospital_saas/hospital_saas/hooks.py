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
# app_include_css = "/assets/hospital_saas/css/hospital_saas.css"
# app_include_js = "/assets/hospital_saas/js/hospital_saas.js"

# Include JS/CSS in web pages
# web_include_css = "/assets/hospital_saas/css/hospital_saas.css"
# web_include_js = "/assets/hospital_saas/js/hospital_saas.js"

# Include JS in page
# page_js = {"page" : "public/js/file.js"}

# Include JS in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Home Pages
# ----------

# Application home page (will override Website Settings)
# home_page = "login"

# Website user home page (by Role)
# role_home_page = {
#     "Role": "home_page"
# }

# Generators
# ----------

# Automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Jinja
# ----------

# Add methods and filters to jinja environment
# jinja = {
#     "methods": "hospital_saas.utils.jinja_methods",
#     "filters": "hospital_saas.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "hospital_saas.install.before_install"
# after_install = "hospital_saas.install.after_install"
after_install = "hospital_saas.setup.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "hospital_saas.uninstall.before_uninstall"
# after_uninstall = "hospital_saas.uninstall.after_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "hospital_saas.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
#     "Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
#     "Event": "frappe.desk.doctype.event.event.has_permission",
# }

# DocType Class
# ---------------
# Override standard doctype classes

# override_doctype_class = {
#     "ToDo": "custom_app.overrides.CustomToDo"
# }

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
#     "*": {
#         "on_update": "method",
#         "on_cancel": "method",
#         "on_trash": "method"
#     }
# }

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
    ]
}

# Testing
# -------

# before_tests = "hospital_saas.install.before_tests"

# Overriding Methods
# ------------------------------

# override_whitelisted_methods = {
#     "frappe.desk.doctype.event.event.get_events": "hospital_saas.event.get_events"
# }

# Override doctype fixtures
# -------------------------

# fixtures = []

# User Data Protection
# --------------------

# user_data_fields = [
#     {
#         "doctype": "{doctype_1}",
#         "filter_by": "{filter_by}",
#         "redact_fields": ["{field_1}", "{field_2}"],
#         "partial": 1,
#     },
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
#     "hospital_saas.auth.validate"
# ]

# Multi-Tenant Settings
# ---------------------

# Configure tenant isolation
tenant_field = "hospital"

# Boot Session Info
# -----------------

boot_session = "hospital_saas.boot.get_boot_info"

# Website Route Rules
# -------------------

website_route_rules = [
    {"from_route": "/hospital/<path:app_path>", "to_route": "hospital"},
]
