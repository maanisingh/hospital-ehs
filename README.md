# Hospital Management SAAS Platform

A comprehensive multi-tenant Hospital Management System built on Frappe Framework v15, ERPNext v15, and Healthcare module.

## Live URL

- **Production**: https://hospital.alexandratechlab.com
- **Admin Login**: Administrator / HospitalAdmin@2024

## Technology Stack

| Component | Technology |
|-----------|------------|
| Framework | Frappe Framework v15 |
| ERP | ERPNext v15 |
| Healthcare | ERPNext Healthcare Module |
| Custom App | hospital_saas |
| Database | MariaDB 10.6 |
| Cache | Redis 7 |
| Container | Docker & Docker Compose |
| Web Server | Nginx |
| SSL | Let's Encrypt |

## Quick Start

### Docker Deployment

```bash
# Clone repository
git clone https://github.com/maanisingh/hospital-ehs.git
cd hospital-ehs

# Start services
docker-compose up -d

# Wait for initialization (first time takes ~5 minutes)
docker-compose logs -f erpnext
```

### Manual Deployment

See [Installation Guide](docs/INSTALLATION.md) for manual deployment steps.

## Project Structure

```
hospital-ehs/
├── docker-compose.yml       # Docker Compose configuration
├── Dockerfile               # Custom ERPNext image with Healthcare
├── config/
│   └── common_site_config.json  # Frappe site configuration
├── scripts/
│   └── start.sh             # Container startup script
├── apps/
│   └── hospital_saas/       # Custom Frappe app
│       ├── hospital_saas/
│       │   ├── hooks.py     # Frappe hooks configuration
│       │   ├── boot.py      # Boot session info
│       │   ├── setup/       # Installation scripts
│       │   ├── tasks/       # Scheduled tasks
│       │   ├── config/      # Desktop configuration
│       │   └── modules/     # Feature modules
│       ├── setup.py
│       └── requirements.txt
└── docs/                    # Documentation
```

---

## Development Phases

### Phase 1: Multi-Tenant Infrastructure Setup ✅ COMPLETED
- [x] Docker Compose setup with MariaDB, Redis, ERPNext
- [x] Custom hospital_saas Frappe app structure
- [x] Nginx reverse proxy with SSL
- [x] Multi-tenant configuration
- [x] Healthcare module integration

### Phase 2: Core DocTypes & Top Navigation UI ✅ COMPLETED
- [x] Hospital DocType (multi-tenant with code H101, H102)
- [x] Department DocType
- [x] Hospital SAAS Settings
- [x] **Top Navigation Bar** (Patients, OPD, IPD, Pharmacy, Clinical, Radiology, Billing, Setup)
- [x] Hospital Dashboard with Stats
- [x] Quick Actions (Register Patient, Generate Token, etc.)
- [x] Role-based permissions

### Phase 3: OPD Module ✅ COMPLETED
- [x] OPD Token DocType with daily auto-numbering
- [x] OPD Queue Display (real-time)
- [x] Patient Appointment integration
- [x] Patient Encounter (Consultation)
- [x] Token status workflow (Waiting → Called → In Progress → Completed)
- [x] Realtime queue updates

### Phase 4: IPD Module ✅ COMPLETED
- [x] IPD Admission DocType
- [x] Bed/Ward management (Healthcare Service Unit)
- [x] Admission workflow
- [x] Integration with ERPNext Inpatient Record

### Phase 5: Radiology Module ✅ COMPLETED
- [x] Radiology Order DocType
- [x] Radiology Result DocType
- [x] Radiology Examination Type
- [x] Radiology Image attachments
- [x] Radiology Queue Display
- [x] Radiology Reports

### Phase 6: Pharmacy Module ✅ COMPLETED
- [x] Pharmacy DocType
- [x] Pharmacy Prescription DocType
- [x] Medication Dispensing
- [x] Prescription Items
- [x] Pharmacy Queue Display
- [x] Integration with ERPNext Stock

---

### Phase 7: Hospital DocType Enhancement 🔶 IN PROGRESS
**Add missing fields per original requirements:**

- [ ] Owner Information Section
  - Owner Name
  - Owner Email
  - Owner Mobile Number
- [ ] Social Media Section
  - Facebook URL
  - Instagram URL
  - YouTube URL
  - Twitter URL
  - LinkedIn URL
- [ ] Branding Section
  - Dashboard Footer Text
  - Helpline Number
- [ ] Organisation Code auto-generation (H101, H102, H103...)

### Phase 8: Super Admin Dashboard 🔶 PENDING
**Central management for all hospitals:**

- [ ] Super Admin Workspace
- [ ] All Hospitals Overview (list with status)
- [ ] Create New Hospital Wizard
- [ ] Hospital Analytics (patients, revenue per hospital)
- [ ] Subscription Management
  - Payment status tracking
  - Expiry alerts
  - Plan upgrades
- [ ] System-wide Reports

### Phase 9: User Management per Hospital 🔶 PENDING
**Role-based user creation linked to hospital:**

- [ ] User creation form with hospital selection
- [ ] Roles per hospital:
  - Hospital Administrator
  - Reception
  - Doctor
  - Nurse
  - Lab Technician
  - Radiology Technician
  - Pharmacist
  - Billing/Accounts
  - Staff
- [ ] User-Hospital mapping
- [ ] Permission isolation (users see only their hospital data)

### Phase 10: Lab/Pathology Module 🔶 PENDING
**Complete lab workflow:**

