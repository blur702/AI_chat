# AI Workstation — Traycer Implementation Plan

## Project Context

AI Workstation is a containerized AI development environment with LLM integration (Ollama), image generation (ComfyUI), and isolated sandbox environments. It uses Docker Compose orchestration with a microservices architecture.

**Stack**: FastAPI + SQLAlchemy async + Redis + ARQ worker (backend), pnpm monorepo with Next.js 14 (frontend), PostgreSQL with pgvector, Nginx reverse proxy.

**What exists and works**: Auth (JWT), kernel services (ResourceManager, EventBus, ToolRegistry, ContextManager), database schema (all models including Chat, Message, Project, KBSource, KBChunk, Resource, Event), Docker orchestration, frontend shell (chat UI with mock data, sandbox IDE with mock terminal/file explorer), API hooks (useAuth, useWebSocket, useConversation, useResources, useTools — most built but not wired to real data).

**What's missing**: Everything that makes it an actual AI workstation — LLM chat, knowledge base, sandbox execution, real-time data flow, CRUD operations. The foundation is solid; the features are hollow.

---

## Codebase Conventions (MUST follow)

### Backend Conventions

**Route files** (`backend/app/api/*.py`):
- `router = APIRouter(prefix="/prefix", tags=["tag"])`
- Auth: `payload: dict = Depends(get_current_user_payload)`, extract `user_id = payload.get("user_id")`
- DB: `db: AsyncSession = Depends(get_db_session)`
- Services: `Depends(get_service_name)` — dependency functions defined in `main.py` or the route file
- Errors: `raise HTTPException(status_code=status.HTTP_4XX, detail="message")`
- Access control: Private `_validate_*_access()` helpers that query ownership via JOIN and raise 403/404
- Mount in `main.py`: `app.include_router(router, prefix="/api")`

**Kernel services** (`backend/app/kernel/*.py`):
- Extend `BaseKernelService` (ABC in `kernel/base.py`)
- Implement: `name` property, `is_running` property, `startup()`, `shutdown()`, `health_check() -> Tuple[bool, str]`
- Constructor takes `session_factory` and optional `redis_client`
- Idempotent startup (check `self._running`)
- Redis key naming: `"{service}:{entity}:{id}"` (e.g., `"context:conversation:{chat_id}"`)
- Cross-service access: local import `from app.kernel import WorkstationKernel`, then `kernel.get_service("service_name")`
- Register in `main.py` lifespan in order (services start in registration order, shut down in reverse)

**Schemas** (`backend/app/schemas/*.py`):
- Pydantic v2 `BaseModel` with `Field(...)` descriptions
- Naming: `{Entity}CreateRequest`, `{Entity}Response`, `{Entity}UpdateRequest`
- Enums: `class Status(str, Enum)`
- Include `model_config = {"json_schema_extra": {"example": {...}}}`

**ORM models** (`backend/app/models/*.py`):
- Inherit `UUIDMixin, TimestampMixin, Base`
- Use `Mapped[type]` with `mapped_column()`
- Foreign keys: `ForeignKey("table.id", ondelete="CASCADE")`
- Relationships: `relationship("Model", back_populates="field")`
- Soft delete: `is_deleted` bool + `deleted_at` datetime, filter with `.where(Model.is_deleted == False)`
- Import new models in `models/__init__.py` for Alembic detection
- Indexes in `__table_args__`

**Worker tasks** (`backend/app/worker.py`):
- Async functions: `async def task_name(ctx, param: type) -> ReturnType`
- Register in `WorkerSettings.functions` list
- Redis settings from `REDIS_URL` env var
- `max_jobs = 10`, `job_timeout = 300`

### Frontend Conventions

**Monorepo** (`frontend/`):
- `packages/api` — `WorkstationClient` singleton (`getClient()`), React hooks, TypeScript types
- `packages/ui` — shadcn/ui components, Tailwind config, ThemeProvider
- `apps/chat` — Next.js 14, port 3001, chat interface
- `apps/sandbox` — Next.js 14, port 3002, IDE interface
- Packages have **no build step** — transpiled by consuming apps via `transpilePackages`

