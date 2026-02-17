# Testing Guide

## Overview

The AI Workstation follows a test pyramid strategy:

| Layer         | Scope                                   | Speed   | Tools                              |
|---------------|-----------------------------------------|---------|------------------------------------|
| Unit          | Individual functions, classes, services  | Fast    | pytest, vitest                     |
| Integration   | Cross-service interactions, API routes   | Medium  | pytest, httpx                      |
| Property      | Invariant/fuzz testing                   | Medium  | hypothesis (via pytest)            |
| E2E           | Full browser workflows                  | Slow    | Playwright                         |

**Backend**: Python 3.12, pytest with asyncio, fakeredis, SQLAlchemy async test sessions.
**Frontend**: Node 20+, vitest with jsdom, @testing-library/react.

---

## Backend Testing

> Canonical reference for commands: `backend/README.md`

### Directory Structure

```
tests/backend/
  unit/
    api/           # Route handler tests
    kernel/        # Kernel service tests
    models/        # ORM model tests
    services/      # Business logic tests
  integration/     # Cross-service flow tests
  property/        # Hypothesis property-based tests
  conftest.py      # Shared fixtures (mock_redis, mock_session, etc.)
```

There is also a legacy `backend/tests/` directory with some older tests following the same marker conventions.

### Markers

Defined in `backend/pytest.ini`:

| Marker        | Purpose                                         |
|---------------|--------------------------------------------------|
| `unit`        | Isolated, fast tests with no external deps       |
| `integration` | Tests that exercise service interactions          |
| `slow`        | Tests with loops, timeouts, or real delays        |

Configuration also sets `asyncio_mode = auto`, so all async test functions are collected automatically without needing `@pytest.mark.asyncio` on every function.

### Running Tests

```bash
# Full suite via helper script
cd backend
./scripts/run_tests.sh

# Run only one marker group
./scripts/run_tests.sh unit
./scripts/run_tests.sh integration
./scripts/run_tests.sh slow

# Run pytest directly with coverage
pytest tests/ -v --cov=app

# Run a specific file
pytest tests/kernel/test_resource_manager.py

# Filter by marker
pytest tests/ -m unit -v
```

### Watch Mode

```bash
cd backend
./scripts/test_watch.sh
```

Re-runs tests on file changes. Useful during active development.

### Coverage

- **Threshold**: 80% (configured in `backend/.coveragerc`)
- **HTML report**: `backend/htmlcov/index.html`

```bash
# Generate and view coverage report
coverage report
coverage html
```

### Writing Backend Tests

**Async fixtures**: The shared conftest at `tests/backend/conftest.py` provides:

- `mock_redis` -- A `fakeredis.aioredis.FakeRedis` client with patched pubsub drain behavior.
- `mock_session` / `mock_session_factory` -- AsyncMock wrappers around SQLAlchemy sessions.
- `mock_kernel` -- A pre-configured `WorkstationKernel` instance with mock services.

**Pattern for a unit test**:

```python
import pytest
from unittest.mock import AsyncMock

@pytest.mark.unit
async def test_resource_creation(mock_session_factory, mock_kernel):
    from app.kernel import ResourceManager

    rm = ResourceManager(session_factory=mock_session_factory)
    rm._kernel = mock_kernel
    result = await rm.create_resource(name="test", type="file")
    assert result.name == "test"
```

**Key conventions**:

- Mark every test with `@pytest.mark.unit`, `@pytest.mark.integration`, or `@pytest.mark.slow`.
- Use `async def test_...` -- `asyncio_mode = auto` handles the event loop.
- Mock external services (Redis, Ollama, ComfyUI) rather than requiring live containers.
- For API route tests, use `httpx.AsyncClient` with the FastAPI `TestClient` pattern.

---

## Frontend Testing

### Tools

- **vitest** (v4) -- Test runner, configured in `frontend/vitest.config.ts`
- **@testing-library/react** (v16) -- Component rendering and queries
- **@testing-library/jest-dom** -- DOM matchers (`toBeInTheDocument`, etc.)
- **jsdom** -- Browser environment simulation

### Directory Structure

```
tests/frontend/
  unit/
    components/    # React component tests
    hooks/         # Custom hook tests
  integration/     # Multi-component interaction tests
frontend/vitest.config.ts    # Test configuration
frontend/vitest.setup.ts     # Global setup (jest-dom matchers)
```

### Configuration

The vitest config (`frontend/vitest.config.ts`) sets up:

- `environment: "jsdom"` for browser API simulation
- `globals: true` so `describe`, `it`, `expect` are available without imports
- Path aliases: `@` maps to `apps/chat`, `@workstation/ui` and `@workstation/api` map to their packages
- Test file discovery from both `apps/**/__tests__/` and `../tests/frontend/`

### Running Tests

```bash
cd frontend

# Run all tests once
pnpm test

# Watch mode (re-run on changes)
pnpm test:watch

# With coverage (if configured in vitest.config)
pnpm test -- --coverage
```

### Writing Frontend Tests

**Component test pattern**:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorBoundary } from "@/components/error-boundary";

describe("ErrorBoundary", () => {
  it("renders children when no error", () => {
    render(
      <ErrorBoundary>
        <div>Content</div>
      </ErrorBoundary>
    );
    expect(screen.getByText("Content")).toBeInTheDocument();
  });
});
```

**Hook test pattern**:

```tsx
import { renderHook, waitFor } from "@testing-library/react";
import { useConversation } from "@workstation/api/hooks/use-conversation";

describe("useConversation", () => {
  it("returns messages for a chat", async () => {
    const { result } = renderHook(() => useConversation("chat-123"));
    await waitFor(() => {
      expect(result.current.messages).toBeDefined();
    });
  });
});
```

**Key conventions**:

- Mock API calls at the `fetch` or client level, not at the hook level.
- Use `userEvent` over `fireEvent` for realistic user interactions.
- Test behavior (what the user sees and does), not implementation details.
- Wrap components that depend on providers (theme, auth) in test wrappers.

---

## CI/CD

GitHub Actions workflows run on pull requests:

| Workflow                                  | File                                    | Runs                          |
|-------------------------------------------|-----------------------------------------|-------------------------------|
| Backend tests                             | `.github/workflows/backend.yml`         | pytest with coverage          |
| Frontend tests                            | `.github/workflows/frontend.yml`        | vitest                        |
| Security checks                           | `.github/workflows/security.yml`        | Dependency and code scanning  |
| Performance                               | `.github/workflows/performance.yml`     | Benchmarks                    |
| E2E                                       | `.github/workflows/playwright.yml`      | Playwright browser tests      |

See the workflow files for trigger conditions and matrix configurations.

---

## Related Documentation

- Backend commands and markers: [`backend/README.md`](../backend/README.md)
- Kernel architecture: [`backend/app/kernel/README.md`](../backend/app/kernel/README.md)
- WebSocket testing notes: [`backend/docs/websocket_reconnection.md`](../backend/docs/websocket_reconnection.md)
