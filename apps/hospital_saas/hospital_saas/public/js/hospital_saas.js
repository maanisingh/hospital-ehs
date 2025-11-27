/**
 * Hospital SAAS - Complete Navigation & UI System
 * Fixes: SPA routing, branding, queue design, staff menu
 */

frappe.provide("hospital_saas");
frappe.provide("hospital_saas.setup_wizard");

// ============================================
// INITIALIZATION
// ============================================

// Define setup_wizard.launch early so it's available when navbar builds
hospital_saas.setup_wizard.launch = function() {
    frappe.call({
        method: "hospital_saas.hospital_saas.doctype.hospital_setup_wizard.hospital_setup_wizard.get_or_create_wizard",
        callback: (r) => {
            if (r.message) {
                hospital_saas.setup_wizard.wizard_name = r.message.name || r.message.wizard;
                hospital_saas.setup_wizard.current_step = 1;
                hospital_saas.setup_wizard.step_data = {};
                hospital_saas.setup_wizard.total_steps = 6;

                // Load and show setup wizard
                if (typeof hospital_saas.setup_wizard.render_wizard === 'function') {
                    hospital_saas.setup_wizard.render_wizard();
                } else {
                    frappe.msgprint(__('Setup wizard is loading. Please try again.'));
                }
            }
        }
    });
};

$(document).ready(function() {
    // Hide ERPNext branding immediately
    hospital_saas.hideBranding();

    // Initialize after Frappe is ready
    if (frappe.boot && frappe.session && frappe.session.user && frappe.session.user !== 'Guest') {
        hospital_saas.init();
    }
});

// Run on Frappe app init
$(document).on('startup', function() {
    if (frappe.session && frappe.session.user && frappe.session.user !== 'Guest') {
        if (!hospital_saas._initialized) {
            hospital_saas.init();
        }
        // Redirect to Hospital SAAS workspace if on default page
        setTimeout(function() {
            hospital_saas.checkAndRedirectHome();
        }, 200);
    }
});

// Also run on route change
$(document).on('page-change', function() {
    hospital_saas.hideBranding();

    // Re-init navbar if missing
    if (frappe.session && frappe.session.user && frappe.session.user !== 'Guest') {
        if ($('.hospital-navbar').length === 0) {
            hospital_saas.buildNavbar();
        }
    }
});

// Hook into Frappe's app ready event
if (typeof frappe !== 'undefined') {
    // Initialize when frappe is ready
    frappe.call_on_ready = frappe.call_on_ready || [];
    frappe.call_on_ready.push(function() {
        if (frappe.session && frappe.session.user && frappe.session.user !== 'Guest' && !hospital_saas._initialized) {
            hospital_saas.init();
        }
    });
}

hospital_saas._initialized = false;

hospital_saas.init = function() {
    // Only initialize for logged-in users
    if (!frappe.session.user || frappe.session.user === 'Guest') {
        return;
    }

    // Prevent double initialization
    if (hospital_saas._initialized) {
        return;
    }
    hospital_saas._initialized = true;

    // Add body class
    $('body').addClass('hospital-saas-app');

    // Hide ERPNext branding
    hospital_saas.hideBranding();

    // Build custom navigation
    hospital_saas.buildNavbar();

    // Initialize realtime
    hospital_saas.initRealtime();

    // Redirect to hospital dashboard if on home page or setup wizard
    hospital_saas.checkAndRedirectHome();

    console.log("Hospital SAAS initialized");
};

