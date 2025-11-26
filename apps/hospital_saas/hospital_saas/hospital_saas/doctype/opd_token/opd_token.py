"""
OPD Token DocType
Daily token system for outpatient department
"""

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import today, now_datetime, get_datetime


class OPDToken(Document):
    def before_insert(self):
        self.generate_token_number()
        self.set_queue_position()
        self.calculate_age()

    def generate_token_number(self):
        """Generate daily token number like OPD001, OPD002"""
        if not self.token_number:
            # Get today's token count for this hospital
            count = frappe.db.count(
                "OPD Token",
                filters={
                    "hospital": self.hospital,
                    "token_date": self.token_date or today()
                }
            )
            self.token_number = f"OPD{str(count + 1).zfill(3)}"

    def set_queue_position(self):
        """Set queue position based on department/doctor"""
        filters = {
            "hospital": self.hospital,
            "token_date": self.token_date or today(),
            "status": ["in", ["Waiting", "In Queue"]]
        }
        if self.practitioner:
            filters["practitioner"] = self.practitioner

        position = frappe.db.count("OPD Token", filters)
        self.queue_position = position + 1

    def calculate_age(self):
        """Calculate patient age"""
        if self.patient and not self.age:
            dob = frappe.db.get_value("Patient", self.patient, "dob")
            if dob:
                from frappe.utils import date_diff
                age_days = date_diff(today(), dob)
                years = age_days // 365
                self.age = f"{years} years"

    def after_insert(self):
        """After token created - send notification, update queue"""
        self.send_token_sms()
        self.broadcast_queue_update()

    def send_token_sms(self):
        """Send SMS to patient with token number"""
        if not self.mobile:
            return

        try:
            settings = frappe.get_single("Hospital SAAS Settings")
            if not settings.enable_sms_notifications:
                return
        except Exception:
            return

        hospital_name = frappe.db.get_value("Hospital", self.hospital, "hospital_name") or "Hospital"
        message = f"""
{hospital_name}
Token: {self.token_number}
Date: {self.token_date}
Doctor: {self.practitioner or "General OPD"}

Please arrive 15 mins before your turn.
        """

        try:
            from frappe.core.doctype.sms_settings.sms_settings import send_sms
            send_sms([self.mobile], message)
        except Exception as e:
            frappe.log_error(f"SMS failed: {e}")

    def broadcast_queue_update(self):
        """Send realtime update for queue display"""
        frappe.publish_realtime(
            event="queue_update",
            message={
                "hospital": self.hospital,
                "current_token": self.token_number,
                "current_patient": self.patient_name,
                "queue_position": self.queue_position
            },
            room=f"hospital_{self.hospital}"
        )

    @frappe.whitelist()
    def call_patient(self):
        """Mark patient as called"""
        self.status = "In Queue"
        self.called_at = now_datetime()
        self.save()
        self.broadcast_queue_update()
        return {"message": f"Calling {self.patient_name} - Token {self.token_number}"}

    @frappe.whitelist()
    def start_consultation(self):
        """Start consultation"""
        self.status = "With Doctor"
        self.consultation_started = now_datetime()
        self.save()
        self.broadcast_queue_update()
        return {"message": "Consultation started"}

    @frappe.whitelist()
    def end_consultation(self):
        """End consultation"""
        self.consultation_ended = now_datetime()
        self.status = "Completed"
        self.save()
        self.broadcast_queue_update()
        return {"message": "Consultation completed"}


def get_todays_queue(hospital, practitioner=None):
    """Get today's OPD queue"""
    filters = {
        "hospital": hospital,
        "token_date": today(),
        "status": ["in", ["Waiting", "In Queue", "With Doctor"]]
    }
    if practitioner:
        filters["practitioner"] = practitioner

    return frappe.get_all(
        "OPD Token",
        filters=filters,
        fields=["name", "token_number", "patient_name", "status", "queue_position"],
        order_by="queue_position asc"
    )
