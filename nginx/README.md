# Nginx Configuration

This directory contains the nginx reverse proxy configuration for the AI Workstation.

## Overview

Nginx serves as the entry point for all HTTP/HTTPS traffic, routing requests to the appropriate backend services:

| Route | Destination | Purpose |
|-------|-------------|---------|
| `/` | Frontend (port 3000) | Next.js web application |
| `/api` | Backend (port 8000) | FastAPI REST endpoints |
| `/ws` | Backend (port 8000) | WebSocket connections |
| `/health` | Nginx | Health check endpoint |

## Ports

| Port | Protocol | Description |
|------|----------|-------------|
| 8080 | HTTP | Non-SSL access (configurable via `NGINX_HTTP_PORT`) |
| 8443 | HTTPS | SSL-encrypted access (configurable via `NGINX_HTTPS_PORT`) |

## SSL Setup (Required for HTTPS)

Before using HTTPS, you must generate self-signed SSL certificates:

```bash
# Navigate to the SSL directory
cd nginx/ssl

# Make the script executable (Linux/macOS)
chmod +x generate-certs.sh

# Generate certificates
./generate-certs.sh
```

On Windows (Git Bash or WSL):
```bash
cd nginx/ssl
bash generate-certs.sh
```

### Generated Files

- `nginx-selfsigned.crt` - SSL certificate
- `nginx-selfsigned.key` - Private key

These files are excluded from version control via `.gitignore`.

### Browser Security Warning

When accessing `https://localhost:8443`, your browser will display a security warning because the certificate is self-signed. This is expected behavior in development. Click "Advanced" and "Proceed" to continue.

## Configuration Details

### Streaming Support

The configuration is optimized for AI streaming responses:

- **Proxy buffering**: Disabled globally for real-time streaming
- **API timeouts**: 300 seconds (5 minutes) for long-running AI operations
- **Request buffering**: Disabled for streaming requests

### WebSocket Support

WebSocket connections (`/ws`) are configured with:

- 7-day timeout for persistent connections
- Proper upgrade headers for HTTP/WebSocket protocol switching

### Health Check

The nginx container includes a health check that monitors the `/health` endpoint every 30 seconds.

## Production Considerations

### Enable HTTP to HTTPS Redirect

To force HTTPS in production, uncomment the redirect block in `nginx.conf`:

```nginx
# HTTP to HTTPS redirect (excludes /health for container health checks)
# Uncomment the following block to enable redirect in production:
if ($request_uri !~ ^/health) {
    return 301 https://$host:8443$request_uri;
}
```

Note: The `/health` endpoint is excluded from the redirect to ensure container health checks continue to work over HTTP.

### Use Proper SSL Certificates

For production, replace the self-signed certificates with certificates from a trusted CA (e.g., Let's Encrypt).

### Security Headers

Consider adding security headers for production:

```nginx
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

## Troubleshooting

### SSL Certificate Errors

If nginx fails to start with SSL errors:

1. Ensure certificates are generated: `ls nginx/ssl/`
2. Regenerate certificates if corrupted: `cd nginx/ssl && ./generate-certs.sh`
3. Check certificate validity: `openssl x509 -in nginx/ssl/nginx-selfsigned.crt -noout -dates`

### Connection Timeouts

If AI requests are timing out:

1. Check `proxy_read_timeout` in `nginx.conf` (default: 300s)
2. Increase if needed for very long operations

### WebSocket Disconnections

If WebSocket connections are dropping:

1. Verify the `/ws` route timeout settings
2. Check for intermediate proxies that may have shorter timeouts