**API client** (`packages/api/client.ts`):
- Methods on `WorkstationClient` class, use `this.request<T>(path, options)`
- Request bodies use `satisfies TypeName` for type safety
- Export from `packages/api/index.ts`

**Types** (`packages/api/types/*.ts`):
- Mirror backend Pydantic schemas exactly, preserve snake_case field names
- Barrel export from `types/index.ts`
- Interfaces, not types

**Hooks** (`packages/api/hooks/*.ts`):
- React Context + Provider for global state (auth, websocket)
- `useState` + `useEffect` + `useCallback` for data fetching
- Return typed objects: `{ data, loading, error, refresh, ...actions }`
- Export from `hooks/index.ts`

**Components**:
- `"use client"` directive for interactive components
- shadcn/ui style: `cva` variants, `cn()` utility, `forwardRef`, `displayName`
- Tailwind CSS with semantic color variables (`bg-background`, `text-foreground`, `bg-primary`)
- Responsive: `useBreakpoint()` hook, conditional mobile/desktop rendering
- Accessibility: ARIA attributes, keyboard handlers, semantic HTML

**Styling**:
- HSL CSS variables for theming (dark/light via `class` attribute)
- Custom utilities: `.touch-target`, `.mobile-hide`, `.typography-h1`
- Border radius tokens: `rounded-button` (4px), `rounded-input` (8px), `rounded-dialog` (12px)
- Transition tokens: `duration-shortest` (150ms), `duration-short` (250ms), `duration-standard` (300ms)

---

## Phase 1: LLM Chat Integration (Critical Path)

**Goal**: Make the chat actually work — user sends a message, Ollama generates a streaming response, messages persist to the database.

### 1.1 Ollama Service (Backend Kernel Service)

**Create** `backend/app/kernel/ollama_service.py`

A new kernel service that wraps the Ollama HTTP API.

```
class OllamaService(BaseKernelService):
    name = "ollama"

    Methods:
    - chat_completion(model, messages, stream=True) -> AsyncGenerator[str, None]
      POST to {OLLAMA_BASE_URL}/api/chat with streaming
    - list_models() -> list[ModelInfo]
      GET {OLLAMA_BASE_URL}/api/tags
    - pull_model(model_name) -> AsyncGenerator[PullProgress, None]
      POST {OLLAMA_BASE_URL}/api/pull with streaming progress
    - health_check() -> Tuple[bool, str]
      GET {OLLAMA_BASE_URL}/api/tags, return (True, "ok") or (False, error)

    Config:
    - OLLAMA_BASE_URL from env (default: http://ollama:11434)
    - Use httpx.AsyncClient for HTTP (already in requirements)
    - Timeout: 120s for chat, 600s for pull
```

Register in `main.py` lifespan after ContextManager.

### 1.2 Chat CRUD Endpoints (Backend API)

**Create** `backend/app/api/chats.py`

```
Router prefix: /context/chats

Endpoints:
- POST /                          Create new chat in a project
- GET /                           List user's chats (across projects, paginated)
- GET /{chat_id}                  Get single chat with recent messages
- PATCH /{chat_id}                Update chat title
- DELETE /{chat_id}               Soft delete chat
- POST /{chat_id}/messages        Send a message, get streaming LLM response (SSE)
- GET /{chat_id}/messages         Get message history (paginated, cursor-based)
```

**The critical endpoint is `POST /{chat_id}/messages`**:

The caller supplies an optional `message_id` (UUID); the server uses upsert
semantics on that ID so retries are idempotent.

1. Validate chat access (user owns the project that owns the chat)
2. Create/upsert a `Message` record with the provided (or generated)
   `message_id` and `status: "streaming"` so ContextManager can track
   partial token usage.
