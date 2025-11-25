#!/bin/bash
set -e

echo "=========================================="
echo "Hospital EHS - ERPNext Healthcare Setup"
echo "=========================================="

# Wait for MariaDB to be ready
echo "Waiting for MariaDB..."
while ! nc -z ${DB_HOST:-mariadb} ${DB_PORT:-3306}; do
    echo "MariaDB is not ready yet... waiting"
    sleep 5
done
echo "MariaDB is ready!"

# Wait for Redis to be ready
echo "Waiting for Redis..."
while ! nc -z ${REDIS_HOST:-redis} ${REDIS_PORT:-6379}; do
    echo "Redis is not ready yet... waiting"
    sleep 2
done
echo "Redis is ready!"

cd /home/frappe/frappe-bench

# Site name from environment or default
SITE_NAME="${SITE_NAME:-hospital.local}"

# Check if site exists
if [ ! -d "sites/${SITE_NAME}" ]; then
    echo "Creating new site: ${SITE_NAME}"

    # Create site configuration
    cat > sites/common_site_config.json << EOF
{
    "db_host": "${DB_HOST:-mariadb}",
    "db_port": ${DB_PORT:-3306},
    "redis_cache": "redis://${REDIS_HOST:-redis}:${REDIS_PORT:-6379}/0",
    "redis_queue": "redis://${REDIS_HOST:-redis}:${REDIS_PORT:-6379}/1",
    "redis_socketio": "redis://${REDIS_HOST:-redis}:${REDIS_PORT:-6379}/2",
    "socketio_port": 9000,
    "webserver_port": 8080,
    "serve_default_site": true,
    "auto_update": false,
    "maintenance_mode": 0,
    "pause_scheduler": 0
}
EOF

    # Create the site
    bench new-site ${SITE_NAME} \
        --db-host ${DB_HOST:-mariadb} \
        --db-port ${DB_PORT:-3306} \
        --db-root-username ${DB_USER:-root} \
        --db-root-password ${DB_ROOT_PASSWORD:-admin123} \
        --admin-password ${ADMIN_PASSWORD:-admin123} \
        --install-app erpnext \
        --no-mariadb-socket

    # Install Healthcare module
    echo "Installing Healthcare module..."
    bench get-app healthcare https://github.com/frappe/health.git --branch version-15 || true
    bench --site ${SITE_NAME} install-app healthcare || true

    # Set as default site
    bench use ${SITE_NAME}

    echo "Site ${SITE_NAME} created successfully!"
else
    echo "Site ${SITE_NAME} already exists"

    # Update site config for Railway
    cat > sites/common_site_config.json << EOF
{
    "db_host": "${DB_HOST:-mariadb}",
    "db_port": ${DB_PORT:-3306},
    "redis_cache": "redis://${REDIS_HOST:-redis}:${REDIS_PORT:-6379}/0",
    "redis_queue": "redis://${REDIS_HOST:-redis}:${REDIS_PORT:-6379}/1",
    "redis_socketio": "redis://${REDIS_HOST:-redis}:${REDIS_PORT:-6379}/2",
    "socketio_port": 9000,
    "webserver_port": 8080,
    "serve_default_site": true
}
EOF
fi

# Run migrations
echo "Running migrations..."
bench --site ${SITE_NAME} migrate || true

# Clear cache
echo "Clearing cache..."
bench --site ${SITE_NAME} clear-cache || true

echo "=========================================="
echo "Starting ERPNext..."
echo "=========================================="

# Execute the main command
exec "$@"
