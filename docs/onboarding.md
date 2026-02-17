# Developer Onboarding Guide

This guide walks you through setting up the AI Workstation for local development and covers the most common workflows.

## Prerequisites

| Tool           | Version  | Notes                                      |
|----------------|----------|--------------------------------------------|
| Docker         | 24+      | Docker Desktop on Windows/macOS            |
| Docker Compose | v2+      | Included with Docker Desktop               |
| Node.js        | 18+      | Required for frontend development          |
| pnpm           | 8+       | `npm install -g pnpm`                      |
| Python         | 3.11+    | Required for backend development outside Docker |
| Git            | 2.30+    | Standard                                   |
| NVIDIA GPU     | Optional | Required for Ollama and ComfyUI            |

## First-Time Setup

### 1. Clone and configure environment

```bash
git clone <repository-url> && cd AICHAT
cp .env.example .env
```

Open `.env` and set at minimum:

- `SECRET_KEY` -- generate with `openssl rand -hex 32`
- `POSTGRES_PASSWORD` -- change from the default
- `DATABASE_URL` -- update to match your `POSTGRES_PASSWORD`
- `REDIS_PASSWORD` -- change from the default
- `REDIS_URL` -- update to match your `REDIS_PASSWORD`
- `ADMIN_PASSWORD` -- at least 8 characters
- `MASTER_USERNAMES` and `MASTER_PASSWORD` -- your admin account

### 2. Generate local SSL certificates

```bash
cd nginx/ssl
bash generate-certs.sh
cd ../..
```

This creates self-signed certs for `https://localhost`. Your browser will show a warning -- this is expected.

### 3. Start all services

```bash
# Recommended: checks for port conflicts first
python scripts/startup.py

# Or start directly
docker compose up -d
```

### 4. Verify everything is running

```bash
docker compose ps
curl http://localhost:8001/health
curl http://localhost/health
```

### 5. Open the app

Navigate to `http://localhost` (Nginx) or `http://localhost:3001` (direct). Log in with the admin credentials you set in `.env`.

## Project Structure

```
AICHAT/
  backend/
    app/
      api/              # FastAPI route handlers
      kernel/           # WorkstationKernel and BaseKernelService
      middleware/        # Rate limiting, CSRF, security headers, timing
      models/           # SQLAlchemy models
      schemas/          # Pydantic request/response schemas
      services/         # Kernel service implementations (Ollama, ComfyUI, etc.)
      tools/            # Tool implementations (code editing, web search, Brevo)
    alembic/            # Database migration scripts
    scripts/            # Test runners, seed scripts
    tests/              # Backend test suite
  frontend/
    apps/
      chat/             # Next.js 14 app (chat, workspace, terminal, image-gen)
    packages/
      api/              # TypeScript API client, types, React hooks
      ui/               # Shared component library (shadcn/ui + Tailwind)
  nginx/
    conf.d/             # Nginx configuration files
    ssl/                # SSL cert generation script and certs
  docs/                 # Architecture and developer documentation
  docker-compose.yml    # Service definitions
  .env.example          # Environment variable template
```

## Common Workflows

### Backend Development

Edit code under `backend/app/`, then rebuild and restart:

```bash
docker compose up -d --build backend
docker compose logs -f backend
```

For faster iteration without Docker, run the backend locally:

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Run tests:

```bash
cd backend
./scripts/run_tests.sh          # All tests
./scripts/run_tests.sh unit     # Unit tests only
pytest tests/ -v --cov=app      # Direct pytest
```

### Frontend Development

The frontend runs outside Docker during development for hot reload:

```bash
cd frontend
pnpm install
pnpm dev
```

This starts the Next.js dev server on port 3001. The `packages/ui` and `packages/api` packages have no build step -- they are transpiled by the consuming Next.js app automatically.

### Database Migrations

Apply pending migrations:

```bash
docker exec workstation-backend alembic upgrade head
```

Create a new migration after changing SQLAlchemy models:

```bash
docker exec workstation-backend alembic revision --autogenerate -m "describe the change"
```

Always review the generated migration file before applying it.

### Adding a New API Endpoint

1. **Create or extend a router** in `backend/app/api/`. Each file exports an `APIRouter`.

2. **Define request/response schemas** in `backend/app/schemas/` using Pydantic `BaseModel`.

3. **Register the router** in `backend/app/main.py`:

```python
from app.api.my_feature import router as my_feature_router

app.include_router(my_feature_router, prefix="/api", tags=["my-feature"])
```

4. **Add an OpenAPI tag** to the `openapi_tags` list in `main.py` for documentation grouping.

5. **Rebuild** the backend container: `docker compose up -d --build backend`.

### Adding a New Kernel Service

1. **Implement `BaseKernelService`** in `backend/app/services/`:

```python
from app.kernel import BaseKernelService
from typing import Tuple

class MyService(BaseKernelService):
    @property
    def name(self) -> str:
        return "my_service"

    @property
    def is_running(self) -> bool:
        return self._running

    async def startup(self) -> None:
        self._running = True

    async def shutdown(self) -> None:
        self._running = False

    async def health_check(self) -> Tuple[bool, str]:
        return self._running, "ok" if self._running else "not running"
```

2. **Register in the lifespan** function in `backend/app/main.py`:

```python
my_service = MyService()
kernel.register_service(my_service)
```

Registration order matters -- register dependencies before dependents. See [backend/app/kernel/README.md](../backend/app/kernel/README.md) for the full service contract and best practices.

## Useful URLs

| URL                            | Description                       |
|--------------------------------|-----------------------------------|
| `http://localhost`             | App via Nginx (production-like)   |
| `https://localhost`            | App via Nginx with TLS            |
| `http://localhost:3001`        | Next.js dev server (direct)       |
| `http://localhost:8001`        | Backend API (direct)              |
| `http://localhost:8001/docs`   | OpenAPI / Swagger UI              |
| `http://localhost:8001/health` | Backend health check              |
| `http://localhost:11434`       | Ollama API                        |
| `http://localhost:8188`        | ComfyUI web interface             |

## Troubleshooting Quick Reference

**Backend won't start** -- Check `docker compose logs backend`. Common causes: bad `DATABASE_URL`, missing `SECRET_KEY`, or port conflict on 8001.

**Frontend can't reach API** -- Verify `NEXT_PUBLIC_API_URL` in `.env` points to `http://localhost:8001`. If using Nginx, ensure the backend container is running (`docker compose restart nginx` after backend recreation).

**Database migration errors** -- Run `docker exec workstation-backend alembic upgrade head`. If that fails, check `docker compose logs postgres` for connection issues.

**Rate limited during development** -- Default is 600 requests per 60 seconds. Flush rate limit keys in Redis:
```bash
docker exec workstation-redis redis-cli -a "$REDIS_PASSWORD" KEYS "rate_limit:*"
```

## Next Steps

- [Architecture Overview](./architecture.md) -- System design, data flows, and design decisions.
- [Backend README](../backend/README.md) -- Testing, coverage, and backend-specific commands.
- [Kernel README](../backend/app/kernel/README.md) -- Service lifecycle and health check contracts.
- [Nginx README](../nginx/README.md) -- TLS setup and request routing.
