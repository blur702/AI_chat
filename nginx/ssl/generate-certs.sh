#!/bin/bash
# =============================================================================
# SSL Certificate Generation Script for Development
# =============================================================================
# This script generates self-signed SSL certificates for local development.
# The certificates are NOT suitable for production use.
#
# Usage:
#   cd nginx/ssl && ./generate-certs.sh
#
# Generated files:
#   - nginx-selfsigned.crt  (SSL certificate)
#   - nginx-selfsigned.key  (Private key)
#
# Note: Browsers will display a security warning for self-signed certificates.
# This is expected behavior in development environments.
# =============================================================================

set -e

CERT_DIR="$(cd "$(dirname "$0")" && pwd)"
CERT_FILE="${CERT_DIR}/nginx-selfsigned.crt"
KEY_FILE="${CERT_DIR}/nginx-selfsigned.key"

# Certificate validity in days
VALIDITY_DAYS=365

# Check if OpenSSL is installed
if ! command -v openssl &> /dev/null; then
    echo "Error: OpenSSL is not installed. Please install OpenSSL and try again."
    exit 1
fi

# Check if certificates already exist
if [ -f "$CERT_FILE" ] && [ -f "$KEY_FILE" ]; then
    echo "SSL certificates already exist:"
    echo "  - $CERT_FILE"
    echo "  - $KEY_FILE"
    read -p "Do you want to regenerate them? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Keeping existing certificates."
        exit 0
    fi
fi

echo "Generating self-signed SSL certificate..."

# Generate self-signed certificate with SAN (Subject Alternative Names)
openssl req -x509 -nodes -days ${VALIDITY_DAYS} -newkey rsa:2048 \
    -keyout "$KEY_FILE" \
    -out "$CERT_FILE" \
    -subj "/C=US/ST=Local/L=Local/O=Development/OU=AI Workstation/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,DNS:*.localhost,IP:127.0.0.1,IP:::1"

# Set appropriate permissions
chmod 644 "$CERT_FILE"
chmod 600 "$KEY_FILE"

echo ""
echo "SSL certificates generated successfully!"
echo "  Certificate: $CERT_FILE"
echo "  Private Key: $KEY_FILE"
echo "  Valid for: ${VALIDITY_DAYS} days"
echo ""
echo "Certificate details:"
openssl x509 -in "$CERT_FILE" -noout -subject -dates
echo ""
echo "You can now start the services with: docker-compose up -d"
echo "Access via HTTPS: https://localhost:8443"
