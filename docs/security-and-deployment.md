# Security And Deployment

Security model and deployment checklist for AI Workstation.

## Security Controls

### Authentication

- JWT (`HS256`) for API and WebSocket auth.
- Access tokens and WS tokens are separate.
- Passwords are stored as bcrypt hashes.
- Backend must not run with placeholder secrets.

Required environment variables:
- `SECRET_KEY` (minimum 32 characters)
- `MASTER_USERNAMES`
- `MASTER_PASSWORD`
- `DATABASE_URL`
- `REDIS_URL` (and `REDIS_PASSWORD` when using Docker Compose defaults)

### Middleware Protections

Configured in `backend/app/main.py`:
- Rate limiting
- Security headers
- Timing
- GZip
- CSRF protection (cookie-based mutations)
- CORS

### Security Headers

Security headers are added by `backend/app/middleware/security_headers.py`, including CSP, frame protection, referrer policy, and HSTS in production.

### Rate Limiting

- Redis-backed sliding window limiter with in-memory fallback.
- Response headers include remaining quota and retry timing.
- Default limits can be tuned through environment variables.

## Deployment

### Development

```bash
cp .env.example .env
cd nginx/ssl && bash generate-certs.sh && cd ../..
python scripts/startup.py
docker compose exec backend alembic upgrade head
```

### Production

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
docker compose exec backend alembic upgrade head
```

Required production settings:
- `ENVIRONMENT=production`
- strong `SECRET_KEY`
- non-default admin and DB/Redis credentials
- restricted `CORS_ORIGINS`
- valid TLS certificates

## Rebuild And Rollout

```bash
docker compose up -d --build backend
docker compose up -d --build chat
```

Nginx restart is usually unnecessary after backend container recreation because upstreams are resolved dynamically.
Reload/restart Nginx only when its config or certificates change.

## Health And Monitoring

Canonical endpoints:
- `GET /health`
- `GET /api/health`
- `GET /api/health/ready`
- `GET /api/kernel/health`
- `GET /api/kernel/status`
- `GET /api/admin/kernel/debug` (admin)
- `GET /api/admin/kernel/metrics` (admin)

Useful commands:

```bash
docker compose ps
docker compose logs -f backend
docker compose logs -f nginx
```

## Related Docs

- Docs hub: [`docs/README.md`](./README.md)
- Troubleshooting: [`docs/troubleshooting.md`](./troubleshooting.md)
- Nginx routing/TLS: [`nginx/README.md`](../nginx/README.md)
