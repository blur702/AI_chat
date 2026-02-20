# Performance Guidelines

Actionable performance rules for the AI Workstation project. Not a textbook -- skim the bullets, apply what matters.

---

## 1. Backend Performance

### Database (PostgreSQL + pgvector)

- **Always use async sessions** (`AsyncSessionLocal`). Never use synchronous SQLAlchemy calls; they block the event loop.
- **Avoid N+1 queries.** Use `selectinload()` or `joinedload()` for relationships loaded in list endpoints. Profile with `SLOW_QUERY_THRESHOLD_MS` (default 500ms) in env.
- **Index frequently queried columns.** Every foreign key used in WHERE or JOIN should have an index. Check new Alembic migrations include indexes.
- **pgvector: use IVFFlat indexes** for vector similarity search. Rebuild indexes (`REINDEX`) after bulk KB ingestion since IVFFlat indexes depend on data distribution at creation time.
- **Use `expire_on_commit=False`** (already configured) to prevent implicit lazy-load queries after commits.
- **Paginate all list endpoints.** Never return unbounded result sets. Use `LIMIT`/`OFFSET` or cursor-based pagination.

### Connection Pooling

- SQLAlchemy async pool is configured via env vars: `DB_POOL_SIZE` (default 10), `DB_MAX_OVERFLOW` (20), `DB_POOL_RECYCLE` (1800s), `DB_POOL_TIMEOUT` (30s).
- `pool_pre_ping=True` is enabled to drop stale connections before use. Leave it on.
- `statement_cache_size=0` is set for pgbouncer compatibility. Do not change unless you remove pgbouncer.
- Redis connection pool is initialized lazily in the rate limiter. The rate limit middleware falls back to in-memory sliding window if Redis is unavailable.

### Caching (Redis)

- **Rate limits** use Redis sorted sets with atomic Lua scripts (EVALSHA with EVAL fallback). Keys follow `rate_limit:global:{ip}:{path}`.
- **Consider caching expensive queries** (e.g., KB search results, model lists from Ollama) in Redis with short TTLs (30-120s). Use a consistent key scheme like `cache:{service}:{hash}`.
- **Do not cache user-specific mutable data** in Redis without a clear invalidation strategy.

### Async Discipline

- **Never call blocking I/O** (synchronous HTTP, file reads, subprocess) in async route handlers. Use `asyncio.to_thread()` if you must wrap sync code.
- **Use ARQ for heavy work**, not FastAPI `BackgroundTasks`. ARQ provides retry, timeout, and result storage. Current ARQ tasks: image generation, KB document ingestion.
- **Avoid `asyncio.sleep()` as a polling mechanism.** Use callbacks, events, or WebSocket push instead.
- **Keep middleware fast.** TimingMiddleware and RateLimitMiddleware run on every request. Any new middleware must be sub-millisecond for the common case.

### API Response Optimization

- GZip middleware compresses responses >= 500 bytes. Large JSON responses benefit automatically.
- Slow request logging fires at >= 1.0s (`SLOW_REQUEST_THRESHOLD` in timing middleware). Investigate any recurring slow requests in logs.
- Return only the fields the client needs. Avoid serializing entire ORM models with deep relationships.

---

## 2. Frontend Performance

### Bundle Size

- **Use dynamic imports** (`next/dynamic`) for heavy components: terminal emulator, code editor, image generation form. These should not be in the initial bundle.
- **Tree-shake unused UI components.** The `packages/ui` library re-exports everything from `index.ts`. Import individual components, not the barrel file, when possible.
- **Monitor bundle size.** Run `pnpm --filter chat build` and check `.next/analyze` output periodically. Set a budget (e.g., < 250KB initial JS).

### React Rendering

- **Use `React.memo`** for expensive list items (message bubbles, file tree nodes) that re-render on parent state changes.
- **Split contexts** to avoid re-rendering the entire tree when one piece of state changes. Separate frequently-changing state (e.g., streaming tokens) from stable state (e.g., user settings).
- **Use `useMemo`/`useCallback` judiciously** -- only when profiling shows unnecessary re-renders or expensive computations. Do not apply them everywhere by default.
- **Virtualize long lists.** Message threads with hundreds of messages should use windowing (e.g., `react-window` or `react-virtuoso`).

### WebSocket

