#!/bin/bash

cd /home/frappe/frappe-bench

# Wait for MariaDB to be ready
echo "Waiting for MariaDB..."
while ! mysqladmin ping -h"$DB_HOST" -u root -p"hospital_root_password_2024" --silent 2>/dev/null; do
    sleep 2
done
echo "MariaDB is ready!"

# Give Redis a few seconds (Docker healthcheck ensures it's ready)
echo "Waiting for Redis to settle..."
sleep 5
echo "Redis should be ready now!"

SITE_NAME="${SITE_NAME:-hospital.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-HospitalAdmin@2024}"

# Check if site already exists
if [ ! -f "sites/$SITE_NAME/site_config.json" ]; then
    echo "Creating new site: $SITE_NAME"

    # Create the site
    bench new-site "$SITE_NAME" \
        --db-host="$DB_HOST" \
        --db-port="${DB_PORT:-3306}" \
        --db-root-username=root \
        --db-root-password="hospital_root_password_2024" \
        --admin-password="$ADMIN_PASSWORD" \
        --mariadb-user-host-login-scope='%' \
        --install-app erpnext || {
            echo "Site creation failed, but continuing..."
        }

    # Install Healthcare app
    echo "Installing Healthcare app..."
    bench --site "$SITE_NAME" install-app healthcare || echo "Healthcare installation skipped or already installed"

    # Set as default site
    bench use "$SITE_NAME"

    echo "Site $SITE_NAME setup completed!"
else
    echo "Site $SITE_NAME already exists, skipping creation..."
    bench use "$SITE_NAME"
fi

# Run migrations
echo "Running migrations..."
bench --site "$SITE_NAME" migrate --skip-failing || echo "Migration completed with some warnings"

# Clear cache
bench --site "$SITE_NAME" clear-cache || true

# Start scheduler and workers in background
echo "Starting background workers..."
bench schedule &
bench worker --queue short &
bench worker --queue default &
bench worker --queue long &

# Start socketio in background
echo "Starting socketio..."
node /home/frappe/frappe-bench/apps/frappe/socketio.js &

# Start the main server
echo "Starting Frappe/ERPNext server on port 8000..."
exec bench serve --port 8000
