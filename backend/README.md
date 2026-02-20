# Backend

FastAPI backend for AI Workstation.

## Local Development

```bash
cd backend
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## Test Commands

```bash
cd backend
./scripts/run_tests.sh
./scripts/run_tests.sh unit
./scripts/run_tests.sh integration
./scripts/run_tests.sh slow
```

Direct pytest examples:

```bash
pytest tests/ -v --cov=app
pytest tests/ -m unit -v
pytest tests/kernel/test_resource_manager.py
```

Watch mode:

```bash
./scripts/test_watch.sh
```

## Coverage And Markers

- Coverage threshold: `80%` (`backend/.coveragerc`)
- HTML report: `backend/htmlcov/index.html`
- Markers in `backend/pytest.ini`: `unit`, `integration`, `slow`

## Help Topic Seeding

Sync help topics and field help content:

```bash
cd backend
python scripts/insert_comprehensive_help_topics.py
```

## Canonical References

- Docs hub: [`docs/README.md`](../docs/README.md)
- System architecture: [`docs/architecture.md`](../docs/architecture.md)
- Testing strategy: [`docs/testing.md`](../docs/testing.md)
- Kernel service contract: [`backend/app/kernel/README.md`](app/kernel/README.md)
- WebSocket recovery model: [`backend/docs/websocket_reconnection.md`](docs/websocket_reconnection.md)
