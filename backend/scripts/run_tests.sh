#!/usr/bin/env bash
# Run the kernel test suite with coverage reporting.
#
# Usage:
#   ./scripts/run_tests.sh              # All tests with coverage
#   ./scripts/run_tests.sh unit         # Only unit tests
#   ./scripts/run_tests.sh integration  # Only integration tests
#   ./scripts/run_tests.sh slow         # Only slow tests

set -euo pipefail

cd "$(dirname "$0")/.."

MARKER=""
if [ "${1:-}" != "" ]; then
    MARKER="-m $1"
fi

echo "========================================"
echo "  Running Kernel Test Suite"
echo "========================================"

set +e
python -m pytest tests/ \
    $MARKER \
    --cov=app \
    --cov-config=.coveragerc \
    --cov-report=term-missing \
    --cov-report=html:htmlcov \
    -v \
    --tb=short
EXIT_CODE=$?
set -e

echo ""
echo "========================================"
if [ $EXIT_CODE -eq 0 ]; then
    echo "  All tests passed!"
else
    echo "  Some tests failed (exit code: $EXIT_CODE)"
fi
echo "  HTML coverage report: htmlcov/index.html"
echo "========================================"

exit $EXIT_CODE
