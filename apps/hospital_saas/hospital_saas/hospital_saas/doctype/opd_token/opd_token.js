// OPD Token Client Script
frappe.ui.form.on('OPD Token', {
    refresh: function(frm) {
        // Show current queue status in form
        if (!frm.is_new()) {
            show_queue_status(frm);
        }

        // Add Queue Display button with options
        frm.add_custom_button(__('View Queue'), function() {
            show_queue_dialog(frm.doc.hospital);
        }, __('Queue'));

        frm.add_custom_button(__('TV Display (Fullscreen)'), function() {
            const hospital = frm.doc.hospital || '';
            window.open('/queue/' + hospital, '_blank');
        }, __('Queue'));

        // Add Call Next button (for receptionists)
        if (frm.doc.status === 'Waiting') {
            frm.add_custom_button(__('Call Patient'), function() {
                frm.set_value('status', 'With Doctor');
                frm.set_value('called_at', frappe.datetime.now_datetime());
                frm.save().then(() => {
                    // Announce via browser
                    announce_patient(frm.doc.token_number, frm.doc.patient_name);
                });
            }, __('Actions'));
        }

        // Add Complete button (for doctors)
        if (frm.doc.status === 'With Doctor') {
            frm.add_custom_button(__('Complete Consultation'), function() {
                frm.set_value('status', 'Completed');
                frm.set_value('consultation_ended', frappe.datetime.now_datetime());
                frm.save();
            }, __('Actions'));

            // Add send to Pharmacy button
            frm.add_custom_button(__('Send to Pharmacy'), function() {
                create_pharmacy_prescription(frm);
            }, __('Actions'));
        }

        // Auto-generate token number
        if (frm.is_new() && !frm.doc.token_number) {
            frappe.call({
                method: 'hospital_saas.api.get_next_token_number',
                args: {
                    hospital: frm.doc.hospital,
                    token_date: frm.doc.token_date || frappe.datetime.get_today()
                },
                callback: function(r) {
                    if (r.message) {
                        frm.set_value('token_number', r.message);
                    }
                }
            });
        }
    },

    hospital: function(frm) {
        // Regenerate token number when hospital changes
        if (frm.is_new()) {
            frappe.call({
                method: 'hospital_saas.api.get_next_token_number',
                args: {
                    hospital: frm.doc.hospital,
                    token_date: frm.doc.token_date || frappe.datetime.get_today()
                },
                callback: function(r) {
                    if (r.message) {
                        frm.set_value('token_number', r.message);
                    }
                }
            });
        }
    }
});

// Show queue status section in form
function show_queue_status(frm) {
    frappe.call({
        method: 'hospital_saas.api.get_queue_display',
        args: { hospital: frm.doc.hospital },
        callback: function(r) {
            if (r.message) {
                let data = r.message;
                let html = `
                    <div class="queue-status-widget">
                        <div class="row">
                            <div class="col-md-4 text-center">
                                <div class="stat-box">
                                    <div class="stat-value text-primary">${data.current ? data.current.token_number : '---'}</div>
                                    <div class="stat-label text-muted">Now Serving</div>
                                </div>
                            </div>
                            <div class="col-md-4 text-center">
                                <div class="stat-box">
                                    <div class="stat-value">${data.total_waiting || 0}</div>
                                    <div class="stat-label text-muted">Waiting</div>
                                </div>
                            </div>
                            <div class="col-md-4 text-center">
                                <div class="stat-box">
                                    <div class="stat-value text-success">${frm.doc.token_number}</div>
                                    <div class="stat-label text-muted">This Token</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <style>
                        .queue-status-widget { padding: 15px; background: var(--fg-color); border-radius: 8px; margin-bottom: 15px; }
                        .queue-status-widget .stat-value { font-size: 32px; font-weight: 600; }
                        .queue-status-widget .stat-label { font-size: 12px; text-transform: uppercase; }
                    </style>
                `;
                frm.set_intro(html);
            }
        }
    });
}

