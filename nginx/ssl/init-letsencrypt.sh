#!/bin/bash
# =============================================================================
# Let's Encrypt Certificate Initialization
# =============================================================================
# Obtains a real Let's Encrypt certificate for ssdd.kevinalthaus.com.
#
# Prerequisites:
#   1. DNS A record for ssdd.kevinalthaus.com pointing to this machine's IP
#   2. Port 80 open and reachable from the internet
#   3. Docker and docker-compose running
#   4. Run generate-certs.sh first (creates placeholder certs so nginx starts)
#
# Usage (from project root):
#   ./nginx/ssl/init-letsencrypt.sh
#
# Set LETSENCRYPT_EMAIL env var or pass as argument:
#   LETSENCRYPT_EMAIL=you@example.com ./nginx/ssl/init-letsencrypt.sh
#   ./nginx/ssl/init-letsencrypt.sh you@example.com
# =============================================================================

set -e

DOMAIN="ssdd.kevinalthaus.com"
EMAIL="${LETSENCRYPT_EMAIL:-${1:-}}"
STAGING="${LETSENCRYPT_STAGING:-0}"  # Set to 1 for testing against staging server
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DATA_PATH="${PROJECT_ROOT}/nginx/certbot/conf"
WWW_PATH="${PROJECT_ROOT}/nginx/certbot/www"

cd "$PROJECT_ROOT"

if [ -z "$EMAIL" ]; then
    echo "Error: Email address required for Let's Encrypt registration."
    echo ""
    echo "Usage:"
    echo "  LETSENCRYPT_EMAIL=you@example.com ./nginx/ssl/init-letsencrypt.sh"
    echo "  ./nginx/ssl/init-letsencrypt.sh you@example.com"
    exit 1
fi

echo "============================================"
echo "Let's Encrypt Certificate Setup"
echo "============================================"
echo "  Domain: ${DOMAIN}"
echo "  Email:  ${EMAIL}"
echo "  Staging: $([ "$STAGING" = "1" ] && echo "YES (test mode)" || echo "no (production)")"
echo ""

# Confirm
read -p "Continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

# Create directories
mkdir -p "$DATA_PATH" "$WWW_PATH"

# Step 1: Remove placeholder/old certificate
echo ""
echo ">>> Removing existing certificate for ${DOMAIN}..."
docker-compose run --rm --entrypoint "\
  rm -Rf /etc/letsencrypt/live/${DOMAIN} && \
  rm -Rf /etc/letsencrypt/archive/${DOMAIN} && \
  rm -Rf /etc/letsencrypt/renewal/${DOMAIN}.conf" certbot 2>/dev/null || true

# Step 2: Create a fresh placeholder so nginx can start/reload
echo ""
echo ">>> Creating temporary certificate..."
mkdir -p "${DATA_PATH}/live/${DOMAIN}"
docker-compose run --rm --entrypoint "\
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout /etc/letsencrypt/live/${DOMAIN}/privkey.pem \
    -out /etc/letsencrypt/live/${DOMAIN}/fullchain.pem \
    -subj '/CN=${DOMAIN}'" certbot

# Step 3: Start/reload nginx with the temporary cert
echo ""
echo ">>> Starting nginx..."
docker-compose up --force-recreate -d nginx
echo "Waiting for nginx to start..."
sleep 5

# Step 4: Remove the temporary certificate
echo ""
echo ">>> Removing temporary certificate..."
docker-compose run --rm --entrypoint "\
  rm -Rf /etc/letsencrypt/live/${DOMAIN} && \
  rm -Rf /etc/letsencrypt/archive/${DOMAIN} && \
  rm -Rf /etc/letsencrypt/renewal/${DOMAIN}.conf" certbot

# Step 5: Request the real certificate
echo ""
echo ">>> Requesting Let's Encrypt certificate for ${DOMAIN}..."

STAGING_ARG=""
if [ "$STAGING" = "1" ]; then
    STAGING_ARG="--staging"
fi

docker-compose run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    ${STAGING_ARG} \
    --email ${EMAIL} \
    -d ${DOMAIN} \
    --rsa-key-size 4096 \
    --agree-tos \
    --no-eff-email \
    --force-renewal" certbot

# Step 6: Reload nginx with the real certificate
echo ""
echo ">>> Reloading nginx with new certificate..."
docker-compose exec nginx nginx -s reload

echo ""
echo "============================================"
echo "Let's Encrypt certificate installed!"
echo "============================================"
echo ""
echo "  https://${DOMAIN} is now secured with a valid certificate."
echo "  Certificate auto-renewal is handled by the certbot container."
echo ""
echo "  To test renewal: docker-compose run --rm certbot renew --dry-run"
