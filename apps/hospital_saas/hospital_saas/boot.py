"""
Boot Session Configuration for Hospital SAAS

This module provides additional session information
that is loaded when a user logs in.
"""

import frappe
from frappe import _


def get_boot_info(bootinfo):
    """
    Add Hospital SAAS specific information to boot info.
    This is called when a user logs in and the desk is loaded.
    """
    try:
        # Add Hospital SAAS version info
        bootinfo.hospital_saas = {
            "version": "1.0.0",
            "app_name": "Hospital SAAS",
            "modules": get_available_modules()
        }

        # Add tenant information if multi-tenant
        if is_multi_tenant():
            bootinfo.hospital_saas["tenant"] = get_current_tenant()

        # Add user permissions summary
        bootinfo.hospital_saas["permissions"] = get_user_hospital_permissions()

    except Exception as e:
        frappe.log_error(f"Boot Info Error: {str(e)}")


def get_available_modules():
    """Get list of available Hospital SAAS modules for the user"""
    modules = []

    # Check which modules the user has access to
    if frappe.has_permission("Patient", "read"):
        modules.append("patient_management")

    if frappe.has_permission("Patient Appointment", "read"):
        modules.append("appointment_system")

    if frappe.has_permission("Sales Invoice", "read"):
        modules.append("billing_system")

    if frappe.has_permission("Item", "read"):
        modules.append("inventory_management")

    return modules


def is_multi_tenant():
    """Check if multi-tenant mode is enabled"""
    try:
        if frappe.db.exists("DocType", "Hospital SAAS Settings"):
            settings = frappe.get_single("Hospital SAAS Settings")
            return getattr(settings, "enable_multi_tenant", False)
    except Exception:
        pass
    return False


def get_current_tenant():
    """Get current tenant information"""
    # This will be implemented in Phase 2
    return {
        "id": None,
        "name": "Default Hospital",
        "is_main": True
    }


def get_user_hospital_permissions():
    """Get summary of user's hospital-specific permissions"""
    permissions = {
        "can_manage_patients": frappe.has_permission("Patient", "write"),
        "can_manage_appointments": frappe.has_permission("Patient Appointment", "write"),
        "can_manage_billing": frappe.has_permission("Sales Invoice", "write"),
        "can_view_reports": frappe.has_permission("Report", "read"),
        "is_admin": "Hospital Administrator" in frappe.get_roles()
    }

    return permissions