hospital_saas.checkAndRedirectHome = function() {
    // Check current route
    const route = frappe.get_route();
    const routeStr = route ? route.join('/') : '';

    // If already on Hospital SAAS workspace, ensure content is loaded
    if (routeStr === 'Workspaces/Hospital SAAS' ||
        routeStr === 'Workspaces/Hospital%20SAAS' ||
        routeStr.includes('Hospital SAAS') ||
        routeStr.includes('Hospital%20SAAS')) {
        // Ensure workspace content loads properly
        hospital_saas.ensureWorkspaceLoaded();
        return;
    }

    // List of routes that should redirect to Hospital SAAS workspace
    const homeRoutes = ['', 'home', 'setup-wizard', 'Workspaces', 'workspaces', 'Workspaces/Home', 'app', 'app/home'];

    // ERPNext setup wizard routes to catch
    const isSetupWizard = routeStr.includes('Setup Wizard') || routeStr.includes('setup-wizard');

    // If on home page or ERPNext setup wizard, redirect to Hospital SAAS workspace
    if (homeRoutes.includes(routeStr) || isSetupWizard || routeStr === '') {
        // Fix for dashboard not loading: do a quick bounce through Patient list first
        // This forces Frappe to properly initialize the workspace renderer
        if (!hospital_saas._initialBounce) {
            hospital_saas._initialBounce = true;
            frappe.set_route('List', 'Patient');
            setTimeout(function() {
                frappe.set_route('Workspaces', 'Hospital SAAS');
                setTimeout(hospital_saas.ensureWorkspaceLoaded, 500);
            }, 100);
        } else {
            frappe.set_route('Workspaces', 'Hospital SAAS');
            setTimeout(hospital_saas.ensureWorkspaceLoaded, 800);
        }
    }
};

// Re-check on frappe ready event
if (frappe.ready) {
    frappe.ready(function() {
        if (frappe.session.user && frappe.session.user !== 'Guest') {
            setTimeout(function() {
                if (!hospital_saas._initialized) {
                    hospital_saas.init();
                }
            }, 500);
        }
    });
}

// Also intercept route changes to redirect home to Hospital SAAS workspace
$(document).on('page-change', function() {
    if (frappe.session.user && frappe.session.user !== 'Guest') {
        const route = frappe.get_route();
        const routeStr = route ? route.join('/') : '';

        // Skip if already on Hospital SAAS workspace
        if (routeStr.includes('Hospital SAAS') || routeStr.includes('Hospital%20SAAS')) {
            // Force refresh workspace content if widgets not loaded
            hospital_saas.ensureWorkspaceLoaded();
            return;
        }

        // List of routes that should redirect to Hospital SAAS workspace
        const homeRoutes = ['', 'home', 'Workspaces', 'workspaces', 'Workspaces/Home'];

        // Redirect home routes to Hospital SAAS workspace
        if (homeRoutes.includes(routeStr) ||
            routeStr.includes('setup-wizard') ||
            routeStr.includes('Setup Wizard')) {
            frappe.set_route('Workspaces', 'Hospital SAAS');
        }
    }
});

// Force workspace content to load properly
hospital_saas.ensureWorkspaceLoaded = function() {
    // Check if workspace widgets are loaded
    setTimeout(function() {
        const workspace = $('.workspace-main-section');
        const widgets = workspace.find('.widget');
        const shortcuts = workspace.find('.shortcut-widget-box, .shortcuts-section');

        // If no widgets found, force reload
        if (widgets.length === 0 && shortcuts.length === 0) {
            console.log('Hospital SAAS: Forcing workspace reload...');

            // Try to trigger Frappe's workspace reload
            if (frappe.workspace && frappe.workspace.page) {
                frappe.workspace.page.reload();
            } else if (cur_page && cur_page.page && cur_page.page.wrapper) {
                // Force re-render by triggering show event
                $(cur_page.page.wrapper).trigger('show');
            }

            // Fallback: reload workspace via API
            frappe.xcall('frappe.desk.desktop.get_workspace_sidebar_items').then(function() {
                if (frappe.workspace) {
                    frappe.workspace.show();
                }
            });
        }
    }, 300);

    // Double-check after a longer delay
    setTimeout(function() {
        const workspace = $('.workspace-main-section');
        const content = workspace.find('.widget, .shortcut-widget-box, .number-card');

        if (content.length === 0) {
            console.log('Hospital SAAS: Content still missing, triggering refresh...');
            // Force page refresh as last resort
            if (frappe.pages && frappe.pages['Workspaces']) {
                frappe.pages['Workspaces'].page.show();
            }
        }
    }, 800);
};

