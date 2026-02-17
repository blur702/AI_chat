# Security and Deployment Guide

---

## 1. Security Architecture

### Authentication

The backend uses JWT (HS256) for stateless authentication.

| Token type    | Lifetime | Purpose                               |
|---------------|----------|---------------------------------------|
| Access token  | 30 min   | API requests (Authorization header)   |
| WS token      | 60 min   | WebSocket connections (query param)   |

- Passwords are hashed with **bcrypt** before storage.
- The JWT secret is read from `JWT_SECRET_KEY` in `.env`. The backend **refuses to start** if this value is missing or set to the default placeholder.
- Token payload includes `user_id`, `exp`, and `type` claims.
- The login endpoint is `POST /api/auth/login` with field name `identifier` (not `username`).

### Middleware Stack

Middleware is applied in the order registered in `backend/app/main.py`. Because Starlette processes middleware as an onion (last registered = outermost), the effective request flow is:

```
Request
  -> RateLimitMiddleware       (reject before any processing)
  -> SecurityHeadersMiddleware (set response headers)
  -> TimingMiddleware          (measure processing time)
  -> GZipMiddleware            (compress large responses)
  -> CSRFProtectionMiddleware  (validate origin on cookie-auth mutations)
  -> CORSMiddleware            (handle preflight and origin headers)
  -> Application router
```

Source: `backend/app/main.py` lines 394-420.

### Rate Limiting

Redis-backed sliding window rate limiter with in-memory fallback when Redis is unavailable.

| Scope    | Default limit          | Redis key pattern                       |
|----------|------------------------|-----------------------------------------|
| Global   | 600 req / 60 sec      | `rate_limit:global:{ip}:{path}`         |
| Login    | 5 req / 900 sec       | `rate_limit:global:{ip}:/api/auth/login`|

Limits are configurable via environment variables. Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`) are included in responses.

Source: `backend/app/middleware/rate_limit.py`

### CSRF Protection

The `CSRFProtectionMiddleware` guards against cross-site request forgery for cookie-based sessions:

- Only applies to state-changing methods: `POST`, `PUT`, `PATCH`, `DELETE`.
- Skipped when the request uses a `Bearer` token (not vulnerable to CSRF).
- Only enforced when the `workstation_token` cookie is present.
- Validates the `Origin` header (or `Referer` fallback) against the configured `CORS_ORIGINS`.
- Returns 403 if the origin is missing or not in the allow list.

Source: `backend/app/middleware/csrf_protection.py`

### Security Headers

The `SecurityHeadersMiddleware` sets the following on every response:

| Header                       | Value                                              |
|------------------------------|----------------------------------------------------|
| `X-Frame-Options`           | `DENY`                                              |
| `X-Content-Type-Options`    | `nosniff`                                           |
| `X-XSS-Protection`          | `1; mode=block`                                     |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`                   |
| `Permissions-Policy`        | `camera=(), microphone=(), geolocation=()`          |
| `Content-Security-Policy`   | Restricts default-src, script-src, connect-src, etc.|
| `Cross-Origin-Opener-Policy`| `same-origin`                                       |
| `Cross-Origin-Resource-Policy`| `same-origin`                                     |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` (production)  |

In development, `script-src` includes `'unsafe-eval'` for hot-reload tooling. In production, it does not.

The middleware also strips `Server` and `X-Powered-By` headers to reduce information leakage.

Source: `backend/app/middleware/security_headers.py`

### Master User

The master account is a protected admin user seeded at startup:

- Configured via `MASTER_USERNAMES` and `MASTER_PASSWORD` in `.env`.
- Cannot be modified or deleted through the API.
- Intended for initial setup and emergency access.

### Secrets Management

All secrets are stored in `.env` (never committed to version control). Critical variables:

| Variable             | Purpose                          | Notes                              |
|----------------------|----------------------------------|------------------------------------|
| `JWT_SECRET_KEY`     | Signs all JWT tokens             | Must be strong, unique per env     |
| `MASTER_PASSWORD`    | Master admin login               | Change from default immediately    |
| `DATABASE_URL`       | PostgreSQL connection string     | Contains DB credentials            |
| `REDIS_PASSWORD`     | Redis authentication             | Used by rate limiter, ARQ worker   |
| `BREVO_API_KEY`      | Email/SMS service                | Optional                           |

The `.env.example` file documents all available variables with safe defaults.

### Code Quality and Security Scanning

Backend code is linted with **ruff** (configured in `backend/pyproject.toml`) which includes:

- `S` (flake8-bandit) rules for security anti-patterns
- `B` (flake8-bugbear) for common bugs
- `PERF` (perflint) for performance issues

The CI pipeline (`.github/workflows/security.yml`) runs additional security checks on pull requests.

---

## 2. Deployment

### Development Environment

```bash
# 1. Copy and configure environment
cp .env.example .env
# Edit .env: set JWT_SECRET_KEY, MASTER_PASSWORD, etc.

