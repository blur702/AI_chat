# CLAUDE.md

Agent-facing notes for Claude Code.

## Source of Truth

Use these docs first:
- `README.md` (system setup and run commands)
- `backend/README.md` (backend dev/test commands)
- `nginx/README.md` (proxy and TLS)

Avoid duplicating architecture and endpoint tables here.

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
```

## Notes

- Primary app endpoint is through Nginx (`http://localhost` / `https://localhost`).
- Backend direct endpoint is `http://localhost:8001` by default.
- Keep this file concise and non-duplicative; update core docs instead.

## Drupal (kevinalthaus.com)

- Production Drupal site for `kevinalthaus.com` is connected to this workspace.
- Infrastructure, access details, credentials, server paths, and host-level operations are documented in a restricted operations runbook.
- Use secret-manager/environment variables for runtime credentials (`DRUPAL_VPS_*`, `VPS_DB_*`).
- Contact ops for infrastructure-specific details and production access workflows.

## Brevo (Email/SMS)

- Backend service `brevo_client` — reads `BREVO_API_KEY` or decodes from `BREVO_MCP_TOKEN`
- API routes at `/api/brevo/*` (account, contacts, email/send, sms/send, templates, campaigns)
- SMS default recipient configured via `SMS_DEFAULT_RECIPIENT` env var