// ============================================
// HIDE ERPNEXT BRANDING
// ============================================

hospital_saas.hideBranding = function() {
    // Hide ERPNext/Frappe logos and branding
    const style = document.createElement('style');
    style.textContent = `
        /* Hide ERPNext branding */
        .navbar-brand img,
        .erpnext-logo,
        .frappe-logo,
        [src*="erpnext"],
        [src*="frappe-logo"],
        .splash-screen,
        #splash,
        .desk-sidebar .sidebar-menu .standard-sidebar-section:first-child,
        .navbar .navbar-brand:not(.hospital-brand) {
            display: none !important;
            visibility: hidden !important;
        }

        /* Hide splash screen */
        body > .splash {
            display: none !important;
        }

        /* Hide standard navbar when our navbar is present */
        .hospital-saas-app .navbar.navbar-expand {
            display: none !important;
        }

        /* Adjust page layout for our navbar */
        .hospital-saas-app .page-container {
            padding-top: 60px !important;
        }

        .hospital-saas-app .frappe-control[data-fieldtype="Attach Image"] .missing-image {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
        }
    `;
    document.head.appendChild(style);

    // Remove splash screen
    $('.splash, #splash, .splash-screen').remove();
};

// ============================================
// NAVIGATION BAR
// ============================================

hospital_saas.buildNavbar = function() {
    // Remove existing navbar if any
    $('.hospital-navbar').remove();

    const user = frappe.session.user;
    const userName = frappe.session.user_fullname || user;
    const userInitial = userName.charAt(0).toUpperCase();

    const navHTML = `
        <nav class="hospital-navbar">
            <a href="#" class="navbar-brand hospital-brand" onclick="frappe.set_route('hospital-dashboard'); return false;">
                ${hospital_saas.icons.hospital}
                <span>Hospital SAAS</span>
            </a>
            <div class="nav-menu">
                <a href="#" class="nav-item" onclick="hospital_saas.navigate('/app/patient'); return false;">
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
                        <a href="#" onclick="hospital_saas.navigate('/app/opd-token'); return false;">OPD Token List</a>
                        <a href="#" onclick="hospital_saas.navigate('/app/opd-token/new-opd-token-1'); return false;">+ New Token</a>
                        <div class="divider"></div>
                        <a href="#" onclick="hospital_saas.showQueueDisplay(); return false;">OPD Queue Display</a>
                        <div class="divider"></div>
                        <a href="#" onclick="hospital_saas.navigate('/app/patient-appointment'); return false;">Appointments</a>
                        <a href="#" onclick="hospital_saas.navigate('/app/patient-encounter'); return false;">Consultations</a>
                    </div>
                </div>

                <div class="hospital-dropdown">
                    <div class="nav-item">
                        ${hospital_saas.icons.ipd}
                        <span>IPD</span>
                        ${hospital_saas.icons.chevron}
                    </div>
                    <div class="hospital-dropdown-menu">
                        <a href="#" onclick="hospital_saas.navigate('/app/ipd-admission'); return false;">Admissions</a>
                        <a href="#" onclick="hospital_saas.navigate('/app/ipd-admission/new-ipd-admission-1'); return false;">+ New Admission</a>
                        <div class="divider"></div>
                        <a href="#" onclick="hospital_saas.navigate('/app/healthcare-service-unit'); return false;">Beds/Wards</a>
                    </div>
                </div>

                <div class="hospital-dropdown">
                    <div class="nav-item">
                        ${hospital_saas.icons.pharmacy}
                        <span>Pharmacy</span>
                        ${hospital_saas.icons.chevron}
                    </div>
                    <div class="hospital-dropdown-menu">
                        <a href="#" onclick="hospital_saas.navigate('/app/pharmacy-prescription'); return false;">Prescriptions</a>
                        <a href="#" onclick="hospital_saas.navigate('/app/pharmacy-prescription/new-pharmacy-prescription-1'); return false;">+ New Prescription</a>
                        <div class="divider"></div>
                        <a href="#" onclick="hospital_saas.showPharmacyQueue(); return false;">Pharmacy Queue</a>
                        <div class="divider"></div>
                        <a href="#" onclick="hospital_saas.navigate('/app/item', {item_group: 'Medicines'}); return false;">Medications</a>
                    </div>
                </div>

                <div class="hospital-dropdown">
                    <div class="nav-item">
                        ${hospital_saas.icons.lab}
                        <span>Lab</span>
                        ${hospital_saas.icons.chevron}
                    </div>
                    <div class="hospital-dropdown-menu">
                        <a href="#" onclick="hospital_saas.navigate('/app/lab-test'); return false;">Lab Tests</a>
                        <a href="#" onclick="hospital_saas.navigate('/app/lab-test/new-lab-test-1'); return false;">+ New Lab Test</a>
                        <div class="divider"></div>
                        <a href="#" onclick="hospital_saas.showLabQueue(); return false;">Lab Queue Display</a>
                        <div class="divider"></div>
                        <a href="#" onclick="hospital_saas.navigate('/app/lab-test-template'); return false;">Test Templates</a>
                        <a href="#" onclick="hospital_saas.navigate('/app/sample-collection'); return false;">Sample Collection</a>
                    </div>
                </div>

                <div class="hospital-dropdown">
                    <div class="nav-item">
                        ${hospital_saas.icons.radiology}
                        <span>Radiology</span>
                        ${hospital_saas.icons.chevron}
                    </div>
                    <div class="hospital-dropdown-menu">
                        <a href="#" onclick="hospital_saas.navigate('/app/radiology-order'); return false;">Radiology Orders</a>
                        <a href="#" onclick="hospital_saas.navigate('/app/radiology-order/new-radiology-order-1'); return false;">+ New Order</a>
                        <div class="divider"></div>
                        <a href="#" onclick="hospital_saas.navigate('/app/radiology-result'); return false;">Results</a>
                        <a href="#" onclick="hospital_saas.showRadiologyQueue(); return false;">Radiology Queue</a>
                        <div class="divider"></div>
                        <a href="#" onclick="hospital_saas.navigate('/app/radiology-examination-type'); return false;">Exam Types</a>
                    </div>
                </div>

                <div class="hospital-dropdown">
                    <div class="nav-item">
                        ${hospital_saas.icons.billing}
                        <span>Billing</span>
                        ${hospital_saas.icons.chevron}
                    </div>
                    <div class="hospital-dropdown-menu">
                        <a href="#" onclick="hospital_saas.navigate('/app/sales-invoice'); return false;">Invoices</a>
                        <a href="#" onclick="hospital_saas.navigate('/app/sales-invoice/new-sales-invoice-1'); return false;">+ New Invoice</a>
                        <div class="divider"></div>
                        <a href="#" onclick="hospital_saas.navigate('/app/payment-entry'); return false;">Payments</a>
                    </div>
                </div>

                <div class="hospital-dropdown">
                    <div class="nav-item">
                        ${hospital_saas.icons.inventory}
                        <span>Inventory</span>
                        ${hospital_saas.icons.chevron}
                    </div>
                    <div class="hospital-dropdown-menu">
                        <a href="#" onclick="hospital_saas.navigate('/app/stock-entry'); return false;">Stock Entry</a>
                        <a href="#" onclick="hospital_saas.navigate('/app/stock-entry/new-stock-entry-1'); return false;">+ New Entry</a>
                        <div class="divider"></div>
                        <a href="#" onclick="hospital_saas.navigate('/app/item', {item_group: 'Medicines'}); return false;">Medicines</a>
                        <a href="#" onclick="hospital_saas.navigate('/app/item', {item_group: 'Lab Consumables'}); return false;">Lab Consumables</a>
                        <div class="divider"></div>
                        <a href="#" onclick="hospital_saas.navigate('/app/warehouse'); return false;">Warehouses</a>
                        <a href="#" onclick="hospital_saas.navigate('/app/batch'); return false;">Batch Tracking</a>
                    </div>
                </div>

                <div class="hospital-dropdown">
                    <div class="nav-item">
                        ${hospital_saas.icons.staff}
                        <span>Staff</span>
                        ${hospital_saas.icons.chevron}
                    </div>
                    <div class="hospital-dropdown-menu">
                        <a href="#" onclick="hospital_saas.navigate('/app/user'); return false;">All Users</a>
                        <a href="#" onclick="hospital_saas.navigate('/app/user/new-user-1'); return false;">+ Create User</a>
                        <div class="divider"></div>
                        <a href="#" onclick="hospital_saas.navigate('/app/healthcare-practitioner'); return false;">Doctors & Staff</a>
                        <a href="#" onclick="hospital_saas.navigate('/app/healthcare-practitioner/new-healthcare-practitioner-1'); return false;">+ Add Doctor/Staff</a>
                        <div class="divider"></div>
                        <a href="#" onclick="hospital_saas.navigate('/app/role'); return false;">Roles</a>
                        <a href="#" onclick="hospital_saas.navigate('/app/permission-manager'); return false;">Permissions</a>
                    </div>
                </div>

                <a href="#" class="nav-item" onclick="hospital_saas.navigate('/app/hospital'); return false;">
                    ${hospital_saas.icons.settings}
                    <span>Setup</span>
                </a>
            </div>
            <div class="nav-right">
                <div class="nav-search-wrapper" onclick="hospital_saas.openSearch()">
                    ${hospital_saas.icons.search}
                    <span>Search</span>
                </div>
                <div class="hospital-dropdown">
                    <div class="user-menu">
                        <div class="user-avatar">${userInitial}</div>
                        <span class="user-name">${userName.split(' ')[0]}</span>
                        ${hospital_saas.icons.chevron}
                    </div>
                    <div class="hospital-dropdown-menu" style="right: 0; left: auto;">
                        <div class="menu-header">${userName}</div>
                        <a href="#" onclick="frappe.set_route('Form', 'User', frappe.session.user); return false;">My Profile</a>
                        <div class="divider"></div>
                        <a href="#" onclick="hospital_saas.setup_wizard.launch(); return false;">
                            ${hospital_saas.icons.guide || '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>'}
                            Setup Guide
                        </a>
                        <div class="divider"></div>
                        <a href="#" onclick="frappe.set_route('Form', 'Hospital SAAS Settings'); return false;">Hospital Settings</a>
                        <a href="#" onclick="frappe.set_route('Form', 'Hospital Auto Flow Settings'); return false;">Auto Flow Settings</a>
                        <div class="divider"></div>
                        <a href="#" onclick="frappe.app.logout(); return false;">Logout</a>
                    </div>
                </div>
            </div>
        </nav>
    `;

    $('body').prepend(navHTML);
};

