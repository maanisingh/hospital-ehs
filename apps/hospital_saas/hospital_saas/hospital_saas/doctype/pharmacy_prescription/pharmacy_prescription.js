// Pharmacy Prescription Client Script
frappe.ui.form.on('Pharmacy Prescription', {
    refresh: function(frm) {
        // Show queue status
        if (!frm.is_new()) {
            show_pharmacy_queue_status(frm);
        }

        // Add action buttons based on status
        if (frm.doc.docstatus === 1 && frm.doc.status !== 'Dispensed' && frm.doc.status !== 'Cancelled') {
            frm.add_custom_button(__('Dispense All'), function() {
                frappe.confirm(
                    __('Dispense all items in this prescription?'),
                    function() {
                        frappe.call({
                            method: 'dispense_all',
                            doc: frm.doc,
                            callback: function(r) {
                                if (r.message && r.message.success) {
                                    frm.reload_doc();
                                }
                            }
                        });
                    }
                );
            }, __('Dispensing'));

            frm.add_custom_button(__('Print Prescription'), function() {
                frm.print_doc();
            });
        }

        // Quick add medication
        if (frm.doc.docstatus === 0) {
            frm.add_custom_button(__('Quick Add Medication'), function() {
                quick_add_medication(frm);
            });
        }

        // View related documents
        if (frm.doc.sales_invoice) {
            frm.add_custom_button(__('View Invoice'), function() {
                frappe.set_route('Form', 'Sales Invoice', frm.doc.sales_invoice);
            }, __('View'));
        }

        if (frm.doc.stock_entry) {
            frm.add_custom_button(__('View Stock Entry'), function() {
                frappe.set_route('Form', 'Stock Entry', frm.doc.stock_entry);
            }, __('View'));
        }

        // Auto-set pharmacy
        if (!frm.doc.pharmacy && frm.doc.hospital) {
            frappe.call({
                method: 'frappe.client.get_value',
                args: {
                    doctype: 'Pharmacy',
                    filters: { hospital: frm.doc.hospital, is_default: 1, is_active: 1 },
                    fieldname: 'name'
                },
                callback: function(r) {
                    if (r.message && r.message.name) {
                        frm.set_value('pharmacy', r.message.name);
                    }
                }
            });
        }
    },

    patient: function(frm) {
        if (frm.doc.patient) {
            // Fetch patient age
            frappe.call({
                method: 'frappe.client.get_value',
                args: {
                    doctype: 'Patient',
                    filters: { name: frm.doc.patient },
                    fieldname: ['dob']
                },
                callback: function(r) {
                    if (r.message && r.message.dob) {
                        let dob = frappe.datetime.str_to_obj(r.message.dob);
                        let today = new Date();
                        let age = today.getFullYear() - dob.getFullYear();
                        frm.set_value('patient_age', age + ' Years');
                    }
                }
            });
        }
    }
});

frappe.ui.form.on('Prescription Item', {
    medication: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        if (row.medication) {
            // Fetch item details
            frappe.call({
                method: 'frappe.client.get_value',
                args: {
                    doctype: 'Item',
                    filters: { name: row.medication },
                    fieldname: ['item_name', 'standard_rate', 'stock_uom']
                },
                callback: function(r) {
                    if (r.message) {
                        frappe.model.set_value(cdt, cdn, 'medication_name', r.message.item_name);
                        frappe.model.set_value(cdt, cdn, 'rate', r.message.standard_rate || 0);
                        frappe.model.set_value(cdt, cdn, 'uom', r.message.stock_uom || 'Nos');
                        calculate_item_amount(frm, cdt, cdn);
                    }
                }
            });
        }
    },

    quantity: function(frm, cdt, cdn) {
        calculate_item_amount(frm, cdt, cdn);
    },

    rate: function(frm, cdt, cdn) {
        calculate_item_amount(frm, cdt, cdn);
    }
});

function calculate_item_amount(frm, cdt, cdn) {
    let row = locals[cdt][cdn];
    row.amount = flt(row.quantity) * flt(row.rate);
    refresh_field('amount', cdn, 'items');
    calculate_totals(frm);
}

function calculate_totals(frm) {
    let total_qty = 0;
    let total_amount = 0;

    frm.doc.items.forEach(function(item) {
        total_qty += flt(item.quantity);
        total_amount += flt(item.amount);
    });

    frm.set_value('total_quantity', total_qty);
    frm.set_value('total_amount', total_amount);
    frm.set_value('net_amount', total_amount - flt(frm.doc.discount_amount));
}