3. Build prompt: system prompt + conversation history from ContextManager
4. Call `OllamaService.chat_completion()` with streaming
5. Return SSE (Server-Sent Events) stream: `text/event-stream`
6. As tokens arrive, append them to the DB record in batches (flush every
   ~50 tokens or 2 s, whichever comes first) so partial content survives
   crashes.
7. **On normal completion**: mark the record `status: "completed"`, persist
   final token counts, update ContextManager token totals, and publish
   `message.created` via EventBus.
8. **On Ollama connection drop or client disconnect**: leave the record with
   `status: "streaming"`, persist the last known token usage and final
   chunk, allowing a future retry/resume path using the same `message_id`.
9. **On DB save failure**: log the error and retry asynchronously (e.g.,
   enqueue a short-lived ARQ task) but continue the SSE stream to avoid
   interrupting the client.
10. **Hard generation timeout** (default 120 s): emit an SSE `timeout` event,
    finalize the DB record with `status: "timeout"` and the token usage
    accumulated so far.  The upsert-by-`message_id` semantics ensure the
    same request is not double-counted.

SSE format:
```
event: token
data: {"content": "Hello"}

event: token
data: {"content": " world"}

event: done
data: {"message_id": "uuid", "total_tokens": 150}

event: timeout
data: {"message_id": "uuid", "total_tokens": 83, "detail": "Generation timed out after 120s"}

event: error
data: {"detail": "Model not available"}
```

**Create** `backend/app/schemas/chat.py`:
- `ChatCreateRequest(project_id: UUID, title: Optional[str], model: Optional[str])`
- `ChatResponse(id, project_id, title, model, created_at, updated_at, message_count)`
- `ChatListResponse(chats: list[ChatResponse], total: int, has_more: bool)`
- `MessageCreateRequest(content: str, role: str = "user")`
- `MessageResponse(id, chat_id, role, content, model, token_count, created_at)`
- `MessageListResponse(messages: list[MessageResponse], has_more: bool, cursor: Optional[str])`

### 1.3 Frontend Chat Wiring

**Modify** `packages/api/client.ts` — add methods:
- `createChat(projectId, title?, model?): Promise<ChatResponse>`
- `listChats(projectId?): Promise<ChatListResponse>`
- `deleteChat(chatId): Promise<void>`
- `sendMessage(chatId, content): EventSource` (SSE streaming)
- `getMessages(chatId, cursor?, limit?): Promise<MessageListResponse>`

**Modify** `packages/api/hooks/use-conversation.ts`:
- Replace mock `sendMessage` with real SSE streaming
- Accumulate tokens into assistant message as they arrive
- Handle `done` event to finalize message
- Handle `error` event to show error state

**Modify** `apps/chat/components/message-thread.tsx`:
- Remove `MOCK_MESSAGES` fallback
- Show streaming tokens in real-time (character-by-character message growth)
- Add typing indicator during streaming

**Modify** `apps/chat/app/chat/layout.tsx` sidebar:
- Replace hardcoded chat list with `useChats()` hook
- Wire "New Chat" button to `createChat()` → navigate to new chat
- Add delete/rename actions to chat items

**Create** `packages/api/types/chat.ts` — TypeScript interfaces mirroring the schemas above.

**Create** `packages/api/hooks/use-chats.ts`:
- `useChats(projectId?)` — list, create, delete chats
- Returns `{ chats, loading, createChat, deleteChat, refresh }`

### 1.4 Model Selection

**Modify** chat UI to include model selector:
- Dropdown in chat header showing available models from `OllamaService.list_models()`
- Default model configurable per project or user preference
- Store selected model on Chat record

**Create** `packages/api/hooks/use-models.ts`:
- `useModels()` — fetches available models, caches result
- Returns `{ models, loading, refresh }`

---

## Phase 2: Chat & Project CRUD

**Goal**: Users can create, manage, and organize chats and projects instead of seeing mock data.

