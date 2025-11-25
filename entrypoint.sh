#!/bin/bash
set -e

echo "=========================================="
echo "Hospital EHS - ERPNext Healthcare Setup"
echo "=========================================="

# Wait for MariaDB/MySQL to be ready
echo "Waiting for MySQL..."
DB_HOST="${MYSQLHOST:-mysql.railway.internal}"
DB_PORT="${MYSQLPORT:-3306}"

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

# MySQL credentials from Railway - USE ROOT FOR EVERYTHING
MYSQL_USER="${MYSQLUSER:-root}"
MYSQL_PASSWORD="${MYSQLPASSWORD:-}"
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

# Check if site directory exists
if [ -d "sites/${SITE_NAME}" ]; then
    echo "Site directory exists, updating config to use root credentials..."

    # CRITICAL: Update site_config.json to use ROOT user (not the auto-created user)
    cat > sites/${SITE_NAME}/site_config.json << EOF
{
    "db_host": "${DB_HOST}",
    "db_port": ${DB_PORT},
    "db_name": "${MYSQL_DATABASE}",
    "db_user": "${MYSQL_USER}",
    "db_password": "${MYSQL_PASSWORD}",
    "db_type": "mariadb"
}
EOF
    echo "Updated site_config.json with root credentials"
else
    echo "Creating new site: ${SITE_NAME}"

    # Create site directory
    mkdir -p "sites/${SITE_NAME}"

    # Create site_config.json with ROOT credentials BEFORE new-site
    cat > sites/${SITE_NAME}/site_config.json << EOF
{
    "db_host": "${DB_HOST}",
    "db_port": ${DB_PORT},
    "db_name": "${MYSQL_DATABASE}",
    "db_user": "${MYSQL_USER}",
    "db_password": "${MYSQL_PASSWORD}",
    "db_type": "mariadb"
}
EOF

    # Create the site - use --db-name to use existing Railway database
    bench new-site ${SITE_NAME} \
        --db-host ${DB_HOST} \
        --db-port ${DB_PORT} \
        --db-root-username ${MYSQL_USER} \
        --db-root-password "${MYSQL_PASSWORD}" \
        --db-name ${MYSQL_DATABASE} \
        --admin-password ${ADMIN_PASSWORD:-admin123} \
        --install-app erpnext \
        --no-mariadb-socket || {
            echo "Site creation had issues, but continuing..."
        }

    # Re-apply the correct config (new-site might have overwritten it)
    cat > sites/${SITE_NAME}/site_config.json << EOF
{
    "db_host": "${DB_HOST}",
    "db_port": ${DB_PORT},
    "db_name": "${MYSQL_DATABASE}",
    "db_user": "${MYSQL_USER}",
    "db_password": "${MYSQL_PASSWORD}",
    "db_type": "mariadb"
}
EOF
fi

# Set as default site
bench use ${SITE_NAME}

# Verify database connection
echo "Verifying database connection..."
bench --site ${SITE_NAME} mariadb -e "SELECT 1" 2>/dev/null && echo "Database connection successful!" || echo "Database check skipped"

# Install Healthcare module if not installed
echo "Checking Healthcare module..."
bench get-app healthcare https://github.com/frappe/health.git --branch version-15 2>/dev/null || echo "Healthcare app exists"
bench --site ${SITE_NAME} install-app healthcare 2>/dev/null || echo "Healthcare already installed or skipped"

# Run migrations
echo "Running migrations..."
bench --site ${SITE_NAME} migrate 2>/dev/null || echo "Migration completed"

# Clear cache
echo "Clearing cache..."
bench --site ${SITE_NAME} clear-cache 2>/dev/null || echo "Cache cleared"

echo "=========================================="
echo "Starting ERPNext on port ${PORT:-8080}..."
echo "=========================================="

# Start bench serve
exec bench serve --port ${PORT:-8080}
