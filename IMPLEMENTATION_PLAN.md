# App Improvement Plan (Execution)

## Phase 1: Security Baseline
- [x] Enforce a non-default `SECRET_KEY` requirement in backend runtime.
- [x] Support HttpOnly cookie auth for browser sessions (while keeping Bearer compatibility).
- [x] Add explicit logout endpoint to clear auth cookie.
- [x] Update frontend API client and auth hook to stop persisting token in `localStorage`.

Success criteria:
- Backend fails fast on insecure/missing JWT secret.
- Browser auth works without relying on `localStorage`.
- Logout clears server-issued session cookie.

## Phase 2: Deployment and Ops Hardening
- [x] Parameterize GPU device IDs in `docker-compose.yml`.
- [x] Add `docker-compose.prod.yml` with production-safe defaults.

Success criteria:
- GPU selection is configurable via environment variables.
- Production deployment has explicit secure overrides.

## Phase 3: CI Quality Gates
- [x] Add frontend CI workflow for lint, type-check, tests, and build.

Success criteria:
- Pull requests affecting frontend run automated quality checks.

## Validation
- [x] Run targeted grep/consistency checks for changed auth/session paths.
- [x] Run lightweight test/verification commands where feasible.
