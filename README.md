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

## Development Phases

### Phase 1: Multi-Tenant Infrastructure Setup ✅
- Docker Compose setup with MariaDB, Redis, ERPNext
- Custom hospital_saas Frappe app structure
- Nginx reverse proxy with SSL
- Multi-tenant configuration

### Phase 2: Core DocTypes & Database Design
- Hospital/Clinic DocType
- Department DocType
- Custom Patient fields
- Healthcare Practitioner extensions

### Phase 3: Patient Management Module
- Patient registration
- Medical history
- Document uploads
- Patient portal

### Phase 4: Appointment System
- Online booking
- Calendar management
- SMS/Email reminders
- Queue management

### Phase 5: Billing Integration
- Invoice generation
- Payment processing
- Insurance claims
- Multi-currency support

### Phase 6: Inventory Management
- Medicine stock
- Equipment tracking
- Auto-reorder
- Expiry alerts

### Phase 7: Reports & Dashboard
- Real-time analytics
- Custom reports
- Data export
- Scheduled reports

### Phase 8: API Development
- REST API endpoints
- Webhook support
- Third-party integrations
- API documentation

### Phase 9: Mobile Responsive UI
- Responsive design
- PWA support
- Mobile-optimized workflows

### Phase 10: Testing & QA
- Unit tests
- Integration tests
- Performance testing
- Security audit

### Phase 11: Documentation
- User manual
- API documentation
- Deployment guide
- Video tutorials

### Phase 12: Production Deployment
- Production optimization
- Backup strategy
- Monitoring setup
- Go-live checklist

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
