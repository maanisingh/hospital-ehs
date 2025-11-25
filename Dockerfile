# Hospital EHS - ERPNext Healthcare
# Multi-Tenant Hospital Management SAAS

FROM frappe/erpnext:v15

LABEL maintainer="maanisingh <maanindersinghsidhu@gmail.com>"
LABEL description="MedicarePro Hospital Management System based on ERPNext Healthcare"

USER root

# Install additional dependencies
RUN apt-get update && apt-get install -y \
    netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER frappe
WORKDIR /home/frappe/frappe-bench

# Environment variables (will be overridden by Railway)
ENV FRAPPE_SITE_NAME_HEADER=hospital-ehs.railway.app
ENV WORKERS=2
ENV FRAPPE_PORT=8080

# Expose ports
EXPOSE 8080 9000

# Use custom entrypoint
ENTRYPOINT ["/entrypoint.sh"]
CMD ["bench", "start"]
