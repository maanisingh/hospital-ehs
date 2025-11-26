# Hospital SAAS

Multi-Tenant Hospital Management SAAS Platform built on Frappe Framework v15 with ERPNext v15 and Healthcare module integration.

## Features

- **Multi-Tenant Architecture**: Manage multiple hospitals from a single installation
- **Patient Management**: Complete patient records with medical history
- **Appointment System**: Online booking with real-time availability
- **Billing System**: Integrated billing with insurance support
- **Inventory Management**: Track medical supplies and equipment
- **Healthcare Integration**: Full ERPNext Healthcare module support
- **Reports & Analytics**: Comprehensive reporting dashboard

## Technology Stack

- **Framework**: Frappe Framework v15
- **ERP**: ERPNext v15
- **Healthcare**: ERPNext Healthcare Module
- **Database**: MariaDB 10.6
- **Cache**: Redis 7
- **Frontend**: Vue.js (Frappe UI)

## Installation

### Prerequisites

- Frappe Bench
- MariaDB 10.6+
- Redis 7+
- Node.js 18+
- Python 3.10+

### Install via Bench

```bash
# Get the app
bench get-app hospital_saas https://github.com/maanisingh/hospital-ehs

# Install on site
bench --site your-site.local install-app hospital_saas
```

### Docker Installation

```bash
# Clone the repository
git clone https://github.com/maanisingh/hospital-ehs.git
cd hospital-ehs

# Start with Docker Compose
docker-compose up -d
```

## Modules

1. **Hospital SAAS Core** - Core functionality and settings
2. **Tenant Management** - Multi-tenant configuration
3. **Patient Management** - Patient records and history
4. **Appointment System** - Scheduling and booking
5. **Billing System** - Invoicing and payments
6. **Inventory Management** - Stock and supplies
7. **Reports** - Analytics and reporting
8. **Settings** - System configuration

## Development Phases

- [x] Phase 1: Multi-Tenant Infrastructure Setup
- [ ] Phase 2: Core DocTypes & Database Design
- [ ] Phase 3: Patient Management Module
- [ ] Phase 4: Appointment System
- [ ] Phase 5: Billing Integration
- [ ] Phase 6: Inventory Management
- [ ] Phase 7: Reports & Dashboard
- [ ] Phase 8: API Development
- [ ] Phase 9: Mobile Responsive UI
- [ ] Phase 10: Testing & QA
- [ ] Phase 11: Documentation
- [ ] Phase 12: Production Deployment

## License

MIT License

## Author

Alexandra Tech Lab
Email: maanindersinghsidhu@gmail.com
GitHub: [@maanisingh](https://github.com/maanisingh)
