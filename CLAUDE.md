# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Workstation is a containerized AI development environment with LLM integration (Ollama), image generation (ComfyUI), and isolated preview environments. Uses Docker Compose orchestration with microservices architecture.

## Common Commands

### Docker Development (Primary)
```bash
docker-compose up -d                    # Start all services
docker-compose up -d --build backend    # Rebuild specific service
docker-compose logs -f backend          # Stream service logs
docker-compose restart backend          # Restart service
docker-compose down                     # Stop all (preserves data)
docker-compose down -v                  # Stop and delete volumes (DESTRUCTIVE)
```

### Backend (FastAPI)
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Database migrations
alembic upgrade head                           # Apply migrations
alembic revision --autogenerate -m "message"   # Generate migration
alembic downgrade -1                           # Rollback one migration

# Background worker
arq app.worker.WorkerSettings
```

### Frontend (Next.js)
```bash
cd frontend
npm install
npm run dev      # Dev server (port 3000)
npm run build    # Production build
npm run lint     # Linting
```

### Testing
```bash
cd backend
pytest tests/ -v --cov=app                        # All tests with coverage
pytest tests/ -m unit -v                           # Only unit tests
pytest tests/ -m integration -v                    # Only integration tests
pytest tests/kernel/test_resource_manager.py       # Single test file
pytest tests/kernel/ -v --cov=app                  # All kernel tests
./scripts/run_tests.sh                             # Runner with coverage report
./scripts/run_tests.sh unit                        # By marker
```

Coverage threshold is 80% on `app/` (configured in `.coveragerc`). Test config is in `pytest.ini` with `asyncio_mode = auto`.

### Health Verification
```bash
curl http://localhost/health                   # Nginx HTTP
curl -k https://localhost/health               # Nginx HTTPS (self-signed)
# Set EXTERNAL_DOMAIN to your public hostname (e.g. from .env or DNS config)
curl https://${EXTERNAL_DOMAIN}/health         # Nginx HTTPS (Let's Encrypt)
curl http://localhost:8001/health              # Backend direct (DB + Redis + Kernel)
curl http://localhost:8001/api/kernel/health   # Kernel services only
curl http://localhost:8001/api/kernel/status   # Detailed kernel status
docker exec workstation-postgres pg_isready -U workstation_user
docker exec workstation-redis redis-cli -a $REDIS_PASSWORD ping
```

## Architecture

### Services & Ports

| Service | Internal | Host | Tech |
|---------|----------|------|------|
| PostgreSQL | 5432 | 5433 | pgvector/pgvector:pg16 |
| Redis | 6379 | 6380 | redis:7-alpine (AOF) |
| Backend | 8000 | 8001 | FastAPI + SQLAlchemy async |
| Worker | - | - | ARQ (Redis-backed, max 10 jobs, 300s timeout) |
| Frontend | 3000 | 3001 | Next.js 14 |
| Nginx | 80/443 | 80/443 | Reverse proxy + SSL + Let's Encrypt |

External services on host: Ollama (11434), ComfyUI (8188) via `host.docker.internal`.

### Networks
- **workstation-network**: Core service communication
- **workstation-preview-network**: Isolated sandbox containers (backend manages via Docker socket)

### Data Flow
```
Browser → Nginx → /api,/ws → Backend → PostgreSQL/Redis/Ollama/ComfyUI
                → /       → Frontend
