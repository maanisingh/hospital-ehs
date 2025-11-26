// Copyright (c) 2024, Hospital SAAS and contributors
// For license information, please see license.txt

frappe.query_reports["Radiology Orders Report"] = {
    "filters": [
        {
            "fieldname": "from_date",
            "label": __("From Date"),
            "fieldtype": "Date",
            "default": frappe.datetime.add_months(frappe.datetime.get_today(), -1),
            "reqd": 1
        },
        {
            "fieldname": "to_date",
            "label": __("To Date"),
            "fieldtype": "Date",
            "default": frappe.datetime.get_today(),
            "reqd": 1
        },
        {
            "fieldname": "modality",
            "label": __("Modality"),
            "fieldtype": "Select",
            "options": "\nX-Ray\nCT Scan\nMRI\nUltrasound\nMammography\nFluoroscopy\nNuclear Medicine\nPET Scan\nDEXA Scan\nAngiography"
        },
        {
            "fieldname": "status",
            "label": __("Status"),
            "fieldtype": "Select",
            "options": "\nOrdered\nScheduled\nIn Progress\nCompleted\nCancelled"
        },
        {
            "fieldname": "priority",
            "label": __("Priority"),
            "fieldtype": "Select",
            "options": "\nRoutine\nUrgent\nSTAT"
        },
        {
            "fieldname": "examination_type",
            "label": __("Examination Type"),
            "fieldtype": "Link",
            "options": "Radiology Examination Type"
        },
        {
            "fieldname": "practitioner",
            "label": __("Ordering Doctor"),
            "fieldtype": "Link",
            "options": "Healthcare Practitioner"
        }
    ],

    "formatter": function(value, row, column, data, default_formatter) {
        value = default_formatter(value, row, column, data);

        if (column.fieldname == "priority") {
            if (data.priority == "STAT") {
                value = `<span class="badge" style="background-color: #ef4444; color: white;">${value}</span>`;
            } else if (data.priority == "Urgent") {
                value = `<span class="badge" style="background-color: #f97316; color: white;">${value}</span>`;
            } else {
                value = `<span class="badge" style="background-color: #3b82f6; color: white;">${value}</span>`;
            }
        }

        if (column.fieldname == "status") {
            let color = "#64748b";
            if (data.status == "Completed") color = "#22c55e";
            else if (data.status == "In Progress") color = "#eab308";
            else if (data.status == "Scheduled") color = "#a855f7";
            else if (data.status == "Ordered") color = "#3b82f6";
            else if (data.status == "Cancelled") color = "#ef4444";

            value = `<span class="badge" style="background-color: ${color}; color: white;">${value}</span>`;
        }

        if (column.fieldname == "turnaround_hours" && data.turnaround_hours) {
            let color = "#22c55e"; // Green for good TAT
            if (data.turnaround_hours > 24) color = "#ef4444"; // Red for > 24 hours
            else if (data.turnaround_hours > 12) color = "#f97316"; // Orange for > 12 hours
            else if (data.turnaround_hours > 6) color = "#eab308"; // Yellow for > 6 hours

            value = `<span style="color: ${color}; font-weight: bold;">${value}</span>`;
        }

        return value;
    }
};