### 2.1 Project CRUD Endpoints

**Create** `backend/app/api/projects.py`

```
Router prefix: /context/projects

Endpoints:
- POST /                          Create project
- GET /                           List user's projects (paginated)
- GET /{project_id}               Get project with stats (chat count, KB source count)
- PATCH /{project_id}             Update project (name, description, settings)
- DELETE /{project_id}            Soft delete project and cascade to chats
```

**Create** `backend/app/schemas/project.py`:
- `ProjectCreateRequest(name: str, description: Optional[str])`
- `ProjectResponse(id, name, description, created_at, chat_count, kb_source_count)`
- `ProjectListResponse(projects: list[ProjectResponse], total: int)`
- `ProjectUpdateRequest(name: Optional[str], description: Optional[str])`

### 2.2 Frontend Project Management

**Create** `packages/api/hooks/use-projects.ts`:
- `useProjects()` — CRUD operations
- Returns `{ projects, loading, createProject, updateProject, deleteProject }`

**Modify** chat app to show real projects:
- Project selector in sidebar or navigation
- "New Project" creates a project → navigates to it
- Project settings page

### 2.3 Wire Real-time Status

**Modify** `apps/chat/components/system-status-bar.tsx`:
- Connect `useResources()` hook to show real VRAM usage
- Connect `useWebSocket()` to receive live updates
- Replace hardcoded "33%" with actual data

---

## Phase 3: Knowledge Base / RAG Pipeline

**Goal**: Users can upload documents, chunk and embed them, and the LLM can search them during chat.

### 3.1 Document Processing Service

**Create** `backend/app/kernel/kb_service.py`

```
class KnowledgeBaseService(BaseKernelService):
    name = "knowledge_base"

    Methods:
    - ingest_source(source_id, file_path_or_url, project_id) -> None
      Parse document (PDF, MD, TXT, code files), chunk with overlap, generate embeddings
    - search(query, project_id, top_k=5) -> list[ChunkResult]
      Embed query via Ollama, vector similarity search against KBChunk
    - delete_source(source_id) -> None
      Remove source and all chunks

    Chunking:
    - Text: 512 token chunks, 64 token overlap
    - Code: function/class-level splitting

    Embeddings:
    - Use Ollama embeddings API: POST /api/embeddings
    - Model: nomic-embed-text (1024-dim, matches existing pgvector schema)
```

### 3.2 KB API Endpoints

**Create** `backend/app/api/knowledge_base.py`

```
Router prefix: /context/kb

Endpoints:
- POST /{project_id}/sources           Upload/add a KB source (file upload or URL)
- GET /{project_id}/sources            List KB sources for a project
- DELETE /{project_id}/sources/{id}    Delete a KB source and its chunks
- GET /{project_id}/sources/{id}       Get source details with chunk count
- POST /{project_id}/search            Semantic search across project KB
- GET /{project_id}/sources/{id}/status Get ingestion status
```

#### Upload Security Controls (POST /{project_id}/sources)

The upload handler **must** enforce the following:

1. **Size quotas**: 50 MB per file, 1 GB per project, per-user aggregate quota.
   Reject with HTTP 413 when exceeded.
2. **MIME validation**: check file headers (magic bytes) against an explicit
   whitelist (PDF, MD, TXT, common code files) — do not rely solely on
   extensions.
3. **Filename sanitization**: strip path-traversal sequences (`../`), NUL
   bytes, and limit length to 255 chars.  Use `{source_id}_{sanitized_name}`
   for on-disk storage.
4. **Staged storage**: write uploads to a temporary staging directory; move to
   permanent storage only after validation passes.
5. **Content validation**: run structural checks (e.g., PDF header, UTF-8
   for text) and optional malware scanning before processing.
6. **Upload rate limiting**: apply per-user throttling (e.g., 10/hour per
   project) to prevent DoS.  Return HTTP 429 with `Retry-After`.
