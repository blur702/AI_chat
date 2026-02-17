# AI Workstation

Containerized AI development environment with:
- FastAPI backend
- Next.js chat frontend
- PostgreSQL + pgvector
- Redis + ARQ worker
- Ollama + ComfyUI (GPU services)
- Nginx reverse proxy (HTTP/HTTPS)

## Service Map

| Service | Container | Internal Port | Host Port (default) |
| --- | --- | --- | --- |
| Chat frontend | `chat` | 3001 | 3001 (`CHAT_PORT`) |
| Backend API | `backend` | 8000 | 8001 (`BACKEND_PORT`) |
| PostgreSQL | `postgres` | 5432 | 5433 (`POSTGRES_PORT`) |
| Redis | `redis` | 6379 | 6380 (`REDIS_PORT`) |
| Ollama | `ollama` | 11434 | 11434 (`OLLAMA_PORT`) |
| ComfyUI | `comfyui` | 8188 | 8188 (`COMFYUI_PORT`) |
| Nginx | `nginx` | 80/443 | 80/443 (`NGINX_HTTP_PORT`/`NGINX_HTTPS_PORT`) |

## Quick Start

1. Copy env file:

```bash
cp .env.example .env
```

2. Generate local SSL certs (for `https://localhost`):

```bash
cd nginx/ssl
# Linux/macOS
chmod +x generate-certs.sh && ./generate-certs.sh
# Windows (Git Bash / WSL)
bash generate-certs.sh
cd ../..
```

3. Install startup helper dependencies (optional but recommended):

```bash
pip install -r scripts/requirements.txt
```

4. Start services:

```bash
# Recommended: detects port conflicts first
python scripts/startup.py

# Or directly
docker compose up -d

# Production-style overrides
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

5. Open the app:
- Chat UI: `http://localhost:3001`
- Backend health: `http://localhost:8001/health`
- Nginx HTTP: `http://localhost`
- Nginx HTTPS: `https://localhost`

## Common Operations

```bash
# Logs
docker compose logs -f
docker compose logs -f backend

# Restart service
docker compose restart backend

# Rebuild one service
docker compose up -d --build backend

# Stop all
docker compose down

# Stop and delete volumes (destructive)
docker compose down -v
```

## Verification

```bash
docker compose ps
curl http://localhost/health
curl -k https://localhost/health
curl http://localhost:8001/health
docker exec workstation-postgres pg_isready -U workstation_user
docker exec workstation-redis redis-cli -a "$REDIS_PASSWORD" ping
```

## Documentation Index

- Backend: `backend/README.md`
- Nginx and SSL: `nginx/README.md`
- WebSocket reconnection/state recovery: `backend/docs/websocket_reconnection.md`
- UI accessibility: `frontend/packages/ui/ACCESSIBILITY.md`
- UI responsive system: `frontend/packages/ui/RESPONSIVE.md`

## Notes

- The browser warning on `https://localhost` is expected with self-signed certs.
- Set a valid `MASTER_PASSWORD` in `.env` before first startup.
- For production-style runs, use `docker-compose.prod.yml` and provide required secrets.
