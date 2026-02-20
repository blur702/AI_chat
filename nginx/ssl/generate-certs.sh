#!/bin/bash
# =============================================================================
# SSL Certificate Generation Script
# =============================================================================
# Generates self-signed certificates for local development AND creates
# placeholder certificates at the Let's Encrypt path so nginx can start
# before running init-letsencrypt.sh.
#
# Usage:
#   cd nginx/ssl && ./generate-certs.sh
#
# After this, run init-letsencrypt.sh to obtain a real Let's Encrypt
# certificate for ssdd.kevinalthaus.com.
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CERT_FILE="${SCRIPT_DIR}/nginx-selfsigned.crt"
KEY_FILE="${SCRIPT_DIR}/nginx-selfsigned.key"
DOMAIN="ssdd.kevinalthaus.com"
LE_DIR="${SCRIPT_DIR}/../certbot/conf/live/${DOMAIN}"
CERTBOT_WWW="${SCRIPT_DIR}/../certbot/www"
VALIDITY_DAYS=365

if ! command -v openssl &> /dev/null; then
    echo "Error: OpenSSL is not installed."
    exit 1
fi

# --- Self-signed certificate for localhost ---
if [ -f "$CERT_FILE" ] && [ -f "$KEY_FILE" ]; then
    echo "Self-signed certs already exist. Regenerate? (y/N): "
    read -p "" -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Keeping existing self-signed certificates."
    else
        REGEN_SELFSIGNED=1
    fi
else
    REGEN_SELFSIGNED=1
fi

if [ "${REGEN_SELFSIGNED}" = "1" ]; then
    echo "Generating self-signed certificate for localhost..."
    openssl req -x509 -nodes -days ${VALIDITY_DAYS} -newkey rsa:2048 \
        -keyout "$KEY_FILE" \
        -out "$CERT_FILE" \
        -subj "/C=US/ST=Local/L=Local/O=Development/OU=AI Workstation/CN=localhost" \
        -addext "subjectAltName=DNS:localhost,DNS:*.localhost,IP:127.0.0.1,IP:::1"

    chmod 644 "$CERT_FILE"
    chmod 600 "$KEY_FILE"

    echo "  Certificate: $CERT_FILE"
    echo "  Private Key: $KEY_FILE"
    openssl x509 -in "$CERT_FILE" -noout -subject -dates
    echo ""
fi

# --- Placeholder certificate for Let's Encrypt path ---
# Nginx references this path for the ssdd.kevinalthaus.com server block.
# This dummy cert allows nginx to start before certbot obtains a real one.
if [ ! -f "${LE_DIR}/fullchain.pem" ]; then
    echo "Creating placeholder certificate for ${DOMAIN}..."
    mkdir -p "$LE_DIR"

    openssl req -x509 -nodes -days 1 -newkey rsa:2048 \
        -keyout "${LE_DIR}/privkey.pem" \
        -out "${LE_DIR}/fullchain.pem" \
        -subj "/CN=${DOMAIN}"

    chmod 644 "${LE_DIR}/fullchain.pem"
    chmod 600 "${LE_DIR}/privkey.pem"

    echo "  Placeholder cert created at: ${LE_DIR}/"
    echo ""
else
    echo "Let's Encrypt cert path already populated — skipping placeholder."
    echo ""
fi

# --- Create ACME challenge webroot ---
mkdir -p "$CERTBOT_WWW"

echo "Done! Next steps:"
echo "  1. docker-compose up -d"
echo "  2. Ensure DNS for ${DOMAIN} points to this machine"
echo "  3. Run: ./nginx/ssl/init-letsencrypt.sh"