// ============================================
// SEARCH FUNCTION
// ============================================

hospital_saas.openSearch = function() {
    // Method 1: Try Frappe's awesomebar (Ctrl+K shortcut)
    if (frappe.ui && frappe.ui.toolbar && frappe.ui.toolbar.search) {
        try {
            frappe.ui.toolbar.search.show();
            return;
        } catch(e) {
            console.log('Toolbar search not available');
        }
    }

    // Method 2: Try to find and click the search input
    const searchInput = $('.search-bar input, #navbar-search, .awesomebar input, input[data-doctype="Search"]');
    if (searchInput.length) {
        searchInput.first().focus().click();
        return;
    }

    // Method 3: Trigger Ctrl+K keyboard shortcut
    try {
        const event = new KeyboardEvent('keydown', {
            key: 'k',
            code: 'KeyK',
            ctrlKey: true,
            bubbles: true
        });
        document.dispatchEvent(event);

        // Check if search opened
        setTimeout(function() {
            if ($('.search-dialog, .awesomebar-modal, .modal.search').length === 0) {
                // Fallback to custom dialog
                hospital_saas.showSearchDialog();
            }
        }, 200);
        return;
    } catch(e) {
        console.log('Keyboard shortcut failed');
    }

    // Method 4: Custom search dialog as fallback
    hospital_saas.showSearchDialog();
};

