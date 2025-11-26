"""
IPD Admission DocType
In-patient department admission management
"""

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import today, now_datetime, get_first_day, get_last_day


class IPDAdmission(Document):
    def before_insert(self):
        self.generate_admission_id()
        self.calculate_age()

    def generate_admission_id(self):
        """Generate admission ID like IPD001, IPD002"""
        if not self.admission_id:
            count = frappe.db.count(
                "IPD Admission",
                filters={
                    "hospital": self.hospital,
                    "admission_date": [">=", get_first_day(today())],
                }
            )
            self.admission_id = f"IPD{str(count + 1).zfill(3)}"

    def calculate_age(self):
        """Calculate patient age"""
        if self.patient and not self.age:
            dob = frappe.db.get_value("Patient", self.patient, "dob")
            if dob:
                from frappe.utils import date_diff
                age_days = date_diff(today(), dob)
                years = age_days // 365
                self.age = f"{years} years"

    def validate(self):
        self.calculate_balance()

    def calculate_balance(self):
        """Calculate balance due"""
        self.balance_due = (self.total_billed or 0) - (self.advance_paid or 0)

    def after_insert(self):
        """After admission - send notification"""
        self.send_admission_sms()
        self.broadcast_ipd_update()

    def send_admission_sms(self):
        """Send SMS notification"""
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
Patient Admitted
ID: {self.admission_id}
Name: {self.patient_name}
Ward: {self.ward or 'General'}
Room: {self.room or '-'} Bed: {self.bed or '-'}
Doctor: {self.practitioner}
Date: {self.admission_date}
        """

        try:
            from frappe.core.doctype.sms_settings.sms_settings import send_sms
            send_sms([self.mobile], message)
        except Exception as e:
            frappe.log_error(f"SMS failed: {e}")

    def broadcast_ipd_update(self):
        """Send realtime update for IPD dashboard"""
        frappe.publish_realtime(
            event="ipd_update",
            message={
                "hospital": self.hospital,
                "admission_id": self.admission_id,
                "patient_name": self.patient_name,
                "status": self.status,
                "message": f"Patient {self.patient_name} admitted"
            },
            room=f"hospital_{self.hospital}"
        )

    @frappe.whitelist()
    def discharge_patient(self, discharge_type="Normal", summary=""):
        """Discharge the patient"""
        self.status = "Discharged"
        self.actual_discharge = now_datetime()
        self.discharge_type = discharge_type
        self.discharge_summary = summary
        self.save()

        # Send discharge SMS
        self.send_discharge_sms()

        # Broadcast update
        frappe.publish_realtime(
            event="ipd_update",
            message={
                "hospital": self.hospital,
                "admission_id": self.admission_id,
                "patient_name": self.patient_name,
                "status": "Discharged",
                "message": f"Patient {self.patient_name} discharged",
                "indicator": "green"
            },
            room=f"hospital_{self.hospital}"
        )

        return {"message": f"Patient {self.patient_name} discharged successfully"}

    def send_discharge_sms(self):
        """Send discharge notification"""
        if not self.mobile:
            return

        try:
            settings = frappe.get_single("Hospital SAAS Settings")
            if not settings.enable_sms_notifications:
                return
        except Exception:
            return

        message = f"""
Patient Discharged
ID: {self.admission_id}
Name: {self.patient_name}
Date: {frappe.utils.format_datetime(self.actual_discharge)}
Balance: Rs.{self.balance_due}

Thank you for choosing our hospital.
        """

        try:
            from frappe.core.doctype.sms_settings.sms_settings import send_sms
            send_sms([self.mobile], message)
        except Exception as e:
            frappe.log_error(f"SMS failed: {e}")

    @frappe.whitelist()
    def add_advance_payment(self, amount, mode_of_payment="Cash"):
        """Add advance payment"""
        self.advance_paid = (self.advance_paid or 0) + amount
        self.calculate_balance()
        self.save()
        return {
            "message": f"Advance of Rs.{amount} added",
            "total_advance": self.advance_paid,
            "balance_due": self.balance_due
        }

    @frappe.whitelist()
    def update_billing(self, amount):
        """Update total billed amount"""
        self.total_billed = amount
        self.calculate_balance()
        self.save()
        return {
            "total_billed": self.total_billed,
            "balance_due": self.balance_due
        }


def get_active_admissions(hospital):
    """Get all active IPD admissions for a hospital"""
    return frappe.get_all(
        "IPD Admission",
        filters={
            "hospital": hospital,
            "status": ["in", ["Admitted", "Under Treatment"]]
        },
        fields=[
            "name", "admission_id", "patient_name", "ward", "room", "bed",
            "practitioner", "admission_date", "status", "diagnosis"
        ],
        order_by="admission_date desc"
    )