7. **Audit logging**: log every upload attempt (success or violation) with
   user, project, filename, and reason for rejection.

#### SSRF Prevention (URL sources)

When `POST /{project_id}/sources` accepts a URL instead of a file upload,
implement a `validate_and_fetch_source_url(url)` helper:

1. **Scheme whitelist**: only `http` and `https`.  Reject `file:`, `ftp:`,
   `gopher:`, etc.
2. **DNS resolution + IP blocking**: resolve the hostname, then reject if
   the resolved IP falls in private (10/8, 172.16/12, 192.168/16),
   loopback (127/8), link-local (169.254/16), or cloud-metadata ranges
   (169.254.169.254).
3. **DNS rebinding protection**: issue the HTTP request **by IP** with the
   original hostname in the `Host` header.
4. **Redirect limit**: follow at most 3 redirects, re-validating each
   target IP.
5. **Timeout**: 10 s request timeout.
6. **Content-Type check**: accept only expected document MIME types before
   persisting the source.
7. Return a clear HTTP 4xx error when any validation fails.

### 3.3 Worker Tasks for Ingestion

**Modify** `backend/app/worker.py`:
- Add `ingest_kb_source(ctx, source_id: str)` task
- Calls `KnowledgeBaseService.ingest_source()` in background
- Updates source status (processing → ready / error)
- Publishes EventBus event on completion

### 3.4 RAG Integration in Chat

**Modify** the chat message endpoint (`POST /{chat_id}/messages`):
- Before calling Ollama, search the project's KB for relevant context
- Inject top-k chunks into the system prompt as context
- Include source attribution in the response metadata

### 3.5 Frontend KB Management

**Create** `packages/api/hooks/use-knowledge-base.ts`:
- `useKnowledgeBase(projectId)` — upload, list, delete sources, search
- File upload with progress tracking

**Create** KB management UI in chat app:
- Project settings → Knowledge Base tab
- Upload files (drag & drop)
- List sources with status (processing/ready/error)
- Delete sources

---

## Phase 4: Sandbox Backend Integration

**Goal**: The sandbox IDE connects to real backend services for terminal execution, file management, and chat.

### 4.1 Sandbox Execution Service

**Create** `backend/app/kernel/sandbox_service.py`

```
class SandboxService(BaseKernelService):
    name = "sandbox"

    Methods:
    - create_container(project_id, image="python:3.12-slim") -> ContainerInfo
      Create isolated Docker container on preview network
    - exec_command(container_id, command) -> AsyncGenerator[str, None]
      Execute command in container, stream stdout/stderr
    - destroy_container(container_id) -> None
    - list_files(container_id, path="/workspace") -> list[FileEntry]
    - read_file(container_id, path) -> str
    - write_file(container_id, path, content) -> None
    - health_check() -> Tuple[bool, str]

    Uses Docker socket (mounted in docker-compose.yml) via aiodocker
    Containers attach to workstation-preview-network (isolated)

    Security Constraints (mandatory):
    1. Per-container resource limits: CPU (cpu_quota 50000 = 50% core),
       memory (512 MB default), disk quota via tmpfs size limit.
    2. Security options: --security-opt no-new-privileges,
       read-only root filesystem (mount /tmp and /workspace as writable),
       user namespace remapping where supported.
    3. Seccomp profile: apply the default Docker seccomp profile at minimum;
       consider a custom restrictive profile blocking mount, reboot,
       kexec_load, etc.
    4. Volume mount policy: only bind-mount the per-project named volume
       to /workspace; deny all host-path mounts.  Maintain a base-image
       whitelist (python:3.12-slim, node:20-slim, etc.) — reject
       unlisted images.
    5. Capability dropping: cap_drop ALL, cap_add only CHOWN, SETUID,
       SETGID, DAC_OVERRIDE, FOWNER (minimum needed for package managers).
    6. Audit logging: log every container create/exec/destroy event with
       user_id, project_id, container_id, timestamp, and command (for exec).

    Auto-cleanup lifecycle:
    - "Inactivity" is defined as the later of: last WebSocket activity
      timestamp and last exec_command timestamp.
    - Grace / warning policy: emit a WebSocket warning event at 25 min
      idle ("Container will be cleaned up in 5 minutes"); perform cleanup
      at 30 min idle.
    - Long-running process handling: before cleanup, check for active
      processes (e.g., running servers, training jobs).  If detected,
      extend by one grace period and emit a user-facing prompt requiring
      opt-in to keep alive or graceful shutdown.
    - Data persistence: on cleanup, optionally auto-save /workspace to
      the project's persistent volume (opt-in, with clear commit
      semantics — snapshot only, no incremental sync).
    - Resource caps:
      - Max concurrent containers per user: 3
      - Max concurrent containers per project: 1
      - Absolute max lifetime per container: 8 hours (hard kill regardless
        of activity)
      - Memory / CPU limits as above
    - Cleanup scope: destroy the container; preserve the named volume
      (sandbox-{project_id}) and the preview network.  Only remove
      volumes on explicit project deletion.
    - Recommended defaults: warn at 25 min, cleanup at 30 min idle,
      8 h hard limit, track websocket + exec activity, opt-in auto-save.
```

