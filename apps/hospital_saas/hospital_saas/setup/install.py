"""
Hospital SAAS Installation Script

This module handles the initial setup and configuration
when the Hospital SAAS app is installed.
"""

import frappe
from frappe import _


def after_install():
    """
    Called after the app is installed.
    Sets up default configurations and data.
    """
    print("Setting up Hospital SAAS...")

    try:
        # Create default roles
        create_default_roles()

        # Create default settings
        create_default_settings()

        # Setup workspace
        setup_workspace()

        frappe.db.commit()
        print("Hospital SAAS setup completed successfully!")

    except Exception as e:
        frappe.log_error(f"Hospital SAAS Installation Error: {str(e)}")
        print(f"Warning: Some setup steps may have failed: {str(e)}")


def create_default_roles():
    """Create default roles for Hospital SAAS"""
    roles = [
        {
            "role_name": "Hospital Administrator",
            "desk_access": 1,
            "is_custom": 1
        },
        {
            "role_name": "Hospital Doctor",
            "desk_access": 1,
            "is_custom": 1
        },
        {
            "role_name": "Hospital Nurse",
            "desk_access": 1,
            "is_custom": 1
        },
        {
            "role_name": "Hospital Receptionist",
            "desk_access": 1,
            "is_custom": 1
        },
        {
            "role_name": "Hospital Pharmacist",
            "desk_access": 1,
            "is_custom": 1
        },
        {
            "role_name": "Hospital Lab Technician",
            "desk_access": 1,
            "is_custom": 1
        },
        {
            "role_name": "Hospital Accountant",
            "desk_access": 1,
            "is_custom": 1
        },
        {
            "role_name": "Tenant Admin",
            "desk_access": 1,
            "is_custom": 1
        }
    ]

    for role_data in roles:
        if not frappe.db.exists("Role", role_data["role_name"]):
            role = frappe.new_doc("Role")
            role.role_name = role_data["role_name"]
            role.desk_access = role_data["desk_access"]
            role.is_custom = role_data["is_custom"]
            role.insert(ignore_permissions=True)
            print(f"Created role: {role_data['role_name']}")


def create_default_settings():
    """Create default Hospital SAAS Settings"""
    # Check if settings doctype exists before creating
    try:
        if frappe.db.exists("DocType", "Hospital SAAS Settings"):
            if not frappe.db.exists("Hospital SAAS Settings", "Hospital SAAS Settings"):
                settings = frappe.new_doc("Hospital SAAS Settings")
                settings.enable_multi_tenant = 1
                settings.default_currency = "USD"
                settings.insert(ignore_permissions=True)
                print("Created default Hospital SAAS Settings")
    except Exception as e:
        print(f"Settings setup skipped: {str(e)}")


def setup_workspace():
    """Setup the Hospital SAAS workspace"""
    try:
        workspace_name = "Hospital SAAS"

        if not frappe.db.exists("Workspace", workspace_name):
            workspace = frappe.new_doc("Workspace")
            workspace.name = workspace_name
            workspace.label = "Hospital SAAS"
            workspace.module = "Hospital SAAS"
            workspace.icon = "hospital"
            workspace.category = "Modules"
            workspace.is_standard = 0
            workspace.public = 1

            # Add shortcuts
            workspace.append("shortcuts", {
                "label": "Patients",
                "link_type": "DocType",
                "link_to": "Patient",
                "type": "Link"
            })

            workspace.append("shortcuts", {
                "label": "Appointments",
                "link_type": "DocType",
                "link_to": "Patient Appointment",
                "type": "Link"
            })

            workspace.append("shortcuts", {
                "label": "Healthcare Practitioners",
                "link_type": "DocType",
                "link_to": "Healthcare Practitioner",
                "type": "Link"
            })

            workspace.insert(ignore_permissions=True)
            print(f"Created workspace: {workspace_name}")

    except Exception as e:
        print(f"Workspace setup skipped: {str(e)}")
