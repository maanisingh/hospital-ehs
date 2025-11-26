FROM frappe/erpnext:v15

# Set user to root for installations
USER root

# Install additional dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Switch back to frappe user
USER frappe
WORKDIR /home/frappe/frappe-bench

# Get Healthcare app
RUN bench get-app healthcare --branch version-15 || true

# Create sites directory structure
RUN mkdir -p /home/frappe/frappe-bench/sites/hospital.local

# Copy custom common_site_config
COPY --chown=frappe:frappe config/common_site_config.json /home/frappe/frappe-bench/sites/common_site_config.json

# Copy startup script
COPY --chown=frappe:frappe scripts/start.sh /home/frappe/start.sh
RUN chmod +x /home/frappe/start.sh

# Expose ports
EXPOSE 8000 9000

# Start command
CMD ["/home/frappe/start.sh"]
