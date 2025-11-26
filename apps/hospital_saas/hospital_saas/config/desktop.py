"""
Desktop Module Configuration for Hospital SAAS
"""

from frappe import _


def get_data():
    return [
        {
            "module_name": "Hospital SAAS",
            "category": "Modules",
            "label": _("Hospital SAAS"),
            "color": "#1abc9c",
            "icon": "octicon octicon-heart-fill",
            "type": "module",
            "description": "Multi-Tenant Hospital Management Platform"
        }
    ]