hospital_saas.showSearchDialog = function() {
    // Create custom search dialog
    if (hospital_saas._searchDialog) {
        hospital_saas._searchDialog.show();
        hospital_saas._searchDialog.$wrapper.find('input[data-fieldname="search_term"]').focus().val('');
        hospital_saas._searchDialog.$wrapper.find('.search-results-container').html('<p class="text-muted">Type to search...</p>');
        return;
    }

    hospital_saas._searchDialog = new frappe.ui.Dialog({
        title: __('Search Hospital SAAS'),
        fields: [
            {
                fieldtype: 'Data',
                fieldname: 'search_term',
                label: __('Search'),
                placeholder: __('Search for patients, tokens, invoices...')
            },
            {
                fieldtype: 'HTML',
                fieldname: 'search_results',
                options: '<div class="search-results-container" style="max-height: 350px; overflow-y: auto; padding: 10px;"><p class="text-muted">Type and press Enter to search...</p></div>'
            }
        ],
        primary_action_label: __('Search'),
        primary_action: function() {
            const term = hospital_saas._searchDialog.get_value('search_term');
            if (term && term.length >= 2) {
                hospital_saas.performSearch(term);
            }
        }
    });

    // Also search on Enter key
    hospital_saas._searchDialog.$wrapper.find('input[data-fieldname="search_term"]').on('keypress', function(e) {
        if (e.which === 13) {
            const term = $(this).val();
            if (term && term.length >= 2) {
                hospital_saas.performSearch(term);
            }
        }
    });

    hospital_saas._searchDialog.show();
    hospital_saas._searchDialog.$wrapper.find('input[data-fieldname="search_term"]').focus();
};