### 4.2 Sandbox API Endpoints

**Create** `backend/app/api/sandbox.py`

```
Router prefix: /sandbox

Endpoints:
- POST /containers                    Create a sandbox container for a project
- DELETE /containers/{container_id}   Destroy container
- GET /containers/{container_id}      Get container status
- WebSocket /containers/{container_id}/terminal   Interactive terminal (bidirectional)
- GET /containers/{container_id}/files?path=      List directory
- GET /containers/{container_id}/files/content?path=  Read file
- PUT /containers/{container_id}/files/content?path=  Write file
```

### 4.3 Terminal WebSocket

The terminal WebSocket endpoint should:
1. Authenticate via token query param (same as existing `/api/ws/events`)
2. Attach to container's stdin/stdout/stderr
3. Support xterm.js protocol (ANSI escape sequences pass through)
4. Handle resize events from the client
5. Clean disconnect on tab close

### 4.4 Frontend Sandbox Wiring

**Modify** `apps/sandbox/components/terminal/terminal-pane.tsx`:
- Replace mock command handler with WebSocket connection to `/api/sandbox/containers/{id}/terminal`
- Wire xterm.js to WebSocket bidirectionally (xterm already in deps)

**Modify** `apps/sandbox/components/file-explorer/file-explorer.tsx`:
- Replace `MOCK_FILE_TREE` with real file listing from API
- Add create/rename/delete file/folder operations

**Modify** `apps/sandbox/components/editor/monaco-editor.tsx`:
- Load file content from API on file select
- Save file content on Cmd/Ctrl+S

**Modify** `apps/sandbox/components/chat-panel.tsx`:
- Connect to same chat API as the chat app
- Support sending messages and receiving streaming responses

---

## Phase 5: Real-time Event Wiring

**Goal**: WebSocket infrastructure (already built) feeds live data to all UI components.

### 5.1 Backend Event Publishing

Ensure all operations publish events via EventBus:
- Chat: `message.created`, `message.streaming`, `chat.created`, `chat.deleted`
- KB: `kb.source.ingesting`, `kb.source.ready`, `kb.source.error`
- Sandbox: `sandbox.container.created`, `sandbox.container.destroyed`
- Resources: `resource.loaded`, `resource.unloaded`, `vram.updated`

### 5.2 Frontend Event Consumption

**Modify** `apps/chat/app/providers.tsx`:
- Add `WebSocketProvider` wrapping the app
- Subscribe to relevant events