function quick_add_medication(frm) {
    let d = new frappe.ui.Dialog({
        title: __('Quick Add Medication'),
        fields: [
            {
                fieldname: 'medication',
                fieldtype: 'Link',
                options: 'Item',
                label: __('Medication'),
                reqd: 1,
                get_query: function() {
                    return {
                        filters: {
                            'item_group': ['in', ['Drug', 'Medication', 'Medicine', 'Drugs']]
                        }
                    };
                }
            },
            {
                fieldname: 'dosage',
                fieldtype: 'Data',
                label: __('Dosage'),
                default: '1 tablet'
            },
            {
                fieldname: 'frequency',
                fieldtype: 'Select',
                label: __('Frequency'),
                options: '\nOnce Daily\nTwice Daily\nThrice Daily\nFour Times Daily\nEvery 6 Hours\nEvery 8 Hours\nAs Needed',
                default: 'Twice Daily'
            },
            {
                fieldname: 'duration',
                fieldtype: 'Int',
                label: __('Duration (Days)'),
                default: 5
            },
            {
                fieldname: 'quantity',
                fieldtype: 'Float',
                label: __('Quantity'),
                default: 10
            },
            {
                fieldname: 'instructions',
                fieldtype: 'Small Text',
                label: __('Instructions')
            }
        ],
        primary_action_label: __('Add'),
        primary_action: function(values) {
            let row = frm.add_child('items');
            row.medication = values.medication;
            row.dosage = values.dosage;
            row.frequency = values.frequency;
            row.duration = values.duration;
            row.duration_unit = 'Days';
            row.quantity = values.quantity;
            row.instructions = values.instructions;

            // Fetch medication details
            frappe.call({
                method: 'frappe.client.get_value',
                args: {
                    doctype: 'Item',
                    filters: { name: values.medication },
                    fieldname: ['item_name', 'standard_rate']
                },
                callback: function(r) {
                    if (r.message) {
                        row.medication_name = r.message.item_name;
                        row.rate = r.message.standard_rate || 0;
                        row.amount = flt(row.quantity) * flt(row.rate);
                        frm.refresh_field('items');
                        calculate_totals(frm);
                    }
                }
            });

            d.hide();
        }
    });
    d.show();
}

function show_pharmacy_queue_status(frm) {
    frappe.call({
        method: 'hospital_saas.hospital_saas.doctype.pharmacy_prescription.pharmacy_prescription.get_pharmacy_queue',
        args: { hospital: frm.doc.hospital },
        callback: function(r) {
            if (r.message) {
                let queue = r.message;
                let position = queue.findIndex(p => p.name === frm.doc.name) + 1;
                let html = `
                    <div class="pharmacy-queue-widget">
                        <div class="row">
                            <div class="col-md-6 text-center">
                                <div class="stat-value">${queue.length}</div>
                                <div class="stat-label text-muted">Pending Prescriptions</div>
                            </div>
                            <div class="col-md-6 text-center">
                                <div class="stat-value ${position > 0 ? 'text-primary' : ''}">${position > 0 ? '#' + position : 'Dispensed'}</div>
                                <div class="stat-label text-muted">Queue Position</div>
                            </div>
                        </div>
                    </div>
                    <style>
                        .pharmacy-queue-widget { padding: 15px; background: var(--fg-color); border-radius: 8px; margin-bottom: 15px; }
                        .pharmacy-queue-widget .stat-value { font-size: 28px; font-weight: 600; }
                        .pharmacy-queue-widget .stat-label { font-size: 12px; text-transform: uppercase; }
                    </style>
                `;
                if (frm.doc.status !== 'Dispensed') {
                    frm.set_intro(html);
                }
            }
        }
    });
}

// List view settings
frappe.listview_settings['Pharmacy Prescription'] = {
    add_fields: ['status', 'patient_name', 'total_amount'],
    get_indicator: function(doc) {
        var colors = {
            'Draft': 'gray',
            'Pending': 'orange',
            'Partially Dispensed': 'yellow',
            'Dispensed': 'green',
            'Cancelled': 'red'
        };
        return [__(doc.status), colors[doc.status] || 'gray', 'status,=,' + doc.status];
    },
    onload: function(listview) {
        listview.page.add_inner_button(__('Pharmacy Queue'), function() {
            frappe.set_route('pharmacy-queue');
        });
    }
};
