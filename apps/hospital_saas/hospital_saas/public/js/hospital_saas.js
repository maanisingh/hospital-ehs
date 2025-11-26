/**
 * Hospital HMS - Navigation & Core Functionality
 */

frappe.provide("hospital_saas");

// Initialize on document ready
$(document).ready(function() {
    setTimeout(hospital_saas.init, 300);
});

/**
 * Initialize Hospital HMS module
 */
hospital_saas.init = function() {
    // Only initialize for logged-in users
    if (!frappe.session.user || frappe.session.user === 'Guest') {
        return;
    }

    // Add body class
    $('body').addClass('hospital-saas-app');

    // Build custom navigation
    hospital_saas.buildNavbar();

    // Initialize realtime
    hospital_saas.initRealtime();

    // Check if we're on dashboard route and show dashboard
    if (window.location.pathname === '/app' || window.location.pathname === '/app/home') {
        hospital_saas.showDashboard();
    }

    console.log("Hospital HMS initialized");
};

/**
 * Build the top navigation bar
 */
hospital_saas.buildNavbar = function() {
    // Remove existing navbar if any
    $('.hospital-navbar').remove();

    // Get current user info
    const user = frappe.session.user;
    const userName = frappe.session.user_fullname || user;
    const userInitial = userName.charAt(0).toUpperCase();

    const navHTML = `
        <nav class="hospital-navbar">
            <a href="/app" class="navbar-brand" onclick="hospital_saas.showDashboard(); return false;">
                ${hospital_saas.icons.hospital}
                <span>Hospital SAAS</span>
            </a>
            <div class="nav-menu">
                <a href="/app/patient" class="nav-item">
                    ${hospital_saas.icons.patients}
                    <span>Patients</span>
                </a>

                <div class="hospital-dropdown">
                    <div class="nav-item">
                        ${hospital_saas.icons.opd}
                        <span>OPD</span>
                        ${hospital_saas.icons.chevron}
                    </div>
                    <div class="hospital-dropdown-menu">
                        <a href="/app/opd-token">OPD Token List</a>
                        <a href="/app/opd-token/new-opd-token-1">+ New Token</a>
                        <div class="divider"></div>
                        <a href="#" onclick="hospital_saas.showQueueDisplay(); return false;">Queue Display</a>
                        <div class="divider"></div>
                        <a href="/app/patient-appointment">Appointments</a>
                        <a href="/app/patient-encounter">Consultations</a>
                    </div>
                </div>

                <div class="hospital-dropdown">
                    <div class="nav-item">
                        ${hospital_saas.icons.ipd}
                        <span>IPD</span>
                        ${hospital_saas.icons.chevron}
                    </div>
                    <div class="hospital-dropdown-menu">
                        <a href="/app/ipd-admission">Admissions</a>
                        <a href="/app/ipd-admission/new-ipd-admission-1">+ New Admission</a>
                        <div class="divider"></div>
                        <a href="/app/healthcare-service-unit">Beds/Wards</a>
                    </div>
                </div>

                <div class="hospital-dropdown">
                    <div class="nav-item">
                        ${hospital_saas.icons.pharmacy}
                        <span>Pharmacy</span>
                        ${hospital_saas.icons.chevron}
                    </div>
                    <div class="hospital-dropdown-menu">
                        <a href="/app/pharmacy-prescription">Prescriptions</a>
                        <a href="/app/pharmacy-prescription/new-pharmacy-prescription-1">+ New Prescription</a>
                        <div class="divider"></div>
                        <a href="/pharmacy-queue">Pharmacy Queue</a>
                        <div class="divider"></div>
                        <a href="/app/pharmacy">Pharmacy Setup</a>
                        <a href="/app/item?item_group=Drug">Medications</a>
                    </div>
                </div>

                <div class="hospital-dropdown">
                    <div class="nav-item">
                        ${hospital_saas.icons.clinical}
                        <span>Clinical</span>
                        ${hospital_saas.icons.chevron}
                    </div>
                    <div class="hospital-dropdown-menu">
                        <a href="/app/vital-signs">Vital Signs</a>
                        <a href="/app/lab-test">Lab Tests</a>
                        <a href="/app/clinical-procedure">Procedures</a>
                        <div class="divider"></div>
                        <a href="/app/healthcare-practitioner">Doctors</a>
                    </div>
                </div>

                <div class="hospital-dropdown">
                    <div class="nav-item">
                        ${hospital_saas.icons.radiology}
                        <span>Radiology</span>
                        ${hospital_saas.icons.chevron}
                    </div>
                    <div class="hospital-dropdown-menu">
                        <a href="/app/radiology-order">Radiology Orders</a>
                        <a href="/app/radiology-order/new-radiology-order-1">+ New Order</a>
                        <div class="divider"></div>
                        <a href="/app/radiology-result">Results</a>
                        <a href="/radiology-queue">Radiology Queue</a>
                        <div class="divider"></div>
                        <a href="/app/radiology-examination-type">Exam Types</a>
                        <a href="/app/query-report/Radiology Orders Report">Reports</a>
                    </div>
                </div>

                <div class="hospital-dropdown">
                    <div class="nav-item">
                        ${hospital_saas.icons.billing}
                        <span>Billing</span>
                        ${hospital_saas.icons.chevron}
                    </div>
                    <div class="hospital-dropdown-menu">
                        <a href="/app/sales-invoice">Invoices</a>
                        <a href="/app/sales-invoice/new-sales-invoice-1">+ New Invoice</a>
                        <div class="divider"></div>
                        <a href="/app/payment-entry">Payments</a>
                    </div>
                </div>

                <a href="/app/hospital" class="nav-item">
                    ${hospital_saas.icons.settings}
                    <span>Setup</span>
                </a>
            </div>
            <div class="nav-right">
                <input type="text" class="nav-search" placeholder="Search (Ctrl+G)" readonly onclick="frappe.ui.toolbar.search.show()">
                <div class="hospital-dropdown">
                    <div class="user-menu">
                        <div class="user-avatar">${userInitial}</div>
                        ${hospital_saas.icons.chevron}
                    </div>
                    <div class="hospital-dropdown-menu" style="right: 0; left: auto;">
                        <div class="menu-header">Account</div>
                        <a href="/app/user/${encodeURIComponent(user)}">My Profile</a>
                        <a href="/app/hospital-saas-settings">Settings</a>
                        <div class="divider"></div>
                        <a href="#" onclick="frappe.app.logout(); return false;">Logout</a>
                    </div>
                </div>
            </div>
        </nav>
    `;

    // Prepend to body
    $('body').prepend(navHTML);
};

