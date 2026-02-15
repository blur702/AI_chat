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

### Frontend (pnpm Monorepo)
```bash
cd frontend
pnpm install                 # Install all workspace dependencies
pnpm dev                     # Run chat app (port 3001)
pnpm build                   # Production build
pnpm lint                    # ESLint across all packages
pnpm type-check              # TypeScript validation across all packages
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
| Ollama | 11434 | 11434 | ollama/ollama (GPU passthrough) |
| ComfyUI | 8188 | 8188 | comfyui-nvidia-docker (GPU passthrough) |
| PostgreSQL | 5432 | 5433 | pgvector/pgvector:pg16 |
| Redis | 6379 | 6380 | redis:7-alpine (AOF) |
| Backend | 8000 | 8001 | FastAPI + SQLAlchemy async (GPU: utility for pynvml) |
| Worker | - | - | ARQ (Redis-backed, max 20 jobs, 600s timeout) |
| Chat App | 3001 | 3001 | Next.js 14 (includes workspace/IDE/terminal/image-gen) |
| Nginx | 80/443 | 80/443 | Reverse proxy + SSL + Let's Encrypt |
| Certbot | - | - | Let's Encrypt certificate renewal (every 12h) |

All GPU services (Ollama, ComfyUI) run as Docker Compose services with NVIDIA GPU passthrough. Backend has `utility` GPU capability for pynvml VRAM monitoring.

### Networks
- **workstation-network**: Core service communication
- **workstation-preview-network**: Isolated sandbox containers (backend manages via Docker socket)

### Data Flow
```
Browser → Nginx → /api,/ws → Backend → PostgreSQL/Redis/Ollama/ComfyUI
                → /       → Chat App (includes workspace)
