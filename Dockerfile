# Hospital EHS - ERPNext Healthcare
# Multi-Tenant Hospital Management SAAS

FROM frappe/erpnext:v15

LABEL maintainer="maanisingh <maanindersinghsidhu@gmail.com>"
LABEL description="MedicarePro Hospital Management System based on ERPNext Healthcare"

# Set environment variables
ENV FRAPPE_SITE_NAME_HEADER=hospital-ehs.railway.app
ENV WORKERS=2
ENV FRAPPE_PORT=8080

# Install Healthcare module
USER frappe
WORKDIR /home/frappe/frappe-bench

# The Healthcare app will be installed during site creation
# This is handled by the entrypoint script

# Expose ports
EXPOSE 8080 9000

# Default command
CMD ["bench", "start"]
