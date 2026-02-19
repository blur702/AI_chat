# Troubleshooting Guide

Common failures and fast recovery steps.

## Startup Issues

### Port Already In Use

```bash
python scripts/startup.py
```

If needed:

```bash
netstat -ano | findstr :8001
```

Then override ports in `.env` (`BACKEND_PORT`, `POSTGRES_PORT`, etc.).

### Backend Cannot Reach Database

Checks:
1. `docker compose ps postgres`
2. `docker compose logs postgres`
3. Confirm `.env` credentials and `DATABASE_URL`
4. If backend runs outside Docker, use host DB port (default `5433`)

### TLS / Cert Errors

```bash
cd nginx/ssl
bash generate-certs.sh
cd ../..
docker compose restart nginx
```

## Runtime Issues

### WebSocket Disconnects

Checks:
1. Confirm token refresh flow (WS token expiration).
2. Check Nginx timeout values for `/api/ws`.
3. Confirm backend health before debugging the socket path:
   - `curl http://localhost:8001/api/kernel/status`
   - `curl http://localhost:8001/api/resources/status`

Note: restarting Nginx is typically not required after backend container recreation because nginx uses Docker DNS re-resolution.

Reference: [`backend/docs/websocket_reconnection.md`](../backend/docs/websocket_reconnection.md)

### Repeated `502` From `/api/kernel/status` or `/api/resources/status`

Checks:
1. Confirm backend is running:
   - `docker compose ps backend`
2. Inspect backend logs for startup/kernel failures:
   - `docker compose logs -f backend`
3. Verify required env values exist and are non-placeholder:
   - `SECRET_KEY`
   - `DATABASE_URL`
   - `REDIS_URL`
   - `MASTER_PASSWORD` and `MASTER_USERNAMES`
4. Rebuild/restart backend:

```bash
docker compose up -d --build backend
```

If backend is healthy directly on `:8001` but still fails through nginx, check nginx logs:

```bash
docker compose logs -f nginx
```

Note: `/health` now treats `ssh_client`, `drupal_mcp`, and `brevo_client` as optional.
If health output shows `optional services unhealthy: ssh_client`, core API health is still valid.

### `ERR_HTTP2_PROTOCOL_ERROR` On Message Streaming

Checks:
1. Confirm nginx is using the dedicated SSE route for:
   - `/api/context/conversations/{id}/messages/stream`
2. Confirm backend stream endpoint responds directly:
   - `curl -N -H "Authorization: Bearer <token>" http://localhost:8001/api/context/conversations/<chat_id>/messages/stream -X POST -H "Content-Type: application/json" -d "{\"content\":\"ping\"}"`
3. If this only occurs behind reverse proxy/CDN, disable buffering/compression for SSE in the upstream layer.

Recent behavior:
- The chat client now attempts an automatic fallback to non-streamed `POST /api/context/conversations/{id}/messages` when the stream endpoint fails before tokens are received.
- If fallback succeeds, you still get a response; the UX may be less incremental (full response at once).

### Image Generation Stuck

Checks:
1. `docker compose ps comfyui worker`
2. `docker compose logs worker`
3. `curl http://localhost:8188/system_stats`
4. Confirm model files exist in ComfyUI checkpoints volume

### KB Ingestion Fails

Checks:
1. `docker compose ps ollama`
2. `docker compose exec ollama ollama list`
3. Pull embedding model if missing:

```bash
docker compose exec ollama ollama pull nomic-embed-text
```

### 429 Rate Limit Errors

Defaults:
- 600 requests / 60s global
- stricter limits on login

Development reset (Redis):

```bash
docker compose exec redis redis-cli --no-auth-warning -a "${REDIS_PASSWORD}" \
  EVAL "for _,k in ipairs(redis.call('keys','rate_limit:*')) do redis.call('del',k) end" 0
```

### Frequent 401 Redirects

`GET /api/auth/me` returning `401` is expected when not authenticated.

Unexpected redirect loops usually mean token expiry or invalid auth state. Verify:
- server time is correct
- token lifetime env settings are appropriate
- login/refresh flow is healthy
- stale browser storage/session data is cleared

Recent behavior:
- The frontend now redirects to `/login` on `401` from `/api/auth/me` when you are not already on the login page.
- The auth bootstrap check is skipped on `/login` to reduce expected unauthenticated console noise.
- WebSocket reconnect is halted when the JWT is expired to prevent repeated socket errors in the console.

## Development Issues

### Frontend Package Import Errors

```bash
cd frontend
pnpm install
pnpm dev
```

Also confirm `next.config.js` includes:
- `transpilePackages: ["@workstation/ui", "@workstation/api"]`

### Backend Test Failures

Checks:
1. Use correct markers (`unit`, `integration`, `slow`)
2. Confirm fixtures from `tests/backend/conftest.py`
3. Ensure async tests/fixtures are `async def`

## Useful Commands

```bash
docker compose logs -f
docker compose logs -f backend worker
docker compose exec backend bash
docker compose exec backend alembic upgrade head
curl http://localhost:8001/health
curl http://localhost:8001/api/kernel/health
```

## Related Docs

- Docs hub: [`docs/README.md`](./README.md)
- Security/deployment: [`docs/security-and-deployment.md`](./security-and-deployment.md)
- Nginx setup: [`nginx/README.md`](../nginx/README.md)
