"""
Hospital SAAS Installation Script

This module handles the initial setup and configuration
when the Hospital SAAS app is installed.

Integrates with ERPNext Healthcare, Accounts, and Stock modules.
"""

import frappe
from frappe import _
import json
import os


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

        # Install custom fields for ERPNext integration
        install_custom_fields()

        # Setup default item groups for hospital
        setup_item_groups()

        # Setup default warehouses
        setup_warehouses()

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


def install_custom_fields():
    """
    Install custom fields to integrate ERPNext Healthcare, Accounts, Stock
    with Hospital SAAS multi-tenant architecture.
    """
    print("Installing custom fields for ERPNext integration...")

    custom_fields_file = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        "hospital_saas", "custom_fields", "healthcare_custom_fields.json"
    )

    if not os.path.exists(custom_fields_file):
        print(f"Custom fields file not found: {custom_fields_file}")
        return

    with open(custom_fields_file, "r") as f:
        data = json.load(f)

    custom_fields = data.get("custom_fields", [])
    created_count = 0

    for cf in custom_fields:
        try:
            # Check if field already exists
            existing = frappe.db.exists("Custom Field", {
                "dt": cf["dt"],
                "fieldname": cf["fieldname"]
            })

            if not existing:
                custom_field = frappe.new_doc("Custom Field")
                custom_field.dt = cf["dt"]
                custom_field.fieldname = cf["fieldname"]
                custom_field.fieldtype = cf["fieldtype"]
                custom_field.label = cf["label"]
                custom_field.insert_after = cf.get("insert_after")
                custom_field.options = cf.get("options")
                custom_field.reqd = cf.get("reqd", 0)
                custom_field.in_list_view = cf.get("in_list_view", 0)
                custom_field.in_standard_filter = cf.get("in_standard_filter", 0)
                custom_field.read_only = cf.get("read_only", 0)
                custom_field.default = cf.get("default")
                custom_field.description = cf.get("description")
                custom_field.depends_on = cf.get("depends_on")
                custom_field.module = "Hospital SAAS"

                custom_field.insert(ignore_permissions=True)
                created_count += 1
                print(f"  Created: {cf['dt']}.{cf['fieldname']}")

        except Exception as e:
            print(f"  Skipped {cf['dt']}.{cf['fieldname']}: {str(e)}")

    print(f"Custom fields installation complete. Created {created_count} fields.")


def setup_item_groups():
    """Setup default item groups for hospital inventory"""
    print("Setting up item groups...")

    item_groups = [
        {"name": "Hospital Items", "parent": "All Item Groups", "is_group": 1},
        {"name": "Medicines", "parent": "Hospital Items", "is_group": 0},
        {"name": "Surgical Items", "parent": "Hospital Items", "is_group": 0},
        {"name": "Lab Consumables", "parent": "Hospital Items", "is_group": 0},
        {"name": "Medical Equipment", "parent": "Hospital Items", "is_group": 0},
        {"name": "Pharmacy Items", "parent": "Hospital Items", "is_group": 0},
        {"name": "Radiology Consumables", "parent": "Hospital Items", "is_group": 0},
    ]

    for ig in item_groups:
        try:
            if not frappe.db.exists("Item Group", ig["name"]):
                doc = frappe.new_doc("Item Group")
                doc.item_group_name = ig["name"]
                doc.parent_item_group = ig["parent"]
                doc.is_group = ig["is_group"]
                doc.insert(ignore_permissions=True)
                print(f"  Created Item Group: {ig['name']}")
        except Exception as e:
            print(f"  Skipped Item Group {ig['name']}: {str(e)}")


def setup_warehouses():
    """Setup default warehouses for hospital stock"""
    print("Setting up warehouses...")

    warehouses = [
        {"name": "Hospital Stores", "parent": "All Warehouses", "is_group": 1},
        {"name": "Pharmacy Store", "parent": "Hospital Stores", "is_group": 0},
        {"name": "Lab Store", "parent": "Hospital Stores", "is_group": 0},
        {"name": "Radiology Store", "parent": "Hospital Stores", "is_group": 0},
        {"name": "OT Store", "parent": "Hospital Stores", "is_group": 0},
        {"name": "Emergency Store", "parent": "Hospital Stores", "is_group": 0},
    ]

    # Get default company
    company = frappe.db.get_single_value("Global Defaults", "default_company")
    if not company:
        company = frappe.db.get_value("Company", {}, "name")

    if not company:
        print("  No company found, skipping warehouse setup")
        return

    for wh in warehouses:
        try:
            full_name = f"{wh['name']} - {frappe.db.get_value('Company', company, 'abbr')}"
            if not frappe.db.exists("Warehouse", full_name):
                doc = frappe.new_doc("Warehouse")
                doc.warehouse_name = wh["name"]
                doc.parent_warehouse = f"{wh['parent']} - {frappe.db.get_value('Company', company, 'abbr')}" if wh["parent"] != "All Warehouses" else None
                doc.is_group = wh["is_group"]
                doc.company = company
                doc.insert(ignore_permissions=True)
                print(f"  Created Warehouse: {wh['name']}")
        except Exception as e:
            print(f"  Skipped Warehouse {wh['name']}: {str(e)}")