/**
 * Show Dashboard - Uses standard Frappe methods
 */
hospital_saas.showDashboard = function() {
    const mainSection = $('.layout-main-section');
    if (mainSection.length === 0) return;

    // Show loading first
    mainSection.html('<div style="padding: 40px; text-align: center;"><div class="loading-indicator">Loading Dashboard...</div></div>');

    // Fetch stats using standard Frappe count methods
    const stats = {
        total_patients: 0,
        todays_appointments: 0,
        active_tokens: 0,
        active_ipd: 0
    };

    const today = frappe.datetime.get_today();

    // Use Promise.all with individual calls
    Promise.all([
        frappe.xcall('frappe.client.get_count', { doctype: 'Patient' }).catch(() => 0),
        frappe.xcall('frappe.client.get_count', {
            doctype: 'Patient Appointment',
            filters: { appointment_date: today }
        }).catch(() => 0),
        frappe.xcall('frappe.client.get_count', {
            doctype: 'OPD Token',
            filters: { token_date: today, status: ['in', ['Waiting', 'In Progress', 'Called']] }
        }).catch(() => 0),
        frappe.xcall('frappe.client.get_count', {
            doctype: 'IPD Admission',
            filters: { status: ['in', ['Admitted', 'In Treatment']] }
        }).catch(() => 0)
    ]).then(function(results) {
        stats.total_patients = results[0] || 0;
        stats.todays_appointments = results[1] || 0;
        stats.active_tokens = results[2] || 0;
        stats.active_ipd = results[3] || 0;

        hospital_saas.renderDashboard(mainSection, stats);
    }).catch(function(err) {
        console.log("Dashboard error:", err);
        hospital_saas.renderDashboard(mainSection, stats);
    });
};