**Modify** individual components to use `useWebSocket().subscribe()`:
- `SystemStatusBar` → subscribe to `vram.updated`, `resource.*`
- `ChatSidebar` → subscribe to `chat.created`, `chat.deleted` for live list updates
- `MessageThread` → subscribe to `message.streaming` for multi-device sync
- `SandboxStatusBar` → subscribe to `sandbox.container.*`

---

## Phase 6: Background Worker Tasks

**Goal**: ARQ worker handles async processing instead of blocking API requests.

### 6.1 Worker Task Definitions

**Modify** `backend/app/worker.py` — add real tasks:

```python
functions = [
    ingest_kb_source,          # Document chunking + embedding
    generate_embeddings_batch, # Batch embedding generation
    compact_conversation,      # Context window compaction (already has ContextManager.trigger_compaction)
    cleanup_stale_containers,  # Destroy idle sandbox containers
    sync_ollama_models,        # Periodic model availability sync
]
```

### 6.2 Task Scheduling

- `cleanup_stale_containers`: run every 5 minutes via ARQ cron
- `sync_ollama_models`: run every 60 seconds via ARQ cron
- `compact_conversation`: triggered when token usage exceeds 80% threshold (existing logic)
- `ingest_kb_source`: enqueued on source upload
- `generate_embeddings_batch`: enqueued by ingestion pipeline

---

## Phase 7: Polish & Production Readiness

### 7.1 Settings Page

**Modify** `apps/chat/app/settings/page.tsx`:
- Profile editing (display name, avatar)
- Default model selection
- Notification preferences
- API key management (if applicable)

### 7.2 API Route Tests

**Create** `backend/tests/api/` directory with tests for:
- `test_auth.py` — login, register, token refresh, invalid credentials
- `test_chats.py` — CRUD, access control, message sending
- `test_projects.py` — CRUD, ownership validation
- `test_knowledge_base.py` — upload, search, deletion
- `test_sandbox.py` — container lifecycle, file operations

Follow existing test patterns from `tests/kernel/`:
- Use `mock_redis`, `mock_db_session`, `mock_session_factory` fixtures
- Use `MockTool`, `make_*()` factories from `test_helpers.py`
- Mark with `@pytest.mark.unit` or `@pytest.mark.integration`

### 7.3 Error Handling Improvements

- Add global exception handler in `main.py` for unhandled errors
- Structured error responses: `{"detail": "message", "code": "ERROR_CODE"}`
- Rate limiting on auth endpoints (prevent brute force)

### 7.4 Expanded Rate Limiting

Current rate limiting covers auth endpoints only.  Extend with
Redis-backed sliding-window counters for the following endpoints:

| Endpoint | Default Limit | Key |
|----------|--------------|-----|
| `POST /context/conversations/{chat_id}/messages` | 20/min | per user |
| `POST /kb/sources` | 10/hour | per project |
| `POST /kb/search` | 60/min | per project |
| `POST /sandbox/containers` | 5/hour | per project |
| `POST /api/pull` | 3/hour | per user |

Implementation requirements:
- Reuse the existing `rate_limit()` decorator from `middleware/rate_limit.py`.
- Return HTTP 429 with `Retry-After` header when limits are exceeded.
- Support tier-based limits: read user/project tier from JWT claims or DB
  and multiply the default limits accordingly (e.g., `pro` tier gets 2x).
- Emit structured logs for every rate-limit violation (user/project ID,
  endpoint, limit, window) for monitoring and abuse detection.

---

## File Creation/Modification Summary

