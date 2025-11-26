# Copyright (c) 2024, Hospital SAAS and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class RadiologyExaminationType(Document):
    def before_save(self):
        if not self.examination_code:
            # Auto-generate code from modality and name
            modality_prefix = {
                "X-Ray": "XR",
                "CT Scan": "CT",
                "MRI": "MR",
                "Ultrasound": "US",
                "Mammography": "MG",
                "Fluoroscopy": "FL",
                "Nuclear Medicine": "NM",
                "PET Scan": "PT",
                "DEXA Scan": "DX",
                "Angiography": "AG"
            }
            prefix = modality_prefix.get(self.modality, "RD")
            # Create code from first letters of name
            name_parts = self.examination_name.upper().split()
            name_code = "".join([p[0] for p in name_parts[:3]])
            self.examination_code = f"{prefix}-{name_code}"

    def validate(self):
        if self.rate and self.rate < 0:
            frappe.throw("Rate cannot be negative")

        if self.duration_minutes and self.duration_minutes < 0:
            frappe.throw("Duration cannot be negative")