hospital_saas.renderDashboard = function(mainSection, stats) {
    const dashboardHTML = `
        <div class="hospital-dashboard">
            <div class="dashboard-header">
                <h1>Hospital Dashboard</h1>
                <p>Welcome back, ${frappe.session.user_fullname || frappe.session.user}! Here's your hospital overview.</p>
            </div>

            <div class="stats-grid">
                <div class="stat-card patients">
                    <div class="value">${stats.total_patients}</div>
                    <div class="label">Total Patients</div>
                </div>
                <div class="stat-card appointments">
                    <div class="value">${stats.todays_appointments}</div>
                    <div class="label">Today's Appointments</div>
                </div>
                <div class="stat-card tokens">
                    <div class="value">${stats.active_tokens}</div>
                    <div class="label">Active OPD Tokens</div>
                </div>
                <div class="stat-card revenue">
                    <div class="value">${stats.active_ipd}</div>
                    <div class="label">IPD Admissions</div>
                </div>
            </div>

            <h3 style="margin: 24px 0 16px; color: #333;">Quick Actions</h3>
            <div class="quick-actions">
                <a href="/app/patient/new-patient-1" class="quick-action-btn">
                    ${hospital_saas.icons.patients}
                    <span>Register Patient</span>
                </a>
                <a href="/app/opd-token/new-opd-token-1" class="quick-action-btn">
                    ${hospital_saas.icons.opd}
                    <span>Generate Token</span>
                </a>
                <a href="#" onclick="hospital_saas.showQueueDisplay(); return false;" class="quick-action-btn">
                    ${hospital_saas.icons.queue}
                    <span>Queue Display</span>
                </a>
                <a href="/app/patient-appointment/new-patient-appointment-1" class="quick-action-btn">
                    ${hospital_saas.icons.calendar}
                    <span>Book Appointment</span>
                </a>
                <a href="/app/ipd-admission/new-ipd-admission-1" class="quick-action-btn">
                    ${hospital_saas.icons.ipd}
                    <span>IPD Admission</span>
                </a>
                <a href="/app/sales-invoice/new-sales-invoice-1" class="quick-action-btn">
                    ${hospital_saas.icons.billing}
                    <span>Create Invoice</span>
                </a>
            </div>

            <h3 style="margin: 24px 0 16px; color: #333;">Recent Patients</h3>
            <div id="recent-patients-list" style="background: white; border-radius: 8px; padding: 16px;">
                <p style="color: #666;">Loading recent patients...</p>
            </div>
        </div>
    `;

    mainSection.html(dashboardHTML);

    // Load recent patients
    frappe.xcall('frappe.client.get_list', {
        doctype: 'Patient',
        fields: ['name', 'patient_name', 'mobile', 'creation'],
        limit_page_length: 5,
        order_by: 'creation desc'
    }).then(function(patients) {
        let patientHTML = '';
        if (patients && patients.length > 0) {
            patientHTML = '<table style="width: 100%; border-collapse: collapse;">';
            patientHTML += '<thead><tr style="border-bottom: 1px solid #eee;"><th style="text-align: left; padding: 8px;">ID</th><th style="text-align: left; padding: 8px;">Name</th><th style="text-align: left; padding: 8px;">Mobile</th></tr></thead><tbody>';
            patients.forEach(function(p) {
                patientHTML += `<tr style="border-bottom: 1px solid #eee;"><td style="padding: 8px;"><a href="/app/patient/${p.name}">${p.name}</a></td><td style="padding: 8px;">${p.patient_name || ''}</td><td style="padding: 8px;">${p.mobile || '-'}</td></tr>`;
            });
            patientHTML += '</tbody></table>';
        } else {
            patientHTML = '<p style="color: #666; margin: 0;">No patients registered yet. <a href="/app/patient/new-patient-1">Add your first patient</a></p>';
        }
        $('#recent-patients-list').html(patientHTML);
    }).catch(function() {
        $('#recent-patients-list').html('<p style="color: #666; margin: 0;">Could not load patients.</p>');
    });
};

/**
 * Show Queue Display (integrated) - Uses standard Frappe methods
 */
hospital_saas.showQueueDisplay = function() {
    const mainSection = $('.layout-main-section');
    if (mainSection.length === 0) {
        frappe.set_route('app');
        setTimeout(hospital_saas.showQueueDisplay, 500);
        return;
    }

    // Show loading
    mainSection.html('<div class="queue-display-page" style="text-align: center; padding: 40px;"><h2 style="color: white;">Loading Queue...</h2></div>');

    const today = frappe.datetime.get_today();

    // Fetch tokens using standard Frappe get_list
    frappe.xcall('frappe.client.get_list', {
        doctype: 'OPD Token',
        filters: {
            token_date: today,
            status: ['in', ['Waiting', 'In Progress', 'Called']]
        },
        fields: ['name', 'token_number', 'patient_name', 'status', 'department'],
        order_by: 'token_number asc',
        limit_page_length: 100
    }).then(function(tokens) {
        tokens = tokens || [];

        // Find current token (Called or In Progress)
        let currentToken = null;
        let waitingTokens = [];

        tokens.forEach(function(token) {
            if (token.status === 'Called' || token.status === 'In Progress') {
                currentToken = token;
            } else if (token.status === 'Waiting') {
                waitingTokens.push(token);
            }
        });

        hospital_saas.renderQueueDisplay(mainSection, currentToken, waitingTokens);
    }).catch(function(err) {
        console.log("Queue error:", err);
        hospital_saas.renderQueueDisplay(mainSection, null, []);
    });
};