hospital_saas.performSearch = function(term) {
    const resultsContainer = hospital_saas._searchDialog.$wrapper.find('.search-results-container');
    resultsContainer.html('<p class="text-muted"><i class="fa fa-spinner fa-spin"></i> Searching...</p>');

    // Search across common doctypes
    const doctypes = [
        { dt: 'Patient', fields: ['name', 'patient_name'], display: 'patient_name' },
        { dt: 'OPD Token', fields: ['name', 'patient_name'], display: 'patient_name' },
        { dt: 'Patient Appointment', fields: ['name', 'patient_name'], display: 'patient_name' },
        { dt: 'Sales Invoice', fields: ['name', 'customer_name'], display: 'customer_name' },
        { dt: 'Healthcare Practitioner', fields: ['name', 'practitioner_name'], display: 'practitioner_name' }
    ];

    const promises = doctypes.map(item => {
        return frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: item.dt,
                or_filters: [
                    ['name', 'like', '%' + term + '%'],
                    [item.display || 'name', 'like', '%' + term + '%']
                ],
                fields: item.fields,
                limit_page_length: 5
            },
            async: true
        }).catch(() => ({ message: [] }));
    });

    Promise.all(promises).then(results => {
        let html = '';
        let totalResults = 0;

        results.forEach((r, i) => {
            if (r.message && r.message.length > 0) {
                totalResults += r.message.length;
                html += `<div class="search-section" style="margin-bottom: 15px;">
                    <strong style="color: #333; font-size: 13px;">${doctypes[i].dt}</strong>
                    <ul style="list-style:none; padding-left:0; margin-top: 5px;">`;
                r.message.forEach(item => {
                    const display = item[doctypes[i].display] || item.name;
                    html += `<li style="padding: 5px 10px; border-radius: 4px; cursor: pointer;"
                        onmouseover="this.style.background='#f5f5f5'"
                        onmouseout="this.style.background='transparent'"
                        onclick="frappe.set_route('Form','${doctypes[i].dt}','${item.name}'); hospital_saas._searchDialog.hide();">
                        <span style="font-weight: 500;">${display}</span>
                        <small style="color: #888; margin-left: 10px;">${item.name}</small>
                    </li>`;
                });
                html += '</ul></div>';
            }
        });

        if (!html) {
            html = '<p class="text-muted text-center" style="padding: 20px;">No results found for "' + term + '"</p>';
        } else {
            html = `<p class="text-muted" style="font-size: 12px; margin-bottom: 10px;">Found ${totalResults} results</p>` + html;
        }

        resultsContainer.html(html);
    }).catch(err => {
        resultsContainer.html('<p class="text-danger">Error searching. Please try again.</p>');
    });
};

