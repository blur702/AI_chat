# Testing Guide

Central test strategy and suite layout for AI Workstation.

## Test Pyramid

| Layer | Scope | Typical tools |
| --- | --- | --- |
| Unit | Isolated functions/services/components | `pytest`, `vitest` |
| Integration | Cross-module and API flows | `pytest`, `httpx`, React Testing Library |
| Property | Invariant/fuzz checks | `hypothesis` |
| E2E | Browser and API workflows | `playwright` |

## Where Tests Live

| Area | Paths |
| --- | --- |
| Backend unit/integration/property | `tests/backend/` |
| Legacy backend tests | `backend/tests/` |
| Frontend unit/integration | `tests/frontend/` |
| End-to-end | `tests/e2e/` |

## Backend Commands

Primary command set is maintained in [`backend/README.md`](../backend/README.md).

Common commands:

```bash
cd backend
./scripts/run_tests.sh
./scripts/run_tests.sh unit
./scripts/run_tests.sh integration
./scripts/run_tests.sh slow
pytest tests/ -v --cov=app
```

Markers (`backend/pytest.ini`):
- `unit`
- `integration`
- `slow`

Coverage:
- Threshold `80%` (`backend/.coveragerc`)
- HTML report in `backend/htmlcov/index.html`

## Frontend Commands

Primary command set is maintained in [`frontend/README.md`](../frontend/README.md).

Common commands:

```bash
cd frontend
pnpm test
pnpm test:watch
pnpm type-check
pnpm lint
```

## E2E Test Suites

Playwright specs live in `tests/e2e/specs/`:

| Suite | Path | What it covers |
| --- | --- | --- |
| API | `api/` | Auth flows, kernel health, projects CRUD, security, UI components |
| UI | `ui/` | Login, chat, projects, settings, workspace, studio, notes export, console audit |
| A11y | `a11y/` | Keyboard navigation, ARIA roles, screen reader compat |
| Visual | `visual/` | Screenshot regression for login and chat |
| Performance | `performance/` | Core Web Vitals thresholds |
| Responsive | `responsive/` | Mobile and tablet layout assertions |

**Console Audit** (`ui/console-audit.spec.ts`): visits every app route (login, projects, chat, notes, studio, settings, admin, MCP, drupal, palettes, workspace), captures `console.error` and `pageerror`, clicks through major interactive elements, and asserts zero unexpected JavaScript errors.

Run E2E:

```bash
cd tests/e2e
BASE_URL=https://ssdd.kevinalthaus.com npx playwright test --no-deps
```

## CI Workflows

Automation runs from GitHub Actions in `.github/workflows/`:
- Backend tests and coverage
- Frontend checks (lint/type-check/test/build)
- Security checks
- Performance checks
- Playwright E2E

## Testing Standards

- Add tests with every behavior change.
- Mark backend tests with the correct marker.
- Mock external dependencies in unit tests (Ollama, ComfyUI, Redis, network).
- Keep E2E focused on user-critical flows.

## Related Docs

- Docs hub: [`docs/README.md`](./README.md)
- Architecture: [`docs/architecture.md`](./architecture.md)
- Troubleshooting: [`docs/troubleshooting.md`](./troubleshooting.md)
