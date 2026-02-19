# AI Workstation

Containerized AI development platform with a FastAPI backend, Next.js frontend, PostgreSQL + pgvector, Redis + ARQ worker, optional GPU services (Ollama/ComfyUI), and Nginx proxy.

## Quick Start

1. Copy environment config:

```bash
cp .env.example .env
```

2. Generate local TLS certs:

```bash
cd nginx/ssl
bash generate-certs.sh
cd ../..
```

3. Start services:

```bash
python scripts/startup.py
# or
docker compose up -d
```

4. Verify health:

```bash
docker compose ps
curl http://localhost/health
curl http://localhost:8001/health
```

5. Open the app:
- `http://localhost` (via Nginx)
- `https://localhost` (via Nginx + TLS)
- `http://localhost:3001` (direct frontend)

## Service Map

| Service | Container | Internal | Host default |
| --- | --- | --- | --- |
| Chat frontend | `chat` | `3001` | `3001` (`CHAT_PORT`) |
| Backend API | `backend` | `8000` | `8001` (`BACKEND_PORT`) |
| PostgreSQL | `postgres` | `5432` | `5433` (`POSTGRES_PORT`) |
| Redis | `redis` | `6379` | `6380` (`REDIS_PORT`) |
| Ollama | `ollama` | `11434` | `11434` (`OLLAMA_PORT`) |
| ComfyUI | `comfyui` | `8188` | `8188` (`COMFYUI_PORT`) |
| SearXNG | `searxng` | `8080` | *(internal only)* |
| Drupal (local) | `drupal` | `80` | `8080` (`DRUPAL_PORT`) |
| Drupal DB | `drupal_db` | `3306` | *(internal only)* |
| Nginx | `nginx` | `80/443` | `80/443` (`NGINX_HTTP_PORT`/`NGINX_HTTPS_PORT`) |

## Common Commands

```bash
docker compose logs -f
docker compose restart backend
docker compose up -d --build backend
docker compose down
```

## Documentation

Use the central docs hub: [`docs/README.md`](docs/README.md)

Key entry points:
- Onboarding: [`docs/onboarding.md`](docs/onboarding.md)
- Architecture: [`docs/architecture.md`](docs/architecture.md)
- Backend dev/testing: [`backend/README.md`](backend/README.md)
- Frontend dev/testing: [`frontend/README.md`](frontend/README.md)
- Troubleshooting: [`docs/troubleshooting.md`](docs/troubleshooting.md)

## Notes

- Browsers will warn on self-signed certs at `https://localhost`.
- Set secure values in `.env` before first startup (`SECRET_KEY`, `MASTER_PASSWORD`, DB/Redis passwords).
