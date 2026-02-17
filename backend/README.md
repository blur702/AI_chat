# Backend

FastAPI backend for AI Workstation.

## Local Development

```bash
cd backend
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## Testing

Install dependencies:

```bash
cd backend
pip install -r requirements.txt
```

Run test suites:

```bash
./scripts/run_tests.sh
./scripts/run_tests.sh unit
./scripts/run_tests.sh integration
./scripts/run_tests.sh slow
```

Run pytest directly:

```bash
pytest tests/ -v --cov=app
pytest tests/kernel/test_resource_manager.py
pytest tests/ -m unit -v
```

Watch mode:

```bash
./scripts/test_watch.sh
```

## Coverage

- Threshold: `80%` (`backend/.coveragerc`)
- HTML report output: `backend/htmlcov/index.html`

```bash
coverage report
```

## Markers

Defined in `backend/pytest.ini`:
- `unit`: isolated fast tests
- `integration`: cross-service/kernel interaction tests
- `slow`: tests with loops/timeouts/real delays

## Related Docs

- Kernel architecture: `backend/app/kernel/README.md`
- WebSocket reconnection/state snapshot: `backend/docs/websocket_reconnection.md`

## Help Topics Seed

To sync built-in help topics (field and workspace help):

```bash
cd backend
python scripts/insert_comprehensive_help_topics.py
```
