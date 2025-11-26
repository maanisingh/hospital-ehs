/**
 * Hospital SAAS JavaScript
 * 
 * Client-side functionality for Hospital Management System
 */

// Namespace for Hospital SAAS
frappe.provide("hospital_saas");

/**
 * Initialize Hospital SAAS module
 */
hospital_saas.init = function() {
    // Add hospital-specific styling class to body
    $('body').addClass('hospital-saas-app');
    
    // Initialize quick stats on dashboard
    if (frappe.boot.hospital_saas) {
        hospital_saas.setup_dashboard_stats();
    }
    
    // Setup shortcuts
    hospital_saas.setup_shortcuts();
    
    console.log("Hospital SAAS initialized");
};

/**
 * Setup dashboard statistics cards
 */
hospital_saas.setup_dashboard_stats = function() {
    // Will be populated when workspace loads
};

/**
 * Setup keyboard shortcuts for common actions
 */
hospital_saas.setup_shortcuts = function() {
    // Alt + P: New Patient
    frappe.ui.keys.add_shortcut({
        shortcut: 'alt+p',
        action: function() {
            frappe.new_doc('Patient');
        },
        description: __('New Patient'),
        page: frappe.get_route()[0]
    });
    
    // Alt + A: New Appointment
    frappe.ui.keys.add_shortcut({
        shortcut: 'alt+a',
        action: function() {
            frappe.new_doc('Patient Appointment');
        },
        description: __('New Appointment'),
        page: frappe.get_route()[0]
    });
    
    // Alt + E: New Encounter
    frappe.ui.keys.add_shortcut({
        shortcut: 'alt+e',
        action: function() {
            frappe.new_doc('Patient Encounter');
        },
        description: __('New Patient Encounter'),
        page: frappe.get_route()[0]
    });
};

/**
 * Quick patient search
 */
hospital_saas.quick_patient_search = function(callback) {
    new frappe.ui.form.MultiSelectDialog({
        doctype: "Patient",
        target: this.cur_frm,
        setters: {
            patient_name: null,
            mobile: null
        },
        get_query: function() {
            return {
                filters: { status: "Active" }
            };
        },
        primary_action_label: __("Select"),
        action: function(selections) {
            if (callback && selections.length > 0) {
                callback(selections[0]);
            }
        }
    });
};

/**
 * Format patient display name
 */
hospital_saas.format_patient_name = function(patient_data) {
    if (!patient_data) return '';
    
    let name = patient_data.patient_name || '';
    if (patient_data.dob) {
        const age = hospital_saas.calculate_age(patient_data.dob);
        name += ` (${age} years)`;
    }
    return name;
};

/**
 * Calculate age from date of birth
 */
hospital_saas.calculate_age = function(dob) {
    if (!dob) return null;
    
    const today = new Date();
    const birthDate = new Date(dob);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    
    return age;
};

/**
 * Show appointment calendar for a practitioner
 */
hospital_saas.show_practitioner_calendar = function(practitioner) {
    frappe.route_options = {
        practitioner: practitioner
    };
    frappe.set_route("calendar", "Patient Appointment");
};

/**
 * Get available appointment slots
 */
hospital_saas.get_available_slots = function(practitioner, date, callback) {
    frappe.call({
        method: "erpnext.healthcare.doctype.patient_appointment.patient_appointment.get_availability_data",
        args: {
            practitioner: practitioner,
            date: date
        },
        callback: function(r) {
            if (r.message && callback) {
                callback(r.message);
            }
        }
    });
};

/**
 * Create quick appointment dialog
 */
hospital_saas.quick_appointment = function(patient) {
    const dialog = new frappe.ui.Dialog({
        title: __('Quick Appointment'),
        fields: [
            {
                fieldname: 'patient',
                fieldtype: 'Link',
                options: 'Patient',
                label: __('Patient'),
                reqd: 1,
                default: patient
            },
            {
                fieldname: 'practitioner',
                fieldtype: 'Link',
                options: 'Healthcare Practitioner',
                label: __('Practitioner'),
                reqd: 1
            },
            {
                fieldname: 'appointment_date',
                fieldtype: 'Date',
                label: __('Date'),
                reqd: 1,
                default: frappe.datetime.get_today()
            },
            {
                fieldname: 'appointment_time',
                fieldtype: 'Time',
                label: __('Time'),
                reqd: 1
            },
            {
                fieldname: 'notes',
                fieldtype: 'Small Text',
                label: __('Notes')
            }
        ],
        primary_action_label: __('Book Appointment'),
        primary_action: function(values) {
            frappe.call({
                method: "frappe.client.insert",
                args: {
                    doc: {
                        doctype: "Patient Appointment",
                        patient: values.patient,
                        practitioner: values.practitioner,
                        appointment_date: values.appointment_date,
                        appointment_time: values.appointment_time,
                        notes: values.notes,
                        status: "Scheduled"
                    }
                },
                callback: function(r) {
                    if (r.message) {
                        dialog.hide();
                        frappe.show_alert({
                            message: __('Appointment booked: {0}', [r.message.name]),
                            indicator: 'green'
                        });
                        frappe.set_route('Form', 'Patient Appointment', r.message.name);
                    }
                }
            });
        }
    });
    
    dialog.show();
};

/**
 * Display vital signs in a formatted way
 */
hospital_saas.format_vitals = function(vitals) {
    if (!vitals) return '';
    
    let html = '<div class="vital-signs-display">';
    
    if (vitals.temperature) {
        const tempClass = vitals.temperature > 38 ? 'vital-warning' : 'vital-normal';
        html += `<span class="${tempClass}">Temp: ${vitals.temperature}°C</span> | `;
    }
    
    if (vitals.pulse) {
        const pulseClass = (vitals.pulse < 60 || vitals.pulse > 100) ? 'vital-warning' : 'vital-normal';
        html += `<span class="${pulseClass}">Pulse: ${vitals.pulse} bpm</span> | `;
    }
    
    if (vitals.bp_systolic && vitals.bp_diastolic) {
        const bpClass = (vitals.bp_systolic > 140 || vitals.bp_diastolic > 90) ? 'vital-warning' : 'vital-normal';
        html += `<span class="${bpClass}">BP: ${vitals.bp_systolic}/${vitals.bp_diastolic} mmHg</span>`;
    }
    
    html += '</div>';
    return html;
};

/**
 * Handle tenant context (for multi-tenant mode)
 */
hospital_saas.get_current_hospital = function() {
    if (frappe.boot.hospital_saas && frappe.boot.hospital_saas.tenant) {
        return frappe.boot.hospital_saas.tenant;
    }
    return null;
};

/**
 * Initialize on document ready
 */
$(document).ready(function() {
    // Initialize after a small delay to ensure Frappe is ready
    setTimeout(function() {
        hospital_saas.init();
    }, 500);
});

// Extend frappe namespace with hospital utilities
frappe.hospital_saas = hospital_saas;