```

## Kernel Architecture

The backend uses a **WorkstationKernel** singleton (`app/kernel/__init__.py`) that orchestrates services. Services start in registration order and shut down in reverse (LIFO). The kernel uses `asyncio.Lock` for thread-safe startup/shutdown.

### Service Registration Order (in `app/main.py` lifespan)
1. **EventBus** — Redis pub/sub event distribution, PostgreSQL event persistence, in-process subscriber callbacks, WebSocket broadcasting (registered first so other services can use it)
2. **ResourceManager** — GPU VRAM tracking (pynvml), priority-based model loading queue, LRU preemption, CPU offloading, operation state recovery via Redis
3. **ToolRegistry** — Tool registration with JSON Schema validation, permission checking, Redis result caching (5min TTL), per-chat sequential execution queues, LRU eviction (100 results/chat)
4. **ContextManager** — Conversation/project/user preference caching via Redis, token usage tracking with 80% threshold compaction trigger
5. **TokenCounter** — Accurate token counting via tiktoken (cl100k_base encoding), context window lookup for known model families
6. **OllamaClient** — LLM chat completion via Ollama API
7. **KBIngestionService** — Document processing for knowledge base
8. **EmbeddingService** — Vector embedding generation via Ollama (1024-dim vectors)
9. **ComfyUIClient** — Image generation via ComfyUI
10. **SandboxManager** — Docker container sandbox lifecycle management
11. **DrupalMCPService** — Remote Drupal site management via MCP protocol, Fernet-encrypted API keys (conditional — skipped if unavailable)

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
| `api/auth.py` | `/auth` | Login, register, password management, /me |
| `api/resources.py` | `/resources` | Resource CRUD, model load/unload, VRAM status |
| `api/events.py` | `/events` | Event queries, broadcasting |
| `api/tools.py` | `/tools` | Tool registration, execution, listing |
| `api/context.py` | `/context` | Conversation state, project context, preferences |
| `api/projects.py` | `/projects` | Project CRUD |
| `api/chats.py` | `/chats` | Chat operations |
| `api/messages.py` | `/context` | Conversation state (`/conversations/{id}`), message streaming |
| `api/system_prompts.py` | `/system-prompts` | System prompt library (CRUD, set default) |
| `api/image.py` | `/image` | Image generation, status, download, listing |
| `api/kb.py` | `/kb` | Knowledge base sources, search, chunks |
| `api/sandbox.py` | `/sandbox` | Container sandbox management |
| `api/automation.py` | `/automation` | Automation action execution |
| `api/yolo.py` | `/yolo` | YoloEdit operations |
| `api/templates.py` | `/templates` | Sandbox template registry and listing |
| `api/project_import.py` | `/project-import` | Project import jobs (git clone, archive upload) |
| `api/drupal.py` | `/drupal` | Drupal site connection management |
| `api/models.py` | `/models` | LLM model listing and management |
| `api/websocket.py` | `/ws` | WebSocket real-time event stream |
| `api/operations.py` | `/operations` | Operation state tracking |
| `api/admin.py` | `/admin/kernel` | Admin kernel debug/metrics endpoints |
| `api/admin.py` | `/admin/users` | Admin user management, audit logs, unlock |

### WebSocket (`/api/ws`)
- JWT auth via token query parameter
- `ConnectionManager` tracks connections with `asyncio.Lock`
- Sends state snapshot on reconnection
- EventBus integration for real-time event broadcasting to connected clients

## Authentication & Authorization

### Auth Dependencies (`app/auth.py`)
- `get_current_user_payload()` — Extracts JWT from `Authorization: Bearer` header, returns payload dict, raises 401
- `require_admin()` — Wraps `get_current_user_payload()`, enforces `role == "admin"`, raises 403
- `get_user_id_from_token()` — Converts `user_id` claim string to UUID

### JWT Tokens
- `create_access_token()` — 30-min default, HS256
- `create_websocket_token()` — 60-min default
- Payload claims: `user_id`, `role`, `username`, `screen_name`, `exp`

### Master Users
- `MASTER_USERNAMES` frozenset configured via env var (comma-separated)
- Protected: cannot be deactivated, deleted, have role changed, or password reset by others
- `is_master_user(username)` check used in admin endpoints
- Auto-seeded on startup via `MASTER_PASSWORD` env var

### Access Validation (`app/api/context_deps.py`)
- `validate_project_access(project_id, user_id, db)` — 404 if not found, 403 if not owner
- `validate_chat_access(chat_id, user_id, db)` — Joins through project to verify ownership
- Used by image, context, and chat endpoints

### Rate Limiting (`app/middleware/rate_limit.py`)
- Redis-backed sliding window, falls back to in-memory if Redis unavailable
- Global: 600 req/60s (configurable via `GLOBAL_MAX_REQUESTS`, `GLOBAL_WINDOW_SECONDS` env vars)
- Auth-specific: `/login` 5/900s, `/register` 5/900s, `/password-reset` 3/900s
- Uses Lua scripts for atomic Redis rate limit checks
- Rate limit keys: `rate_limit:global:{ip}:{path}` — flush with `redis-cli KEYS "rate_limit:*"` then DEL

## Database

### Key Patterns
- All models inherit `UUIDMixin` (server-generated UUID v4) and `TimestampMixin` (created_at/updated_at)
- Async SQLAlchemy with asyncpg driver
- Foreign keys use `ondelete="CASCADE"`
- Soft deletion pattern: `is_deleted` flag + `deleted_at` timestamp
- Password hashing: bcrypt via passlib

### Models Location
`backend/app/models/` — Import new models in `__init__.py` for Alembic detection.

### Core Models
- **User** → UserPreference (1:1), Projects (1:N), SystemPrompts (1:N). Security fields: `failed_login_attempts`, `locked_until`, `password_reset_token/expires`
- **Project** → Chats (1:N), KBSources (1:N), DrupalSite (1:1), ProjectImports (1:N)
- **Chat** → Messages (1:N), ContextCompactions (1:N)
- **KBSource** → KBChunks (1:N) with vector embeddings (1024-dim, IVFFlat index)
- **Resource** — VRAM tracking, priority, status, user lock
- **Event** — Audit log with severity, source, optional user/chat/resource foreign keys
- **AuditLog** — Security event logging: action, status, IP, user_agent, details JSON
- **ImageGeneration** — ComfyUI job tracking: workflow_data, result_images, status
- **SystemPrompt** — Reusable system prompt templates per user (name, content, is_default, soft delete)
- **DrupalSite** — Remote Drupal site connections per project (site_url, encrypted API key, sync config)
- **ProjectImport** — Async project import jobs: git clone or archive upload (status: pending→cloning→detecting→importing→completed/failed)
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
│   ├── auth.py              # JWT auth, dependencies, security event logging
│   ├── database.py          # Async SQLAlchemy config
│   ├── worker.py            # ARQ worker settings
│   ├── api/                 # Route handlers (see API Routes table)
│   │   ├── context_deps.py  # Shared deps: project/chat access validation
│   │   ├── system_prompts.py
│   │   ├── templates.py
│   │   ├── project_import.py
│   │   ├── drupal.py
│   │   ├── models.py
│   │   └── ...
│   ├── kernel/              # Core service orchestration
│   │   ├── __init__.py      # WorkstationKernel singleton
│   │   ├── base.py          # BaseKernelService ABC
│   │   ├── resource_manager.py
│   │   ├── event_bus.py
│   │   ├── tool_registry.py
│   │   ├── context_manager.py
│   │   ├── token_counter.py # TokenCounter service (tiktoken)
│   │   ├── prompt_builder.py # Prompt assembly utility (not a service)
│   │   ├── tool_base.py     # BaseTool ABC
│   │   └── event_types.py   # Event type & severity constants
│   ├── services/            # External service clients
│   │   ├── ollama_client.py
│   │   ├── comfyui_client.py
│   │   ├── embedding_service.py
│   │   ├── kb_ingestion.py
│   │   ├── sandbox_manager.py
│   │   ├── drupal_mcp.py    # Drupal MCP protocol client
│   │   ├── project_detector.py # Auto-detect project type from file structure
│   │   ├── automation_executor.py # Execute automation actions in sandboxes
│   │   └── templates/       # Sandbox template system
│   │       ├── registry.py  # Template registry
│   │       └── definitions/ # Template JSON definitions
│   │           ├── python-blank.json, python-fastapi.json, python-flask.json
│   │           ├── node-blank.json, node-nextjs.json, node-react-vite.json
│   │           └── drupal.json + drupal/
│   ├── middleware/           # Rate limiting
│   ├── models/              # ORM models (base.py has mixins)
│   └── schemas/             # Pydantic request/response schemas
│       ├── auth.py, context.py, resource.py, event.py, tool.py
│       ├── image.py, kb.py, sandbox.py, automation.py, yolo.py, admin.py
│       ├── drupal.py, models.py, project_import.py
│       └── __init__.py
├── tests/
│   ├── conftest.py          # Shared fixtures
│   ├── test_security.py     # Security-focused tests
│   └── kernel/
│       ├── test_helpers.py  # MockTool, model factories, assertion helpers
│       └── test_*.py        # Per-service test files
├── alembic/
├── scripts/
│   ├── run_tests.sh
│   └── test_watch.sh
├── pytest.ini
├── .coveragerc
└── requirements.txt
```