hospital_saas.renderQueueDisplay = function(mainSection, currentToken, waitingTokens) {
    let currentHTML = `
        <div class="label">NOW SERVING</div>
        <div class="token-number">--</div>
        <div class="patient-name">Waiting for next patient...</div>
    `;

    if (currentToken) {
        currentHTML = `
            <div class="label">NOW SERVING</div>
            <div class="token-number">${currentToken.token_number}</div>
            <div class="patient-name">${currentToken.patient_name || ''}</div>
        `;
    }

    let tokensHTML = '';
    if (waitingTokens && waitingTokens.length > 0) {
        waitingTokens.forEach(function(token) {
            tokensHTML += `
                <div class="queue-card">
                    <div class="token">${token.token_number}</div>
                    <div class="name">${token.patient_name || ''}</div>
                </div>
            `;
        });
    } else {
        tokensHTML = '<p style="text-align: center; color: white; grid-column: 1/-1;">No patients waiting in queue</p>';
    }

    const queueHTML = `
        <div class="queue-display-page">
            <div class="queue-container">
                <div class="queue-header">
                    <h1>OPD Queue Display</h1>
                    <p>Real-time patient queue status - ${frappe.datetime.str_to_user(frappe.datetime.get_today())}</p>
                </div>

                <div class="queue-current-box">
                    ${currentHTML}
                </div>

                <h4 style="color: white; text-align: center; margin-bottom: 20px;">Waiting Queue (${waitingTokens.length} patients)</h4>
                <div class="queue-grid">
                    ${tokensHTML}
                </div>

                <div style="text-align: center; margin-top: 30px;">
                    <button class="btn btn-primary btn-lg" onclick="hospital_saas.showQueueDisplay()">
                        <span style="font-size: 16px;">Refresh Queue</span>
                    </button>
                    <button class="btn btn-default btn-lg" style="margin-left: 10px;" onclick="hospital_saas.showDashboard()">
                        <span style="font-size: 16px;">Back to Dashboard</span>
                    </button>
                    <a href="/app/opd-token/new-opd-token-1" class="btn btn-success btn-lg" style="margin-left: 10px;">
                        <span style="font-size: 16px;">+ New Token</span>
                    </a>
                </div>
            </div>
        </div>
    `;

    mainSection.html(queueHTML);

    // Auto-refresh every 10 seconds
    if (hospital_saas.queueRefreshTimer) {
        clearTimeout(hospital_saas.queueRefreshTimer);
    }
    hospital_saas.queueRefreshTimer = setTimeout(function() {
        if ($('.queue-display-page').length > 0) {
            hospital_saas.showQueueDisplay();
        }
    }, 10000);
};

/**
 * Initialize Realtime updates
 */
hospital_saas.initRealtime = function() {
    frappe.realtime.on('queue_update', function(data) {
        // Auto-refresh queue if viewing it
        if ($('.queue-display-page').length > 0) {
            hospital_saas.showQueueDisplay();
        }
        if (data.current_token) {
            frappe.show_alert({
                message: __('Now calling: {0}', [data.current_token]),
                indicator: 'green'
            }, 5);
        }
    });
};

/**
 * Quick OPD Token Generation
 */
hospital_saas.quickOPDToken = function(patient, hospital) {
    frappe.call({
        method: 'hospital_saas.api.create_opd_token',
        args: { patient: patient, hospital: hospital },
        callback: function(r) {
            if (r.message) {
                frappe.show_alert({
                    message: __('Token Generated: {0}', [r.message.token_number]),
                    indicator: 'green'
                }, 5);
                frappe.set_route('Form', 'OPD Token', r.message.name);
            }
        }
    });
};

/**
 * SVG Icons
 */
hospital_saas.icons = {
    hospital: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"/><path d="M12 7v4"/><path d="M10 9h4"/></svg>',
    patients: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    radiology: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>',
    opd: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    ipd: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>',
    pharmacy: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M12 5 9.04 7.96a2.17 2.17 0 0 0 0 3.08v0c.82.82 2.13.85 3 .07l2.07-1.9a2.82 2.82 0 0 1 3.79 0l2.96 2.66"/><path d="m18 15-2-2"/><path d="m15 18-2-2"/></svg>',
    clinical: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
    billing: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    settings: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    queue: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>',
    calendar: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    chevron: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>'
};

// Expose to global frappe namespace
frappe.hospital_saas = hospital_saas;
