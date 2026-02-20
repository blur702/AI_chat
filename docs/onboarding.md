# Developer Onboarding

This guide gets a new contributor to a working local environment quickly.

## Prerequisites

| Tool | Version |
| --- | --- |
| Docker Desktop + Compose | 24+ / v2+ |
| Node.js | 20.19+ |
| pnpm | 9+ |
| Python | 3.11+ |
| Git | 2.30+ |

GPU is optional. Ollama/ComfyUI features require NVIDIA support.

## First-Time Setup

1. Clone and configure:

```bash
git clone <repository-url> AICHAT
cd AICHAT
cp .env.example .env
```

2. Set required secrets in `.env`:
- `SECRET_KEY` (at least 32 characters)
- `MASTER_USERNAMES`
- `MASTER_PASSWORD`
- `DATABASE_URL` (with your DB password)
- `REDIS_URL` (with your Redis password)

3. Generate local TLS certs:

```bash
cd nginx/ssl
bash generate-certs.sh
cd ../..
```

4. Start services:

```bash
python scripts/startup.py
# or
docker compose up -d
```

5. Verify:

```bash
docker compose ps
curl http://localhost/health
curl http://localhost:8001/health
```

6. Open:
- `http://localhost`
- `http://localhost:3001`

## Day-To-Day Workflows

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
./scripts/run_tests.sh unit
```

### Frontend

```bash
cd frontend
pnpm install
pnpm dev
pnpm test
```

### Migrations

```bash
docker compose exec backend alembic upgrade head
docker compose exec backend alembic revision --autogenerate -m "describe change"
```

## Useful URLs

| URL | Purpose |
| --- | --- |
| `http://localhost` | App via Nginx |
| `https://localhost` | App via Nginx + TLS |
| `http://localhost:3001` | Frontend direct |
| `http://localhost:8001/docs` | Backend OpenAPI |
| `http://localhost:11434` | Ollama |
| `http://localhost:8188` | ComfyUI |

## Next Reading

- Documentation hub: [`docs/README.md`](./README.md)
- Architecture: [`docs/architecture.md`](./architecture.md)
- Testing guide: [`docs/testing.md`](./testing.md)
- Troubleshooting: [`docs/troubleshooting.md`](./troubleshooting.md)