// ============================================
// SPA NAVIGATION HELPER
// ============================================

hospital_saas.navigate = function(route, filters) {
    // Use Frappe's SPA routing to prevent full page refresh
    if (filters) {
        frappe.route_options = filters;
    }

    // Remove /app prefix for frappe.set_route
    let cleanRoute = route.replace('/app/', '').replace('/app', '');

    if (!cleanRoute || cleanRoute === '') {
        // Go to Frappe home workspace
        frappe.set_route('');
        return;
    }

    // Parse route parts
    const parts = cleanRoute.split('/').filter(p => p);

    if (parts.length === 0) {
        frappe.set_route('');
    } else {
        frappe.set_route(parts);
    }
};

// ============================================
// DASHBOARD
// ============================================

hospital_saas.showDashboard = function() {
    const mainSection = $('.layout-main-section');
    if (mainSection.length === 0) return;

    mainSection.html('<div style="padding: 40px; text-align: center;"><div class="loading-indicator">Loading Dashboard...</div></div>');

    const today = frappe.datetime.get_today();

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
        const stats = {
            total_patients: results[0] || 0,
            todays_appointments: results[1] || 0,
            active_tokens: results[2] || 0,
            active_ipd: results[3] || 0
        };
        hospital_saas.renderDashboard(mainSection, stats);
    }).catch(function(err) {
        console.log("Dashboard error:", err);
        hospital_saas.renderDashboard(mainSection, {total_patients: 0, todays_appointments: 0, active_tokens: 0, active_ipd: 0});
    });
};

