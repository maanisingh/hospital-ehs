"""
Hospital DocType

This DocType represents a Hospital or Clinic entity in the multi-tenant
Hospital SAAS system. Each hospital is a separate tenant with its own
data isolation.

Fields Added in Phase 7:
- Owner Information (owner_name, owner_email, owner_mobile)
- Social Media URLs (facebook, instagram, youtube, twitter, linkedin)
- Branding (dashboard_footer_text, primary_color, secondary_color)
- Helpline Number
- Subscription Status
"""

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate, nowdate, add_days


class Hospital(Document):
    def validate(self):
        """Validate hospital data before saving"""
        self.validate_license_expiry()
        self.validate_subscription()
        self.validate_social_urls()

    def before_insert(self):
        """Set organisation_code before first save"""
        # The name is auto-generated as H00001, H00002, etc.
        # Copy name to organisation_code for display purposes
        pass

    def after_insert(self):
        """After insert, set the organisation_code from name"""
        if not self.organisation_code:
            self.db_set('organisation_code', self.name)

    def validate_license_expiry(self):
        """Check if license is expiring soon"""
        if self.license_expiry_date:
            expiry_date = getdate(self.license_expiry_date)
            today = getdate(nowdate())
            days_until_expiry = (expiry_date - today).days

            if days_until_expiry < 0:
                frappe.msgprint(
                    _("Hospital license has expired!"),
                    indicator="red",
                    alert=True
                )
            elif days_until_expiry < 30:
                frappe.msgprint(
                    _("Hospital license will expire in {0} days").format(days_until_expiry),
                    indicator="orange",
                    alert=True
                )

    def validate_subscription(self):
        """Check and update subscription status"""
        if self.subscription_end:
            end_date = getdate(self.subscription_end)
            today = getdate(nowdate())

            if end_date < today:
                self.subscription_status = "Expired"
            elif self.subscription_start:
                start_date = getdate(self.subscription_start)
                # Check if within first 14 days (trial)
                trial_end = add_days(start_date, 14)
                if today <= trial_end and self.subscription_status == "Trial":
                    pass  # Keep as Trial
                elif end_date >= today:
                    self.subscription_status = "Active"
        elif not self.subscription_start:
            self.subscription_status = "Trial"

    def validate_social_urls(self):
        """Validate social media URLs format"""
        url_fields = ['facebook_url', 'instagram_url', 'youtube_url', 'twitter_url', 'linkedin_url']

        for field in url_fields:
            url = getattr(self, field, None)
            if url and not url.startswith(('http://', 'https://')):
                setattr(self, field, 'https://' + url)

    def on_update(self):
        """Actions after hospital is updated"""
        self.update_related_records()
        self.check_subscription_expiry_alert()

    def update_related_records(self):
        """Update any records that reference this hospital"""
        # Update cache for this hospital
        frappe.cache().delete_value(f"hospital_{self.name}")

    def check_subscription_expiry_alert(self):
        """Alert if subscription is expiring soon"""
        if self.subscription_end:
            end_date = getdate(self.subscription_end)
            today = getdate(nowdate())
            days_until_expiry = (end_date - today).days

            if 0 < days_until_expiry <= 7:
                frappe.msgprint(
                    _("Subscription will expire in {0} days. Please renew.").format(days_until_expiry),
                    indicator="orange",
                    alert=True
                )

    def before_save(self):
        """Actions before saving"""
        if self.status == "Active" and not self.admin_user:
            frappe.msgprint(
                _("Consider assigning an Admin User for this hospital"),
                indicator="yellow"
            )

    @frappe.whitelist()
    def get_department_count(self):
        """Get count of departments in this hospital"""
        return frappe.db.count("Department", {"hospital": self.name})

    @frappe.whitelist()
    def get_staff_count(self):
        """Get count of healthcare practitioners in this hospital"""
        return frappe.db.count("Healthcare Practitioner", {"custom_hospital": self.name})

    @frappe.whitelist()
    def get_patient_count(self):
        """Get count of patients registered in this hospital"""
        return frappe.db.count("Patient", {"custom_hospital": self.name})

    @frappe.whitelist()
    def get_today_appointments(self):
        """Get count of today's appointments"""
        return frappe.db.count("Patient Appointment", {
            "custom_hospital": self.name,
            "appointment_date": nowdate()
        })

    @frappe.whitelist()
    def get_active_opd_tokens(self):
        """Get count of active OPD tokens today"""
        return frappe.db.count("OPD Token", {
            "hospital": self.name,
            "token_date": nowdate(),
            "status": ["in", ["Waiting", "Called", "In Progress"]]
        })


def get_active_hospitals():
    """Get list of all active hospitals"""
    return frappe.get_all(
        "Hospital",
        filters={"status": "Active"},
        fields=["name", "business_name", "organisation_code", "city", "hospital_type"]
    )


@frappe.whitelist()
def get_hospital_stats(hospital_name):
    """Get statistics for a specific hospital"""
    hospital = frappe.get_doc("Hospital", hospital_name)

    return {
        "name": hospital.name,
        "organisation_code": hospital.organisation_code,
        "business_name": hospital.business_name,
        "total_beds": hospital.total_beds,
        "icu_beds": hospital.icu_beds,
        "emergency_beds": hospital.emergency_beds,
        "operation_theaters": hospital.operation_theaters,
        "departments": hospital.get_department_count(),
        "staff": hospital.get_staff_count(),
        "patients": hospital.get_patient_count(),
        "today_appointments": hospital.get_today_appointments(),
        "active_tokens": hospital.get_active_opd_tokens(),
        "subscription_status": hospital.subscription_status,
        "subscription_end": hospital.subscription_end
    }


@frappe.whitelist()
def get_all_hospitals_summary():
    """Get summary of all hospitals for Super Admin dashboard"""
    hospitals = frappe.get_all(
        "Hospital",
        fields=[
            "name", "organisation_code", "business_name", "city", "state",
            "hospital_type", "status", "subscription_status", "subscription_end",
            "owner_name", "owner_email", "owner_mobile"
        ],
        order_by="creation desc"
    )

    for hospital in hospitals:
        hospital['patient_count'] = frappe.db.count("Patient", {"custom_hospital": hospital.name})
        hospital['staff_count'] = frappe.db.count("Healthcare Practitioner", {"custom_hospital": hospital.name})

    return hospitals


@frappe.whitelist()
def create_hospital_with_admin(hospital_data, admin_data):
    """
    Create a new hospital along with its admin user

    Args:
        hospital_data: dict with hospital fields
        admin_data: dict with admin user fields (email, first_name, last_name)
    """
    # Create the admin user first
    if admin_data and admin_data.get('email'):
        user = frappe.get_doc({
            "doctype": "User",
            "email": admin_data.get('email'),
            "first_name": admin_data.get('first_name', 'Admin'),
            "last_name": admin_data.get('last_name', ''),
            "send_welcome_email": 1,
            "roles": [
                {"role": "Healthcare Administrator"}
            ]
        })
        user.insert(ignore_permissions=True)
        hospital_data['admin_user'] = user.name

    # Create the hospital
    hospital = frappe.get_doc({
        "doctype": "Hospital",
        **hospital_data
    })
    hospital.insert(ignore_permissions=True)

    return {
        "hospital": hospital.name,
        "organisation_code": hospital.organisation_code,
        "admin_user": hospital_data.get('admin_user')
    }