- **Single shared connection** per client session at `/api/ws/events?token=<ws_token>`. Do not open multiple WebSocket connections.
- **Reconnect with exponential backoff** (base 1s, max 30s, with jitter). The `use-websocket` hook should handle this.
- **Do not send large payloads** over WebSocket. Use it for events and notifications; fetch bulk data via REST.

### Streaming & State

- **Process SSE/streaming tokens incrementally.** Append tokens to a ref or buffer, then flush to state on `requestAnimationFrame` or a debounced interval. Do not call `setState` on every single token.
- **Avoid accumulating the full response in an array of individual tokens.** Concatenate to a single string.

### Images & Assets

- **Use `next/image`** for all images. It handles lazy loading, responsive sizing, and format optimization.
- **Lazy load below-fold content.** Use `loading="lazy"` on images and dynamic imports for tabs/panels the user has not opened.

---

## 3. Infrastructure Performance

### Nginx

- **GZip is configured** at the Nginx layer as well as FastAPI middleware for regular API/static responses. Do not gzip SSE message streams.
- **Static file caching headers.** Set `Cache-Control: public, max-age=31536000, immutable` for hashed Next.js assets (`/_next/static/`). Set short TTLs for HTML pages.
- **WebSocket proxy timeouts.** Set `proxy_read_timeout` and `proxy_send_timeout` to at least 3600s for the `/api/ws/` location to prevent idle disconnects.

### Docker

- **Multi-stage builds** for backend and frontend images. Final stage should not include build tools, dev dependencies, or source maps.
- **Health checks** are defined for all services. Intervals: Postgres and Redis at 10s; Ollama and ComfyUI at 30s with `start_period: 180s` (GPU services take time to load models).
- **Resource limits.** Set `mem_limit` on containers to prevent a runaway process from starving other services.
- **Sandbox containers** (project execution environments) use per-project `asyncio.Lock` to prevent creation races and a circuit breaker to stop retry storms.

### GPU (Ollama + ComfyUI)

- Ollama and ComfyUI share the GPU. Monitor VRAM usage via `GET /api/resources/vram`.
- Backend gets `count: 1, capabilities: [utility]` GPU access for pynvml VRAM monitoring only -- it does not run inference.
- **ComfyUI cold starts are slow** (model loading). The health check `start_period` is 180s. Do not reduce it.
- For image generation, the ARQ worker queues jobs and polls ComfyUI `/history`. This avoids holding a request thread while waiting for generation.

---

## 4. Monitoring

### Request Timing

- Every response includes an **`X-Process-Time`** header (seconds, 4 decimal places) from `TimingMiddleware`.
- Requests exceeding 1.0s are logged as warnings: `Slow request (XXms): METHOD /path`.
- Slow SQL queries exceeding `SLOW_QUERY_THRESHOLD_MS` (default 500ms) are logged separately by the SQLAlchemy event listener in `database.py`.

### Health Endpoints

| Endpoint | Purpose | Returns 503 when |
|---|---|---|
| `GET /health` | Liveness probe | Postgres, Redis, or kernel is down |
| `GET /api/health` | API health with service name | Same as above |
| `GET /api/health/ready` | Readiness probe | Dependencies not ready |
| `GET /api/kernel/health` | Kernel + all registered services | Any service unhealthy |
| `GET /api/kernel/status` | Detailed debug info (always 200) | Never (informational) |

### Rate Limit Headers

- Every response includes **`X-RateLimit-Remaining`** showing remaining requests in the current window.
- 429 responses include a **`Retry-After`** header (seconds).

### What to Monitor

- **`X-Process-Time` p50/p95/p99** per endpoint. Alert if p95 exceeds 2s for any API route.
- **429 response rate.** A spike means either a misconfigured client or an attack.
- **WebSocket connection count.** Track via the WebSocket manager. Alert on sudden drops (indicates server issues).
- **ARQ job queue depth and failure rate.** If jobs pile up, image generation and KB ingestion will stall.
- **VRAM usage** via `/api/resources/vram`. Alert above 90% to prevent OOM on the GPU.
- **PostgreSQL connection pool saturation.** Log when `DB_POOL_SIZE + DB_MAX_OVERFLOW` connections are all in use.

## Related Docs

- Documentation hub: [`docs/README.md`](./README.md)
- Architecture: [`docs/architecture.md`](./architecture.md)
- Security and deployment: [`docs/security-and-deployment.md`](./security-and-deployment.md)