# 2. Generate local SSL certificates
cd nginx/ssl && bash generate-certs.sh && cd ../..

# 3. Start all services
python scripts/startup.py
# or: docker compose up -d

# 4. Run database migrations
docker compose exec backend alembic upgrade head
```

Access points:
- Nginx (HTTP): `http://localhost`
- Nginx (HTTPS): `https://localhost`
- Backend direct: `http://localhost:8001`
- Chat UI direct: `http://localhost:3001`

### Production Deployment

Use the production compose overlay:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

#### Required Environment Variables

These must be set in `.env` for production:

```bash
ENVIRONMENT=production
JWT_SECRET_KEY=<strong-random-string-64-chars>
MASTER_USERNAMES=<admin-username>
MASTER_PASSWORD=<strong-password>
DATABASE_URL=postgresql+asyncpg://<user>:<pass>@postgres:5432/<db>
REDIS_PASSWORD=<strong-redis-password>
CORS_ORIGINS=https://yourdomain.com
```

#### Production Checklist

- [ ] `ENVIRONMENT=production` is set (enables HSTS, disables unsafe-eval in CSP)
- [ ] `JWT_SECRET_KEY` is a strong random value (not the default)
- [ ] `MASTER_PASSWORD` is changed from the default
- [ ] `CORS_ORIGINS` is restricted to your actual domain(s)
- [ ] SSL certificates are valid (Let's Encrypt via certbot, or your own)
- [ ] `REDIS_PASSWORD` is set to a strong value
- [ ] Database credentials are not defaults
- [ ] `.env` file permissions are restricted (`chmod 600 .env`)
- [ ] Docker socket is not exposed to unprivileged users

### Rebuilding Services

After code changes, rebuild the affected service:

```bash
# Backend changes
docker compose up -d --build backend

# Frontend changes
docker compose up -d --build chat

# After backend rebuild, restart nginx to refresh DNS
docker compose restart nginx
```

### Database Migrations

Always run migrations after deploying model changes:

```bash
docker compose exec backend alembic upgrade head
```

To check current migration state:

```bash
docker compose exec backend alembic current
docker compose exec backend alembic history --verbose
```

---

## 3. Monitoring

### Health Endpoints

| Endpoint                      | Purpose                                    | Auth required |
|-------------------------------|--------------------------------------------|---------------|
| `GET /health`                 | Basic liveness + DB + kernel readiness     | No            |
| `GET /api/admin/kernel/health`| Kernel service health (all registered)     | Yes (admin)   |
| `GET /api/admin/kernel/status`| Detailed kernel status and service list    | Yes (admin)   |

The `/health` endpoint returns:

- **200**: All systems operational
- **503**: One or more kernel services (typically GPU-dependent) are unavailable. The API still functions for non-GPU operations.

### Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f backend

# Filter for errors
docker compose logs backend 2>&1 | grep -i error
```

The backend logs slow requests (over 1 second) via the `TimingMiddleware`, tagged with `workstation.timing`. Rate limit events are logged under `workstation.rate_limit`.

### Container Health Checks

All Docker services define health checks. View status:

```bash
docker compose ps
docker inspect --format='{{.State.Health.Status}}' workstation-backend
```

Key health check details:
- **Ollama**: `curl http://localhost:11434/api/tags`
- **ComfyUI**: `curl http://localhost:8188/system_stats` (start_period: 180s due to model loading)
- **Backend**: `curl http://localhost:8000/health`
- **Redis**: `redis-cli ping`

---

## Related Documentation

- Service map and quick start: [`README.md`](../README.md)
- Backend development: [`backend/README.md`](../backend/README.md)
- Nginx and TLS configuration: [`nginx/README.md`](../nginx/README.md)
- Troubleshooting: [`docs/troubleshooting.md`](./troubleshooting.md)
