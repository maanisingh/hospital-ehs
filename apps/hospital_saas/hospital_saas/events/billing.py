"""
Billing Event Handlers
"""

import frappe


def on_invoice_submit(doc, method):
    """When Sales Invoice is submitted"""
    # Send payment receipt SMS/WhatsApp
    pass  # Hook for future implementation
