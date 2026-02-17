#!/usr/bin/env bash
# Master test runner — runs static analysis + all test suites in sequence.
#
# Usage:
#   bash tests/run_all.sh              # All tests (no E2E)
#   RUN_E2E=1 bash tests/run_all.sh    # Include E2E tests
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FAILED=0

echo "========== 1. STATIC ANALYSIS =========="

echo "--- ruff check ---"
cd "$ROOT/backend" && ruff check . || FAILED=1
echo "--- ruff format ---"
cd "$ROOT/backend" && ruff format --check . || FAILED=1
echo "--- mypy ---"
cd "$ROOT/backend" && python -m mypy app --ignore-missing-imports || FAILED=1
echo "--- eslint ---"
cd "$ROOT/frontend" && pnpm lint || FAILED=1
echo "--- tsc ---"
cd "$ROOT/frontend" && pnpm type-check || FAILED=1

echo ""
echo "========== 2. BACKEND UNIT TESTS =========="
cd "$ROOT/backend" && python -m pytest ../tests/backend/unit -v --tb=short \
  --cov=app --cov-report=term-missing || FAILED=1

echo ""
echo "========== 3. BACKEND PROPERTY TESTS =========="
cd "$ROOT/backend" && python -m pytest ../tests/backend/property -v --tb=short || FAILED=1

echo ""
echo "========== 4. BACKEND INTEGRATION TESTS =========="
cd "$ROOT/backend" && python -m pytest ../tests/backend/integration -v --tb=short || FAILED=1

echo ""
echo "========== 5. FRONTEND TESTS =========="
cd "$ROOT/frontend" && pnpm test || FAILED=1

if [ "${RUN_E2E:-0}" = "1" ]; then
  echo ""
  echo "========== 6. E2E TESTS =========="
  cd "$ROOT/tests/e2e" && npx playwright test || FAILED=1
fi

echo ""
if [ $FAILED -eq 0 ]; then
  echo "ALL PASSED"
else
  echo "SOME FAILED"
  exit 1
fi