### New Files to Create
```
backend/app/kernel/ollama_service.py          Phase 1 — Ollama API wrapper
backend/app/kernel/kb_service.py              Phase 3 — Knowledge base service
backend/app/kernel/sandbox_service.py         Phase 4 — Sandbox container management
backend/app/api/chats.py                      Phase 1 — Chat CRUD + streaming
backend/app/api/projects.py                   Phase 2 — Project CRUD
backend/app/api/knowledge_base.py             Phase 3 — KB endpoints
backend/app/api/sandbox.py                    Phase 4 — Sandbox endpoints
backend/app/schemas/chat.py                   Phase 1 — Chat/message schemas
backend/app/schemas/project.py                Phase 2 — Project schemas
backend/app/schemas/knowledge_base.py         Phase 3 — KB schemas
backend/app/schemas/sandbox.py                Phase 4 — Sandbox schemas
frontend/packages/api/types/chat.ts           Phase 1 — Chat types
frontend/packages/api/types/project.ts        Phase 2 — Project types
frontend/packages/api/types/knowledge-base.ts Phase 3 — KB types
frontend/packages/api/types/sandbox.ts        Phase 4 — Sandbox types
frontend/packages/api/hooks/use-chats.ts      Phase 1 — Chat list hook
frontend/packages/api/hooks/use-models.ts     Phase 1 — Model list hook
frontend/packages/api/hooks/use-projects.ts   Phase 2 — Project CRUD hook
frontend/packages/api/hooks/use-knowledge-base.ts  Phase 3 — KB hook
frontend/packages/api/hooks/use-sandbox.ts    Phase 4 — Sandbox hook
backend/tests/api/test_chats.py               Phase 7 — Chat tests
backend/tests/api/test_projects.py            Phase 7 — Project tests
backend/tests/api/test_knowledge_base.py      Phase 7 — KB tests
backend/tests/api/test_sandbox.py             Phase 7 — Sandbox tests
```

### Existing Files to Modify
```
backend/app/main.py                           Phases 1-4 — Register services, mount routers
backend/app/worker.py                         Phases 3,6 — Add real worker tasks
backend/app/models/__init__.py                If new models needed
frontend/packages/api/client.ts               Phases 1-4 — Add API methods
frontend/packages/api/types/index.ts          Phases 1-4 — Re-export new types
frontend/packages/api/hooks/index.ts          Phases 1-4 — Re-export new hooks
frontend/packages/api/hooks/use-conversation.ts  Phase 1 — Real SSE streaming
frontend/apps/chat/app/chat/layout.tsx        Phase 1 — Real sidebar data
frontend/apps/chat/app/chat/[chatId]/page.tsx Phase 1 — Model selector
frontend/apps/chat/components/message-thread.tsx  Phase 1 — Remove mocks, add streaming
frontend/apps/chat/app/providers.tsx          Phase 5 — Add WebSocketProvider
frontend/apps/chat/components/system-status-bar.tsx  Phase 5 — Live data
frontend/apps/sandbox/components/terminal/terminal-pane.tsx   Phase 4 — Real terminal
frontend/apps/sandbox/components/file-explorer/file-explorer.tsx  Phase 4 — Real files
frontend/apps/sandbox/components/editor/monaco-editor.tsx     Phase 4 — Real file I/O
frontend/apps/sandbox/components/chat-panel.tsx               Phase 4 — Real chat
```

### Dependencies to Add
```
backend/requirements.txt:
  httpx           (async HTTP client for Ollama API — may already exist)
  aiodocker       (Docker API for sandbox containers)
  python-multipart (file upload support — may already exist)
  tiktoken        (token counting for context management)

frontend (if needed):
  No new deps — xterm.js, Monaco, react-resizable-panels already installed
```

---

## Implementation Order Rationale

1. **Phase 1 (LLM Chat)** first because it's the core value proposition — without it, there's no AI workstation
2. **Phase 2 (CRUD)** next because users need to organize their work before advanced features
3. **Phase 3 (KB/RAG)** follows because it builds on the chat pipeline (augments prompts with context)
4. **Phase 4 (Sandbox)** is parallel-safe with Phase 3 but more infrastructure-heavy
5. **Phase 5 (Real-time)** wires everything together for a cohesive experience
6. **Phase 6 (Workers)** moves heavy operations off the request path
7. **Phase 7 (Polish)** fills remaining gaps for production readiness

Each phase is independently deployable and testable. Phase 1 alone transforms the app from a mock to a working chat interface.
