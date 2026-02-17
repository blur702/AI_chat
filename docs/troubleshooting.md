# Troubleshooting Guide

Quick-reference for diagnosing and resolving common issues. Organized as **problem** followed by **solution**.

---

## 1. Startup Issues

### Port conflicts on `docker compose up`

**Symptom**: Container fails to bind to a port (e.g., `bind: address already in use`).

**Solution**: Use the startup helper which detects conflicts before launching:

```bash
python scripts/startup.py
```

Or check manually and override ports via `.env`:

```bash
# Check what is using a port (Linux/macOS)
lsof -i :8001
# Windows
netstat -ano | findstr :8001

# Override in .env
BACKEND_PORT=8002
POSTGRES_PORT=5434
```

See the service-to-port mapping in [`README.md`](../README.md#service-map).

---

### Database connection failures

**Symptom**: Backend logs `Connection refused` or `could not connect to server` at startup.

**Checks**:

1. Verify the postgres container is running: `docker compose ps postgres`
2. Check logs: `docker compose logs postgres`
3. Confirm `DATABASE_URL` in `.env` matches the compose service name and credentials:
   ```
   DATABASE_URL=postgresql+asyncpg://workstation:workstation@postgres:5432/workstation
   ```
4. If running backend outside Docker, use the host-mapped port (default 5433):
   ```
   DATABASE_URL=postgresql+asyncpg://workstation:workstation@localhost:5433/workstation
   ```

---

### Master password not working

**Symptom**: Login with the master account returns 401.

**Checks**:

1. Confirm `.env` has both variables set:
   ```
   MASTER_USERNAMES=kevin
   MASTER_PASSWORD=(130Bpm)
   ```
2. Restart the backend so the seed function runs: `docker compose restart backend`
3. If still broken, reset directly in the database:
   ```bash
   docker compose exec backend python -c "
   from app.auth import hash_password
   print(hash_password('(130Bpm)'))
   "
   # Then update via psql
   docker compose exec postgres psql -U workstation -d workstation -c \
     "UPDATE users SET password_hash='<hash>' WHERE username='kevin';"
   ```

---

### SSL certificate errors

**Symptom**: Browser shows `NET::ERR_CERT_AUTHORITY_INVALID` or nginx fails to start.

**Solution**: Regenerate local development certificates:

```bash
cd nginx/ssl
bash generate-certs.sh
cd ../..
docker compose restart nginx
```

For production (Let's Encrypt), check certbot logs and ensure DNS is pointed correctly.

---

### Kernel health returns 503

**Symptom**: `GET /health` returns 503, but the API otherwise responds.

**Explanation**: The health endpoint checks GPU-dependent services (ResourceManager readiness, ComfyUI connectivity). A 503 means one of these is unavailable. The API still works for non-GPU operations.

**Checks**:

1. `docker compose ps ollama comfyui` -- are GPU services running?
2. `docker compose logs comfyui` -- ComfyUI has a long startup (up to 180s).
3. If GPU services are not needed, ignore the 503. All other routes function normally.

---

## 2. Runtime Issues

### WebSocket disconnections

**Symptom**: Real-time events stop arriving; frontend shows disconnected state.

**Causes and fixes**:

- **Token expiry**: WS tokens expire after 60 minutes. The frontend should reconnect with a fresh token. Check that the auth refresh flow is working.
- **Nginx timeout**: Default proxy timeout may close idle connections. Verify `proxy_read_timeout` in the nginx config is set high enough (e.g., 3600s).
- **Backend restart**: After restarting the backend, nginx may cache the old DNS. Run `docker compose restart nginx`.

---

### Image generation stuck / never completes

**Symptom**: `POST /api/image/generate` returns a job ID but the result never appears.

**Checks**:

1. ComfyUI container running: `docker compose ps comfyui`
2. ComfyUI health: `curl http://localhost:8188/system_stats`
3. ARQ worker running: `docker compose ps worker` and `docker compose logs worker`
4. Volume ownership: Files in `comfyui_data` must be owned by UID/GID `1024:1024`:
   ```bash
   docker compose exec comfyui ls -la /comfy/mnt/ComfyUI/models/checkpoints/
   ```
5. Check that at least one checkpoint model exists in the checkpoints directory.

---

### KB ingestion failures

**Symptom**: File upload to knowledge base succeeds but embeddings are never generated.

**Checks**:

1. Ollama is running: `docker compose ps ollama`
2. Embedding model is pulled: `docker compose exec ollama ollama list` -- look for `nomic-embed-text`
3. If missing: `docker compose exec ollama ollama pull nomic-embed-text`
4. Check worker logs for embedding errors: `docker compose logs worker | grep -i embed`

---

### Rate limiting blocks requests

**Symptom**: API returns `429 Too Many Requests`.

**Details**: Default limits are 600 requests per 60 seconds (global) and 5 requests per 900 seconds (login). Limits are stored in Redis with keys like:

```
rate_limit:global:{client_ip}:{path}
```

**Quick fix** (development only):

```bash
# Flush all rate limit keys
docker compose exec redis redis-cli --no-auth-warning -a "${REDIS_PASSWORD}" \
  EVAL "for _,k in ipairs(redis.call('keys','rate_limit:*')) do redis.call('del',k) end" 0

# Or delete a specific key
docker compose exec redis redis-cli --no-auth-warning -a "${REDIS_PASSWORD}" \
  DEL "rate_limit:global:172.18.0.1:/api/auth/login"
```

**Permanent fix**: Adjust limits via environment variables in `.env`.

---

### 401 redirects to login

**Symptom**: API calls suddenly fail with 401 and the frontend redirects to `/login`.

**Explanation**: Access tokens expire after 30 minutes. The API client auto-redirects to `/login` on 401. This is expected behavior -- the frontend should refresh the token or prompt re-login.

If tokens expire too quickly for your workflow, check that the server clock is accurate and that `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` is set appropriately in `.env`.

---

## 3. Development Issues

### Frontend build errors after pulling changes

**Solution**:

```bash
cd frontend
pnpm install     # Reinstall deps after lockfile changes
pnpm dev         # Restart dev server
```

Check that Node.js version is 20.19+: `node --version`

---

### Import errors in frontend packages

**Symptom**: `Module not found` for `@workstation/ui` or `@workstation/api`.

**Explanation**: UI and API packages have no build step -- they are transpiled by Next.js via `transpilePackages` in `next.config.js`. If imports break:

1. Check that `transpilePackages: ["@workstation/ui", "@workstation/api"]` is present in `next.config.js`.
2. Verify the package `exports` field in each package's `package.json`.
3. Run `pnpm install` to ensure workspace links are intact.

---

### Backend test failures with database errors

**Symptom**: Tests fail with `connection refused` or `relation does not exist`.

**Explanation**: Backend tests use mocked sessions (AsyncMock), not a real database. If a test requires a real DB:

1. Ensure it is marked `@pytest.mark.integration`.
2. Check that the test conftest provides the correct session fixture.
3. Verify async fixtures use `async def` and yield properly.

---

### Container DNS issues after backend rebuild

**Symptom**: Nginx returns 502 after rebuilding the backend container.

**Solution**: Nginx caches DNS resolution. After rebuilding backend:

```bash
docker compose up -d --build backend
docker compose restart nginx
```

---

## 4. Useful Commands

```bash
# View logs (all services or specific)
docker compose logs -f
docker compose logs -f backend worker

# Exec into a container
docker compose exec backend bash
docker compose exec postgres psql -U workstation -d workstation
docker compose exec redis redis-cli -a "${REDIS_PASSWORD}"

# Check service health
curl http://localhost:8001/health
curl http://localhost:8001/api/admin/kernel/health
curl http://localhost:8001/api/admin/kernel/status

# Run database migrations
docker compose exec backend alembic upgrade head

# Rebuild a single service
docker compose up -d --build backend
docker compose up -d --build chat

# Full restart
docker compose down && docker compose up -d

# Check resource usage
docker stats --no-stream
```

---

## Related Documentation

- Service ports and setup: [`README.md`](../README.md)
- Backend development: [`backend/README.md`](../backend/README.md)
- Nginx and TLS: [`nginx/README.md`](../nginx/README.md)
