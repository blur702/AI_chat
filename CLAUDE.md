# CLAUDE.md

Agent-facing notes for Claude Code.

## Source Of Truth

Use these docs first:
- `README.md` (system setup and run commands)
- `backend/README.md` (backend dev/test commands)
- `frontend/README.md` (frontend app/package commands)
- `nginx/README.md` (proxy and TLS)
- `docs/architecture.md` (service architecture)
- `docs/testing.md` (test strategy and suites)

Avoid duplicating full architecture and endpoint tables here.

## Minimal Working Commands

```bash
# Start stack
python scripts/startup.py
# or
docker compose up -d

# Backend tests
cd backend
./scripts/run_tests.sh

# Frontend dev
cd frontend
pnpm install
pnpm dev

# Frontend checks
pnpm --filter @workstation/chat type-check
pnpm --filter @workstation/chat test
```

## Current Frontend Surfaces

Top-level app routes in `frontend/apps/chat/app`:
- `chat`, `workspace`, `mcp`, `drupal`, `studio`
- `projects`, `notes`, `palettes`, `settings`, `admin`, `login`

Use these route names when tracing UI behavior or adding help topics.

## Current Backend Surface

The FastAPI app currently mounts routers in `backend/app/main.py` for:
- auth/users/admin
- chats/messages/context/system prompts/snippets/planning
- projects/resources/events/tools/tool-approvals
- image/comfyui/models/prompt presets/palettes
- drupal, drupal-local, studio
- notes, issues, help, websocket, operations, sandbox, automation

When APIs change, update typed client/hooks in `frontend/packages/api`.

## Help System Maintenance

Canonical seed file:
- `backend/scripts/insert_comprehensive_help_topics.py`

Operational command (runs against live backend DB):
```bash
docker exec workstation-backend python scripts/insert_comprehensive_help_topics.py
```

Coverage guardrails:
- `tests/frontend/unit/help/field-help-coverage.test.ts`
  - ensures `FieldHelp` usage has slugs
  - ensures `openHelp(...)` slugs exist
  - ensures seeded help bodies stay comprehensive

If a field or UI control is added, update both slug usage and seed topic body.

## Notes

- Primary app endpoint is through Nginx (`http://localhost` / `https://localhost`).
- Backend direct endpoint is `http://localhost:8001` by default.
- Keep this file concise and non-duplicative; update core docs instead.

## Drupal (kevinalthaus.com)

- Production Drupal site for `kevinalthaus.com` is connected to this workspace.
- Infrastructure and operational notes are tracked in restricted runbooks and local docs under `docs/drupal-mcp/`.
- Use secret-manager/environment variables for runtime credentials (`DRUPAL_VPS_*`, `VPS_DB_*`).
- Contact ops for infrastructure-specific details and production access workflows.

## Brevo (Email/SMS)

- Backend service `brevo_client` reads `BREVO_API_KEY` or decodes from `BREVO_MCP_TOKEN`.
- API routes live at `/api/brevo/*` (account, contacts, email/send, sms/send, templates, campaigns).
- SMS default recipient is configured via `SMS_DEFAULT_RECIPIENT`.