- [ ] Lab Test Templates configuration
- [ ] Lab Test Order from Doctor Consultation
- [ ] Sample Collection tracking
- [ ] Lab Results Entry form
- [ ] Lab Report Print format
- [ ] Lab Queue Display
- [ ] Lab → Billing integration (payment check before test)

### Phase 11: Billing & Payment Workflow 🔶 PENDING
**Payment status integration:**

- [ ] OPD Billing (consultation charges)
- [ ] Lab Test Billing
- [ ] Radiology Billing
- [ ] Pharmacy Billing
- [ ] Payment Status on all documents (Paid/Unpaid)
- [ ] Payment Receipt Print with status
- [ ] Outstanding Payments Dashboard
- [ ] Payment Mode tracking (Cash/Card/UPI)

### Phase 12: Doctor Consultation Flow 🔶 PENDING
**Complete OPD consultation workflow:**

- [ ] Symptoms entry
- [ ] Diagnosis entry
- [ ] Vitals recording
- [ ] Lab Test ordering (auto-show in Lab module)
- [ ] Radiology ordering
- [ ] Final Prescription generation
- [ ] Prescription → Pharmacy Queue

### Phase 13: Accounts Module 🔶 PENDING
**Financial reporting:**

- [ ] Daily Revenue Report
- [ ] Monthly Revenue Report
- [ ] Department-wise Revenue
- [ ] Doctor-wise Revenue
- [ ] Expense Tracking
- [ ] Profit/Loss Summary
- [ ] Outstanding Collections

### Phase 14: Inventory & Expiry Management 🔶 PENDING
**Medicine stock with alerts:**

- [ ] Medicine Stock Dashboard
- [ ] Expiry Date tracking
- [ ] Expiry Alerts (30/15/7 days before)
- [ ] Low Stock Alerts
- [ ] Auto-reorder suggestions
- [ ] Stock Adjustment
- [ ] Purchase Order integration

### Phase 15: Public Patient Portal 🔶 PENDING
**Online booking for patients:**

- [ ] Hospital Selection Page (list all active hospitals)
- [ ] Online OPD Booking Form
- [ ] Appointment Confirmation (SMS/Email)
- [ ] My Appointments view
- [ ] Queue Status check
- [ ] Lab Reports download
- [ ] Radiology Reports download

### Phase 16: Reports & Analytics 🔶 PENDING
**Comprehensive reporting:**

- [ ] Patient Reports (registrations, visits)
- [ ] OPD Reports (daily, monthly)
- [ ] IPD Reports (admissions, discharges)
- [ ] Lab Reports (tests conducted)
- [ ] Radiology Reports
- [ ] Revenue Reports
- [ ] Custom Report Builder

### Phase 17: Notifications & Reminders 🔶 PENDING
**SMS/Email integration:**

- [ ] Appointment Reminders
- [ ] OPD Token SMS
- [ ] Lab Report Ready notification
- [ ] Payment Due reminders
- [ ] Subscription Expiry alerts (for Super Admin)

### Phase 18: Testing & QA 🔶 PENDING
- [ ] Unit tests for custom DocTypes
- [ ] Integration tests for workflows
- [ ] Performance testing
- [ ] Security audit
- [ ] Multi-tenant isolation testing

### Phase 19: Documentation 🔶 PENDING
- [ ] User Manual (PDF)
- [ ] Admin Guide
- [ ] API Documentation
- [ ] Video Tutorials
- [ ] Deployment Guide

### Phase 20: Production Optimization 🔶 PENDING
- [ ] Performance tuning
- [ ] Backup automation
- [ ] Monitoring setup (uptime, errors)
- [ ] SSL auto-renewal
- [ ] Go-live checklist

---

## Module Summary

| Module | Status | DocTypes |
|--------|--------|----------|
| Infrastructure | ✅ Done | Docker, Nginx, SSL |
| Hospital (Multi-tenant) | ✅ Done | Hospital, Department, Settings |
| OPD | ✅ Done | OPD Token, Queue Display |
| IPD | ✅ Done | IPD Admission |
| Radiology | ✅ Done | Order, Result, Exam Type, Images, Queue |
| Pharmacy | ✅ Done | Pharmacy, Prescription, Dispensing, Queue |
| Top Navigation UI | ✅ Done | Custom navbar with dropdowns |
| Dashboard | ✅ Done | Stats, Quick Actions, Recent Patients |
| Hospital Enhancement | 🔶 Next | Owner, Social Media, Footer |
| Super Admin | 🔶 Pending | Multi-hospital management |
| User Management | 🔶 Pending | Role-based per hospital |
| Lab/Pathology | 🔶 Pending | Tests, Results, Queue |
| Billing Workflow | 🔶 Pending | Payment status integration |
| Doctor Flow | 🔶 Pending | Symptoms, Diagnosis, Prescription |
| Accounts | 🔶 Pending | Revenue, Expenses, P&L |
| Inventory | 🔶 Pending | Expiry alerts, Low stock |
| Patient Portal | 🔶 Pending | Online booking |
| Reports | 🔶 Pending | Analytics dashboard |
| Notifications | 🔶 Pending | SMS/Email alerts |

---

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## License

MIT License - see [LICENSE](LICENSE) file

## Author

**Alexandra Tech Lab**
- Email: maanindersinghsidhu@gmail.com
- GitHub: [@maanisingh](https://github.com/maanisingh)
