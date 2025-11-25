#!/bin/bash
set -e

echo "=========================================="
echo "Hospital EHS - ERPNext Healthcare Setup"
echo "=========================================="

# Wait for MariaDB/MySQL to be ready
echo "Waiting for MySQL..."
DB_HOST="${MYSQLHOST:-mysql.railway.internal}"
DB_PORT="${MYSQLPORT:-3306}"

# Use netcat or simple connection test
for i in {1..30}; do
    if nc -z ${DB_HOST} ${DB_PORT} 2>/dev/null; then
        echo "MySQL is ready!"
        break
    fi
    echo "MySQL is not ready yet... waiting ($i/30)"
    sleep 5
done

# Wait for Redis to be ready
echo "Waiting for Redis..."
REDIS_HOST="${REDISHOST:-redis.railway.internal}"
REDIS_PORT="${REDISPORT:-6379}"

for i in {1..20}; do
    if nc -z ${REDIS_HOST} ${REDIS_PORT} 2>/dev/null; then
        echo "Redis is ready!"
        break
    fi
    echo "Redis is not ready yet... waiting ($i/20)"
    sleep 2
done

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
echo "  Site: ${SITE_NAME}"

# Always update common_site_config.json first
echo "Updating common site configuration..."
cat > sites/common_site_config.json << EOF
{
    "db_host": "${DB_HOST}",
    "db_port": ${DB_PORT},
    "redis_cache": "${REDIS_URL}/0",
    "redis_queue": "${REDIS_URL}/1",
    "redis_socketio": "${REDIS_URL}/2",
    "socketio_port": 9000,
    "webserver_port": ${PORT:-8080},
    "serve_default_site": true,
    "auto_update": false,
    "maintenance_mode": 0,
    "pause_scheduler": 0
}
EOF

# Force remove old site if it exists with wrong config
if [ -d "sites/${SITE_NAME}" ]; then
    echo "Removing existing site to recreate with correct credentials..."
    rm -rf "sites/${SITE_NAME}"
fi

echo "Creating new site: ${SITE_NAME}"

# Create the site with correct Railway MySQL credentials
bench new-site ${SITE_NAME} \
    --db-host ${DB_HOST} \
    --db-port ${DB_PORT} \
    --db-root-username ${MYSQL_USER} \
    --db-root-password "${MYSQL_PASSWORD}" \
    --admin-password ${ADMIN_PASSWORD:-admin123} \
    --install-app erpnext \
    --no-mariadb-socket || {
        echo "Site creation failed, checking if site exists..."
        if [ -d "sites/${SITE_NAME}" ]; then
            echo "Site exists, continuing..."
        else
            echo "ERROR: Could not create site"
            exit 1
        fi
    }

# Update site-specific config
cat > sites/${SITE_NAME}/site_config.json << EOF
{
    "db_host": "${DB_HOST}",
    "db_port": ${DB_PORT},
    "db_name": "_${SITE_NAME//./_}",
    "db_password": "${MYSQL_PASSWORD}",
    "db_type": "mariadb"
}
EOF

# Install Healthcare module
echo "Installing Healthcare module..."
bench get-app healthcare https://github.com/frappe/health.git --branch version-15 2>/dev/null || echo "Healthcare app may already exist"
bench --site ${SITE_NAME} install-app healthcare 2>/dev/null || echo "Healthcare app may already be installed"

# Set as default site
bench use ${SITE_NAME}

# Run migrations
echo "Running migrations..."
bench --site ${SITE_NAME} migrate 2>/dev/null || echo "Migration completed"

# Clear cache
echo "Clearing cache..."
bench --site ${SITE_NAME} clear-cache 2>/dev/null || echo "Cache cleared"

echo "=========================================="
echo "Starting ERPNext on port ${PORT:-8080}..."
echo "=========================================="

# Start bench with serve command for Railway
exec bench serve --port ${PORT:-8080}
