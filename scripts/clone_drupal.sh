#!/bin/bash
# Clone production Drupal DB + files into local Docker containers.
# Prerequisites:
#   - SSH key-based access to production server
#   - drupal_db and drupal containers running and healthy
#   - Add '127.0.0.1 drupal.local' to your hosts file
#   - Set env vars: DRUPAL_VPS_HOST, DRUPAL_VPS_USER, VPS_DB_PASS
set -e

# Required env vars
: "${DRUPAL_VPS_HOST:?Error: DRUPAL_VPS_HOST env var is required (e.g. 65.181.112.77)}"
: "${DRUPAL_VPS_USER:?Error: DRUPAL_VPS_USER env var is required (e.g. kevin)}"
: "${VPS_DB_PASS:?Error: VPS_DB_PASS env var is required}"

REMOTE="${DRUPAL_VPS_USER}@${DRUPAL_VPS_HOST}"
DB_CONTAINER="workstation-drupal-db"
DRUPAL_CONTAINER="workstation-drupal"

echo "==> Dumping production database and importing into local container..."
printf '%s\n' "$VPS_DB_PASS" | \
  ssh "$REMOTE" 'IFS= read -r MYSQL_PWD; export MYSQL_PWD; mariadb-dump -u drupal drupal' | \
  docker exec -i "$DB_CONTAINER" mariadb -u drupal -pdrupal drupal

echo "==> Syncing files directory from production..."
ssh "$REMOTE" "tar czf - -C /var/www/drupal/web/sites/default files" | \
  docker exec -i "$DRUPAL_CONTAINER" tar xzf - -C /opt/drupal/web/sites/default/

echo ""
echo "Done! Local Drupal mirror is ready."
echo ""
echo "If not already done, add this line to your hosts file:"
echo "  127.0.0.1 drupal.local"
echo ""
echo "  Windows: C:\\Windows\\System32\\drivers\\etc\\hosts"
echo "  Linux/Mac: /etc/hosts"
echo ""
echo "Browse: https://drupal.local"