```

## Kernel Architecture

The backend uses a **WorkstationKernel** singleton (`app/kernel/__init__.py`) that orchestrates four core services. Services start in registration order and shut down in reverse (LIFO). The kernel uses `asyncio.Lock` for thread-safe startup/shutdown.

### Service Registration Order (in `app/main.py` lifespan)
1. **EventBus** — Redis pub/sub event distribution, PostgreSQL event persistence, in-process subscriber callbacks, WebSocket broadcasting (registered first so other services can use it)
2. **ResourceManager** — GPU VRAM tracking (pynvml), priority-based model loading queue, LRU preemption, CPU offloading, operation state recovery via Redis
3. **ToolRegistry** — Tool registration with JSON Schema validation, permission checking, Redis result caching (5min TTL), per-chat sequential execution queues, LRU eviction (100 results/chat)
4. **ContextManager** — Conversation/project/user preference caching via Redis, token usage tracking with 80% threshold compaction trigger
5. **OllamaClient** — LLM chat completion via Ollama API
6. **KBIngestionService** — Document processing for knowledge base
7. **EmbeddingService** — Vector embedding generation via Ollama
8. **ComfyUIClient** — Image generation via ComfyUI
9. **SandboxManager** — Docker container sandbox lifecycle management

### Key Patterns
- All services extend `BaseKernelService` (ABC in `app/kernel/base.py`) with `startup()`, `shutdown()`, `health_check()` lifecycle
- After startup, the kernel runs `_recover_operations()` to restore in-flight operations from Redis
- The WebSocket `ConnectionManager` is connected to the EventBus after kernel startup for real-time event broadcasting
- `ContextManager.trigger_compaction()` does a local import: `from app.kernel import WorkstationKernel` — patch target for tests is `app.kernel.WorkstationKernel`, not `app.kernel.context_manager.WorkstationKernel`

### Adding a New Kernel Tool
1. Subclass `BaseTool` from `app/kernel/tool_base.py`
2. Implement `name`, `description`, `parameters_schema` (JSON Schema), `required_permissions`, and `async execute()`
3. Register via `ToolRegistry.register_tool(tool_instance)`

## API Routes

All routers mounted under `/api` prefix in `app/main.py`:

| File | Prefix | Purpose |
|------|--------|---------|
| `api/resources.py` | `/resources` | Resource CRUD, model load/unload, VRAM status |
| `api/events.py` | `/events` | Event queries, broadcasting |
| `api/tools.py` | `/tools` | Tool registration, execution, listing |
| `api/context.py` | `/context` | Conversation state, project context, preferences |
| `api/websocket.py` | `/ws` | WebSocket real-time event stream |
| `api/operations.py` | `/operations` | Operation state tracking |
| `api/admin.py` | `/admin/kernel` | Admin/debug kernel endpoints |

### WebSocket (`/api/ws`)
- JWT auth via token query parameter
- `ConnectionManager` tracks connections with `asyncio.Lock`
- Sends state snapshot on reconnection
- EventBus integration for real-time event broadcasting to connected clients

## Database

### Key Patterns
- All models inherit `UUIDMixin` (server-generated UUID v4) and `TimestampMixin` (created_at/updated_at)
- Async SQLAlchemy with asyncpg driver
- Foreign keys use `ondelete="CASCADE"`
- Soft deletion pattern: `is_deleted` flag + `deleted_at` timestamp

### Models Location
`backend/app/models/` — Import new models in `__init__.py` for Alembic detection.

### Core Models
- **User** → UserPreference (1:1), Projects (1:N)
- **Project** → Chats (1:N), KBSources (1:N)
- **Chat** → Messages (1:N), ContextCompactions (1:N)
- **KBSource** → KBChunks (1:N) with vector embeddings (1024-dim, IVFFlat index)
- **Resource** — VRAM tracking, priority, status, user lock
- **Event** — Audit log with severity, source, optional user/chat/resource foreign keys
- **AutomationAction**, **Archive**, **YoloEdit** — Supporting models

### Extensions
- `uuid-ossp`: UUID generation
- `pgvector`: Vector similarity search

### Adding a New Model
1. Create model in `backend/app/models/` inheriting `Base`, `UUIDMixin`, `TimestampMixin`
2. Add relationships with `back_populates`
3. Define indexes in `__table_args__`
4. Import in `backend/app/models/__init__.py`
5. Generate migration: `alembic revision --autogenerate -m "description"`
6. Apply: `alembic upgrade head`

## Backend Structure

```
backend/
├── app/
│   ├── main.py              # FastAPI app, lifespan, kernel init, route mounting
│   ├── auth.py              # Authentication
│   ├── database.py          # Async SQLAlchemy config
│   ├── worker.py            # ARQ worker settings
│   ├── api/                 # Route handlers
│   │   ├── resources.py
│   │   ├── events.py
│   │   ├── tools.py
│   │   ├── context.py
│   │   ├── websocket.py
│   │   ├── operations.py
│   │   └── admin.py
│   ├── kernel/              # Core service orchestration
│   │   ├── __init__.py      # WorkstationKernel singleton
│   │   ├── base.py          # BaseKernelService ABC
│   │   ├── resource_manager.py
│   │   ├── event_bus.py
│   │   ├── tool_registry.py
│   │   ├── context_manager.py
│   │   ├── tool_base.py     # BaseTool ABC
│   │   └── event_types.py   # Event type & severity constants
│   ├── models/              # ORM models (base.py has mixins)
│   └── schemas/             # Pydantic request/response schemas
├── tests/
│   ├── conftest.py          # Shared fixtures (mock_redis, mock_session_factory, kernel_instance)
│   └── kernel/
│       ├── test_helpers.py  # MockTool, model factories, assertion helpers
│       ├── test_resource_manager.py
│       ├── test_tool_registry.py
│       ├── test_event_bus.py
│       ├── test_context_manager.py
│       └── test_kernel_integration.py
├── alembic/
├── scripts/
│   ├── run_tests.sh
│   └── test_watch.sh
├── pytest.ini
├── .coveragerc
└── requirements.txt
```

## Frontend Structure

```
frontend/
├── app/
│   ├── page.tsx
│   └── layout.tsx
├── Dockerfile
├── package.json
└── tsconfig.json
```

Next.js 14 with App Router, TypeScript, React 18.

## Testing

### Fixtures (in `tests/conftest.py`)
- `mock_redis` — fakeredis async client (decode_responses=True)
- `mock_db_session` — AsyncMock for SQLAlchemy sessions
- `mock_session_factory` — async context manager yielding mock_db_session
- `mock_vram_tracker` — MagicMock with realistic VRAM defaults
- `kernel_instance` — fresh WorkstationKernel (autouse `cleanup_kernel` resets singleton between tests)

### Test Helpers (in `tests/kernel/test_helpers.py`)
- `MockTool` / `FailingTool` — configurable BaseTool implementations
- `make_resource()`, `make_chat()`, `make_message()`, `make_event()`, `make_project()`, `make_user_preference()`, `make_compaction()` — MagicMock model factories
- `assert_redis_key_exists/absent/ttl()` — Redis assertion helpers
- `wait_for_condition()`, `assert_eventually()` — async polling utilities

### Markers
| Marker | Purpose |
|--------|---------|
| `unit` | Isolated, fast tests for individual service methods |
| `integration` | Tests involving multiple services or kernel coordination |
| `slow` | Tests with background loops, timeouts, or real delays |

## CodeRabbit CLI (AI Code Review)

CodeRabbit CLI is installed in WSL (Ubuntu-24.04) and wrapped for Windows use.

```bash
coderabbit --version              # Check version
coderabbit auth status            # Check auth status
coderabbit review                 # Review current changes
coderabbit review --plain         # Detailed feedback with fix suggestions
coderabbit review --prompt-only   # Minimal output for token efficiency
```

- **Binary location:** `~/.local/bin/coderabbit` (WSL/Linux)
- **Windows wrapper:** `%USERPROFILE%\.local\bin\coderabbit.cmd`
- **Auth provider:** GitHub (blur702)
- **Requires:** WSL Ubuntu-24.04 running, `libsecret`, `gnome-keyring`, `dbus-x11`
- **Re-authenticate:** `coderabbit auth login`
- Run commands from the git repository root directory

## Environment Variables

Key variables in `.env` (copy from `.env.example`):
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `SECRET_KEY`: JWT signing key
- `OLLAMA_BASE_URL`, `COMFYUI_BASE_URL`: External service URLs
- Port mappings: `POSTGRES_PORT`, `REDIS_PORT`, `BACKEND_PORT`, `FRONTEND_PORT`, `NGINX_HTTP_PORT`, `NGINX_HTTPS_PORT`
