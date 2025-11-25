# Hospital EHS - MedicarePro

Multi-Tenant Hospital Management SAAS System built on ERPNext Healthcare.

## Features

- **Multi-Tenant Architecture**: Each hospital is isolated with unique organization code (H101, H102, etc.)
- **OPD Management**: Token-based queue system with real-time updates
- **IPD Management**: Bed management, admissions, nursing notes
- **Laboratory**: Pathology and Radiology with result entry
- **Pharmacy**: Medicine inventory, prescription dispensing
- **Billing**: Integrated billing across all modules
- **Inventory**: Purchase orders, vendor management

## User Roles

1. **Superadmin** - Multi-tenant management
2. **Hospital Admin** - Hospital-level administration
3. **Reception** - Patient registration, OPD tokens
4. **Doctor** - Consultations, prescriptions
5. **Nurse** - IPD care, nursing notes
6. **Lab Technician** - Pathology tests
7. **Radiology Technician** - Imaging tests
8. **Pharmacist** - Medicine dispensing
9. **Billing Staff** - Invoices, payments
10. **Inventory Staff** - Stock management

## Technology Stack

- **Base**: Frappe Framework + ERPNext v15
- **Healthcare**: ERPNext Healthcare Module
- **Database**: MariaDB 10.6
- **Cache**: Redis
- **Deployment**: Railway (Docker)

## Local Development

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f erpnext

# Stop services
docker-compose down
```

## Railway Deployment

```bash
# Link project
railway link -p 52b65705-5428-4dad-841e-09614417dbc1

# Deploy
railway up

# Open in browser
railway open
```

## Environment Variables

See `.env.example` for required variables.

## License

Proprietary - All rights reserved.

## Support

Contact: maanindersinghsidhu@gmail.com
