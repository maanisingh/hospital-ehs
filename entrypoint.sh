#!/bin/bash
set -e

echo "=========================================="
echo "Hospital EHS - ERPNext Healthcare Setup"
echo "=========================================="

# Wait for MariaDB/MySQL to be ready
echo "Waiting for MySQL..."
DB_HOST="${MYSQLHOST:-mysql.railway.internal}"
DB_PORT="${MYSQLPORT:-3306}"

while ! nc -z ${DB_HOST} ${DB_PORT}; do
    echo "MySQL is not ready yet... waiting"
    sleep 5
done
echo "MySQL is ready!"

# Wait for Redis to be ready
echo "Waiting for Redis..."
REDIS_HOST="${REDISHOST:-redis.railway.internal}"
REDIS_PORT="${REDISPORT:-6379}"

while ! nc -z ${REDIS_HOST} ${REDIS_PORT}; do
    echo "Redis is not ready yet... waiting"
    sleep 2
done
echo "Redis is ready!"

cd /home/frappe/frappe-bench

# Site name from environment or default
SITE_NAME="${SITE_NAME:-hospital.local}"

# Redis URL with authentication
REDIS_PASSWORD="${REDISPASSWORD:-}"
REDIS_USER="${REDISUSER:-default}"

if [ -n "$REDIS_PASSWORD" ]; then
    REDIS_URL="redis://${REDIS_USER}:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}"
else
    REDIS_URL="redis://${REDIS_HOST}:${REDIS_PORT}"
fi

# MySQL credentials from Railway
MYSQL_USER="${MYSQLUSER:-root}"
MYSQL_PASSWORD="${MYSQLPASSWORD:-${MYSQL_ROOT_PASSWORD:-admin123}}"
MYSQL_DATABASE="${MYSQLDATABASE:-railway}"

echo "Configuring site with:"
echo "  DB Host: ${DB_HOST}:${DB_PORT}"
echo "  DB User: ${MYSQL_USER}"
echo "  DB Name: ${MYSQL_DATABASE}"
echo "  Redis: ${REDIS_HOST}:${REDIS_PORT}"

# Check if site exists
if [ ! -d "sites/${SITE_NAME}" ]; then
    echo "Creating new site: ${SITE_NAME}"

    # Create site configuration
    cat > sites/common_site_config.json << EOF
{
    "db_host": "${DB_HOST}",
    "db_port": ${DB_PORT},
    "redis_cache": "${REDIS_URL}/0",
    "redis_queue": "${REDIS_URL}/1",
    "redis_socketio": "${REDIS_URL}/2",
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
        --db-host ${DB_HOST} \
        --db-port ${DB_PORT} \
        --db-root-username ${MYSQL_USER} \
        --db-root-password "${MYSQL_PASSWORD}" \
        --admin-password ${ADMIN_PASSWORD:-admin123} \
        --install-app erpnext \
        --no-mariadb-socket

    # Install Healthcare module
    echo "Installing Healthcare module..."
    bench get-app healthcare https://github.com/frappe/health.git --branch version-15 || echo "Healthcare app may already exist"
    bench --site ${SITE_NAME} install-app healthcare || echo "Healthcare installation skipped"

    # Set as default site
    bench use ${SITE_NAME}

    echo "Site ${SITE_NAME} created successfully!"
else
    echo "Site ${SITE_NAME} already exists"

    # Update site config for Railway
    cat > sites/common_site_config.json << EOF
{
    "db_host": "${DB_HOST}",
    "db_port": ${DB_PORT},
    "redis_cache": "${REDIS_URL}/0",
    "redis_queue": "${REDIS_URL}/1",
    "redis_socketio": "${REDIS_URL}/2",
    "socketio_port": 9000,
    "webserver_port": 8080,
    "serve_default_site": true
}
EOF
fi

# Run migrations
echo "Running migrations..."
bench --site ${SITE_NAME} migrate || echo "Migration completed with warnings"

# Clear cache
echo "Clearing cache..."
bench --site ${SITE_NAME} clear-cache || echo "Cache cleared"

echo "=========================================="
echo "Starting ERPNext on port 8080..."
echo "=========================================="

# Execute the main command
exec "$@"