## Frontend Structure

pnpm monorepo (`pnpm-workspace.yaml`) with 1 app and 2 shared packages. The chat app includes all functionality (chat, workspace/IDE, terminal, image generation, admin). Packages have **no build step** — they are consumed as TypeScript source via `transpilePackages` in the app's `next.config.js`.

```
frontend/
├── pnpm-workspace.yaml
├── package.json              # Workspace scripts: dev, build, lint, type-check
├── apps/
│   └── chat/                 # Port 3001 — All UI: chat, workspace, admin, settings
│       ├── app/              # Next.js App Router pages
│       │   ├── admin/        # Admin dashboard
│       │   ├── chat/[chatId] # Chat detail
│       │   ├── login/        # Authentication
│       │   ├── projects/     # Project listing
│       │   ├── settings/     # User settings
│       │   └── workspace/    # Integrated workspace (IDE, terminal, image gen)
│       │       └── [projectId]/
│       │           └── image-gen/
│       └── components/
│           ├── admin/        # User mgmt, audit logs, kernel debug
│           ├── chat/         # Chat UI components
│           ├── context/      # Context management UI
│           ├── resources/    # GPU resource management
│           └── workspace/    # Workspace-specific components
│               ├── chat-panel/    # Workspace chat integration
│               ├── drupal/        # Drupal MCP UI
│               ├── editor/        # Monaco editor
│               ├── events/        # Event viewer
│               ├── file-explorer/ # File browser
│               ├── image-gen/     # Image generation UI
│               ├── kb/            # Knowledge base UI
│               ├── preview/       # Sandbox preview
│               ├── resources/     # Resource management
│               ├── snapshots/     # State snapshots
│               ├── terminal/      # xterm.js terminal
│               └── tools/         # Tool execution panel
└── packages/
    ├── ui/                   # @workstation/ui — shadcn/ui components
    │   ├── index.ts          # Exports: Button, Dialog, Tabs, Badge, cn(), ThemeProvider, etc.
    │   ├── tailwind.config.ts # Shared Tailwind config (extended by apps)
    │   ├── globals.css       # CSS variables for theming
    │   └── lib/              # a11y helpers, useBreakpoint, useMediaQuery
    └── api/                  # @workstation/api — Client, types, hooks
        ├── index.ts          # Exports: WorkstationClient, getClient(), ApiError
        ├── client.ts         # HTTP client with JWT management
        ├── types/            # TypeScript types mirroring backend Pydantic schemas
        │   └── auth, context, resource, event, tool, image, kb, sandbox,
        │     automation, yolo, admin, drupal, models, project-import, terminal
        └── hooks/            # React hooks per domain
            └── use-auth, use-chats, use-projects, use-resources, use-tools,
              use-events, use-image-generation, use-knowledge-base, use-kb-sources,
              use-websocket, use-terminal-websocket, use-conversation,
              use-workspace-conversation, use-settings, use-admin, use-audit-logs,
              use-user-management, use-automation-actions, use-yolo-edits,
              use-file-explorer, use-context-dashboard, use-context-editor,
              use-drupal, use-model-switcher, use-project-import,
              use-service-status, use-system-prompts, use-templates,
              use-token-usage, use-project
```

