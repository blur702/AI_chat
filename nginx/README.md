# Nginx

Reverse proxy configuration for AI Workstation.

## Request Routing

| Path | Upstream | Purpose |
| --- | --- | --- |
| `/` | `chat:3001` | Next.js chat app |
| `/api` | `backend:8000` | FastAPI REST API |
| `/api/context/conversations/{id}/messages/stream` | `backend:8000` | Dedicated SSE streaming route |
| `/api/ws` | `backend:8000` | WebSocket endpoints |
| `/health` | nginx | Container health check |

## Ports

Nginx container listens on `80` and `443`.
Host mapping is controlled by:
- `NGINX_HTTP_PORT` (default `80`)
- `NGINX_HTTPS_PORT` (default `443`)

## TLS Setup

### Localhost (`https://localhost`)

Generate self-signed certs:

```bash
cd nginx/ssl
chmod +x generate-certs.sh
./generate-certs.sh
```

Windows (Git Bash / WSL):

```bash
cd nginx/ssl
bash generate-certs.sh
```

Generated files:
- `nginx/ssl/nginx-selfsigned.crt`
- `nginx/ssl/nginx-selfsigned.key`

### Production (`ssdd.kevinalthaus.com`)

- Nginx uses certificates from `nginx/certbot/conf`
- `certbot` service runs `certbot renew` every 12 hours
- Nginx reloads every 6 hours to pick up renewed certs

## Behavior Notes

- Nginx uses Docker DNS re-resolution for dynamic upstream discovery (backend/container IP churn does not normally require nginx restart).
- Dedicated SSE route disables buffering and gzip for stable streaming token delivery.
- `/api/ws` WebSocket routes use long timeouts for persistent sessions.
- For `ssdd.kevinalthaus.com`, HTTP requests are redirected to HTTPS except `/health`.

## Troubleshooting

```bash
# Container and health status
docker compose ps
curl http://localhost/health
curl -k https://localhost/health

# Nginx logs
docker compose logs -f nginx

# Validate local cert dates
openssl x509 -in nginx/ssl/nginx-selfsigned.crt -noout -dates
```

## Canonical References

- Docs hub: [`docs/README.md`](../docs/README.md)
- Platform quick start: [`README.md`](../README.md)
- Security/deployment checklist: [`docs/security-and-deployment.md`](../docs/security-and-deployment.md)
