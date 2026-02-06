# AI Workstation Backend

FastAPI backend service for the AI Workstation, providing LLM integration, resource management, and real-time event distribution.

## Setup

```bash
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## Testing

### Prerequisites

All testing dependencies are included in `requirements.txt`. Install them with:

```bash
pip install -r requirements.txt
```

### Quickstart

```bash
./scripts/run_tests.sh
```

### Running by Marker

```bash
./scripts/run_tests.sh unit         # Fast, isolated unit tests
./scripts/run_tests.sh integration  # Service interaction tests
./scripts/run_tests.sh slow         # Tests involving background loops/timeouts
```

### Direct pytest

```bash
pytest tests/ -v --cov=app                        # All tests with coverage
pytest tests/kernel/test_resource_manager.py       # Single test file
pytest tests/kernel/ -v --cov=app                  # All kernel tests
pytest tests/ -m unit -v                           # Only unit-marked tests
```

### Coverage

Coverage is configured via `.coveragerc` with an 80% threshold on the `app/` directory (excluding tests and migrations).

After running tests with coverage, an HTML report is generated at `htmlcov/index.html`. To view a terminal summary:

```bash
coverage report
```

### Continuous Testing (Watch Mode)

Re-runs tests automatically on file changes:

```bash
./scripts/test_watch.sh
```

Requires `pytest-watch` (`pip install pytest-watch`).

### Test Structure

```
tests/
├── conftest.py                         # Shared fixtures (mock_redis, mock_session_factory,
│                                       #   mock_vram_tracker, kernel_instance, cleanup_kernel)
└── kernel/
    ├── test_helpers.py                 # MockTool, model factories, assertion helpers
    ├── test_resource_manager.py        # Unit: VRAMTracker, priority scoring, preemption,
    │                                   #   CPU offloading, operation recovery, VRAM caching
    ├── test_tool_registry.py           # Unit: registration, validation, permissions,
    │                                   #   result caching, context, queues, LRU eviction
    ├── test_event_bus.py               # Unit: publishing, persistence, subscriptions,
    │                                   #   message handling, WebSocket integration
    ├── test_context_manager.py         # Unit: conversation state, project context,
    │                                   #   user preferences, token tracking, compaction
    └── test_kernel_integration.py      # Integration: service registration, lifecycle
                                        #   coordination, health aggregation, singleton,
                                        #   concurrency, cross-service events
```

### Markers

Defined in `pytest.ini`:

| Marker | Purpose |
|--------|---------|
| `unit` | Isolated, fast tests for individual service methods |
| `integration` | Tests involving multiple services or kernel coordination |
| `slow` | Tests with background loops, timeouts, or real delays |

### Configuration Files

- `pytest.ini` -- Test discovery, asyncio mode, markers, log settings
- `.coveragerc` -- Coverage source, exclusions, 80% threshold
- `scripts/run_tests.sh` -- Test runner with coverage reporting
- `scripts/test_watch.sh` -- Continuous testing wrapper