### Frontend Key Patterns
- **Package consumption**: `transpilePackages: ["@workstation/ui", "@workstation/api"]` in next.config.js
- **Tailwind**: App extends `@workstation/ui/tailwind.config` and includes `../../packages/ui/components/**/*.tsx` in content paths
- **Auth**: `AuthProvider` context stores JWT in `localStorage` key `workstation_token`, parses claims from payload
- **401 handling**: API client auto-clears token and redirects to `/login` on 401 responses (expired tokens)
- **API client**: `getClient()` singleton; uses `NEXT_PUBLIC_API_URL` env var for base URL
- **Project auto-discovery**: Chat layout (`apps/chat/app/chat/layout.tsx`) auto-fetches user's first project from API if `workstation_chat_project_id` is not in localStorage, creating a "Default Project" if none exists. Waits for `isAuthenticated` before calling API.
- **Type safety**: `packages/api/types/` mirrors backend `schemas/` 1:1 — update both when changing API contracts

### API Route Naming Convention
- All conversation endpoints use **plural** `/conversations/{chat_id}` (not singular `/conversation/`)
- Project chat listing: `/context/project/{projectId}/chats`
- Chat CRUD: `/context/chats` and `/context/chats/{chatId}`
- Streaming: `/context/conversations/{chatId}/messages/stream`

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
- `SECRET_KEY`: JWT signing key (also used to derive Fernet key for Drupal API key encryption)
- `OLLAMA_BASE_URL`, `COMFYUI_BASE_URL`: GPU service URLs (default: `http://ollama:11434`, `http://comfyui:8188`)
- `OLLAMA_MODELS_DIR`: Host path to Ollama models (bind-mounted into container)
- `MASTER_USERNAMES`, `MASTER_PASSWORD`: Protected admin accounts (comma-separated usernames)
- `MASTER_FIRST_NAME`, `MASTER_SCREEN_NAME`: Optional display names for master users
- `CORS_ORIGINS`: Allowed CORS origins
- `NEXT_PUBLIC_API_URL`: Frontend API base URL
- `NEXT_PUBLIC_WS_URL`: Frontend WebSocket URL
- Port mappings: `POSTGRES_PORT`, `REDIS_PORT`, `BACKEND_PORT`, `CHAT_PORT`, `NGINX_HTTP_PORT`, `NGINX_HTTPS_PORT`, `OLLAMA_PORT`, `COMFYUI_PORT`

## Windows Development Notes

- Use `cp -r` not `xcopy` in bash on Windows (git bash)
- `pnpm` needs to be installed globally: `npm install -g pnpm`