// Show queue dialog
function show_queue_dialog(hospital) {
    let d = new frappe.ui.Dialog({
        title: __('OPD Queue'),
        size: 'large',
        fields: [
            {
                fieldname: 'queue_html',
                fieldtype: 'HTML'
            }
        ]
    });

    d.show();

    // Load queue data
    function loadQueue() {
        frappe.call({
            method: 'hospital_saas.api.get_queue_display',
            args: { hospital: hospital },
            callback: function(r) {
                if (r.message) {
                    let data = r.message;
                    let html = `
                        <div class="queue-dialog-content">
                            <div class="current-token-section">
                                <h4 class="text-muted">NOW SERVING</h4>
                                <div class="current-token-number">${data.current ? data.current.token_number : '---'}</div>
                                <div class="current-patient">${data.current ? data.current.patient_name : 'Waiting for next patient'}</div>
                            </div>
                            <hr>
                            <div class="waiting-section">
                                <h5>Waiting Queue (${data.total_waiting || 0})</h5>
                                <div class="queue-grid">
                    `;

                    if (data.queue && data.queue.length > 0) {
                        data.queue.forEach(function(item) {
                            html += `
                                <div class="queue-token-item">
                                    <div class="token-num">${item.token_number}</div>
                                    <div class="patient-name">${item.patient_name || 'Patient'}</div>
                                </div>
                            `;
                        });
                    } else {
                        html += '<div class="text-muted text-center p-3">No patients waiting</div>';
                    }

                    html += `
                                </div>
                            </div>
                        </div>
                        <style>
                            .queue-dialog-content { padding: 20px; }
                            .current-token-section { text-align: center; padding: 20px; }
                            .current-token-number { font-size: 72px; font-weight: 700; color: var(--primary); }
                            .current-patient { font-size: 18px; color: var(--text-color); }
                            .queue-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 10px; margin-top: 15px; }
                            .queue-token-item { background: var(--control-bg); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px; text-align: center; }
                            .queue-token-item .token-num { font-size: 24px; font-weight: 600; color: var(--primary); }
                            .queue-token-item .patient-name { font-size: 11px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                        </style>
                    `;

                    d.fields_dict.queue_html.$wrapper.html(html);
                }
            }
        });
    }

    loadQueue();

    // Auto-refresh every 5 seconds
    let refreshInterval = setInterval(loadQueue, 5000);

    d.$wrapper.on('hidden.bs.modal', function() {
        clearInterval(refreshInterval);
    });
}

// Announce patient
function announce_patient(tokenNumber, patientName) {
    try {
        const msg = new SpeechSynthesisUtterance();
        msg.text = `Token number ${tokenNumber}. ${patientName || 'Patient'}, please proceed to the doctor.`;
        msg.lang = 'en-IN';
        msg.rate = 0.9;
        window.speechSynthesis.speak(msg);
    } catch(e) {
        console.log('Speech synthesis not available');
    }
}

// Create pharmacy prescription from token
function create_pharmacy_prescription(frm) {
    frappe.new_doc('Pharmacy Prescription', {
        patient: frm.doc.patient,
        patient_name: frm.doc.patient_name,
        hospital: frm.doc.hospital,
        practitioner: frm.doc.practitioner,
        opd_token: frm.doc.name
    });
}

// OPD Token List View customization
frappe.listview_settings['OPD Token'] = {
    add_fields: ['status', 'token_number', 'patient_name'],
    get_indicator: function(doc) {
        var colors = {
            'Waiting': 'orange',
            'Called': 'blue',
            'With Doctor': 'green',
            'Completed': 'gray',
            'Cancelled': 'red',
            'No Show': 'darkgrey'
        };
        return [__(doc.status), colors[doc.status] || 'gray', 'status,=,' + doc.status];
    },
    onload: function(listview) {
        // Add View Queue button to list
        listview.page.add_inner_button(__('View Queue Display'), function() {
            window.open('/queue/', '_blank');
        });

        listview.page.add_inner_button(__('Call Next'), function() {
            frappe.call({
                method: 'hospital_saas.api.call_next_token',
                callback: function(r) {
                    if (r.message && r.message.success) {
                        frappe.show_alert({
                            message: __('Called Token {0}: {1}', [r.message.token_number, r.message.patient_name]),
                            indicator: 'green'
                        });
                        listview.refresh();
                    } else {
                        frappe.show_alert({
                            message: r.message.message || __('No waiting tokens'),
                            indicator: 'orange'
                        });
                    }
                }
            });
        });
    }
};
