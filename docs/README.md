# Documentation Hub

This is the canonical entry point for project documentation.

## Start Here

- Platform setup and quick start: [`README.md`](../README.md)
- First-day setup and workflows: [`docs/onboarding.md`](./onboarding.md)
- System architecture and data flow: [`docs/architecture.md`](./architecture.md)

## Developer Workflows

- Backend development and tests: [`backend/README.md`](../backend/README.md)
- Frontend development and tests: [`frontend/README.md`](../frontend/README.md)
- Full test strategy and CI notes: [`docs/testing.md`](./testing.md)
- Troubleshooting common failures: [`docs/troubleshooting.md`](./troubleshooting.md)

## Operations

- Security controls and deployment checklist: [`docs/security-and-deployment.md`](./security-and-deployment.md)
- Performance guidance and monitoring targets: [`docs/performance.md`](./performance.md)
- Nginx routing and TLS setup: [`nginx/README.md`](../nginx/README.md)

## Feature-Specific Docs

- Kernel service lifecycle contract: [`backend/app/kernel/README.md`](../backend/app/kernel/README.md)
- WebSocket reconnection and recovery model: [`backend/docs/websocket_reconnection.md`](../backend/docs/websocket_reconnection.md)
- Drupal MCP remote access runbook: [`docs/drupal-mcp/DRUPAL_REMOTE_ACCESS.md`](./drupal-mcp/DRUPAL_REMOTE_ACCESS.md)
- UI component catalog: [`frontend/packages/ui/COMPONENTS.md`](../frontend/packages/ui/COMPONENTS.md)
- UI accessibility standards: [`frontend/packages/ui/ACCESSIBILITY.md`](../frontend/packages/ui/ACCESSIBILITY.md)
- UI responsive system: [`frontend/packages/ui/RESPONSIVE.md`](../frontend/packages/ui/RESPONSIVE.md)

## Agent Notes

- Agent-oriented project notes: [`CLAUDE.md`](../CLAUDE.md)

## Archive Notes

- Historical execution checklist: [`IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md)
- Archived planning prompt: [`TRAYCER_PROMPT.md`](../TRAYCER_PROMPT.md)

## Documentation Rules

- Keep one canonical owner per topic. Link to it; do not duplicate full sections elsewhere.
- Put broad platform docs under `docs/` and keep package/service `README.md` files operational.
- Validate route names, command examples, and package names against source before updating docs.
- Store credentials in environment variables or secret managers, not plaintext markdown files.