hospital_saas.renderDashboard = function(mainSection, stats) {
    const dashboardHTML = `
        <div class="hospital-dashboard">
            <div class="dashboard-header">
                <h1>Hospital Dashboard</h1>
                <p>Welcome back, ${frappe.session.user_fullname || frappe.session.user}!</p>
            </div>

            <div class="stats-grid">
                <div class="stat-card patients" onclick="hospital_saas.navigate('/app/patient')">
                    <div class="stat-icon">${hospital_saas.icons.patients}</div>
                    <div class="stat-content">
                        <div class="value">${stats.total_patients}</div>
                        <div class="label">Total Patients</div>
                    </div>
                </div>
                <div class="stat-card appointments" onclick="hospital_saas.navigate('/app/patient-appointment')">
                    <div class="stat-icon">${hospital_saas.icons.calendar}</div>
                    <div class="stat-content">
                        <div class="value">${stats.todays_appointments}</div>
                        <div class="label">Today's Appointments</div>
                    </div>
                </div>
                <div class="stat-card tokens" onclick="hospital_saas.showQueueDisplay()">
                    <div class="stat-icon">${hospital_saas.icons.opd}</div>
                    <div class="stat-content">
                        <div class="value">${stats.active_tokens}</div>
                        <div class="label">Active OPD Tokens</div>
                    </div>
                </div>
                <div class="stat-card ipd" onclick="hospital_saas.navigate('/app/ipd-admission')">
                    <div class="stat-icon">${hospital_saas.icons.ipd}</div>
                    <div class="stat-content">
                        <div class="value">${stats.active_ipd}</div>
                        <div class="label">IPD Admissions</div>
                    </div>
                </div>
            </div>

            <h3 class="section-title">Quick Actions</h3>
            <div class="quick-actions">
                <div class="quick-action-btn" onclick="hospital_saas.navigate('/app/patient/new-patient-1')">
                    ${hospital_saas.icons.patients}
                    <span>Register Patient</span>
                </div>
                <div class="quick-action-btn" onclick="hospital_saas.navigate('/app/opd-token/new-opd-token-1')">
                    ${hospital_saas.icons.opd}
                    <span>Generate Token</span>
                </div>
                <div class="quick-action-btn" onclick="hospital_saas.showQueueDisplay()">
                    ${hospital_saas.icons.queue}
                    <span>Queue Display</span>
                </div>
                <div class="quick-action-btn" onclick="hospital_saas.navigate('/app/patient-appointment/new-patient-appointment-1')">
                    ${hospital_saas.icons.calendar}
                    <span>Book Appointment</span>
                </div>
                <div class="quick-action-btn" onclick="hospital_saas.navigate('/app/ipd-admission/new-ipd-admission-1')">
                    ${hospital_saas.icons.ipd}
                    <span>IPD Admission</span>
                </div>
                <div class="quick-action-btn" onclick="hospital_saas.navigate('/app/sales-invoice/new-sales-invoice-1')">
                    ${hospital_saas.icons.billing}
                    <span>Create Invoice</span>
                </div>
            </div>
        </div>
    `;

    mainSection.html(dashboardHTML);
};

// ============================================
// QUEUE DISPLAY NAVIGATION (Opens as proper Frappe pages)
// ============================================

hospital_saas.showQueueDisplay = function() {
    // Navigate to the OPD Queue Display page
    frappe.set_route('opd-queue-display');
};

hospital_saas.showLabQueue = function() {
    // Navigate to the Lab Queue Display page
    frappe.set_route('lab-queue-display');
};

hospital_saas.showPharmacyQueue = function() {
    // Navigate to the Pharmacy Queue Display page
    frappe.set_route('pharmacy-queue-display');
};

hospital_saas.showRadiologyQueue = function() {
    // Navigate to the Radiology Queue Display page
    frappe.set_route('radiology-queue-display');
};

hospital_saas.toggleFullscreen = function() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
};

// ============================================
// REALTIME UPDATES
// ============================================

hospital_saas.initRealtime = function() {
    frappe.realtime.on('queue_update', function(data) {
        if ($('.modern-queue-container').length > 0) {
            hospital_saas.showQueueDisplay();
        }
        if (data && data.current_token) {
            frappe.show_alert({
                message: __('Now calling: Token {0}', [data.current_token]),
                indicator: 'green'
            }, 5);
        }
    });
};

// ============================================
// SVG ICONS
// ============================================

hospital_saas.icons = {
    hospital: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"/><path d="M12 7v4"/><path d="M10 9h4"/></svg>',
    patients: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    opd: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    ipd: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>',
    pharmacy: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/></svg>',
    lab: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v7.31"/><path d="M14 9.3V2"/><path d="M8.5 2h7"/><path d="M14 9.3a6.5 6.5 0 1 1-4 0"/><path d="M5.58 16.5h12.85"/></svg>',
    radiology: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>',
    billing: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    inventory: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>',
    staff: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 21a8 8 0 0 0-16 0"/><circle cx="10" cy="8" r="5"/><path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3"/></svg>',
    settings: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v10"/><path d="m14.3 6.7 4.2-4.2m-13 13 4.2-4.2m0-7.1L5.5 2.5m13 13-4.2-4.2"/></svg>',
    clinical: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
    queue: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>',
    calendar: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    chevron: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
    search: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    refresh: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>',
    back: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>',
    plus: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    fullscreen: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>',
    guide: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>'
};

// Expose to global namespace
frappe.hospital_saas = hospital_saas;
