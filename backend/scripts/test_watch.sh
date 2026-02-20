#!/usr/bin/env bash
# Continuously re-run tests on file changes (requires pytest-watch).
#
# Usage:
#   ./scripts/test_watch.sh
#
# Install pytest-watch first: pip install pytest-watch

set -euo pipefail

cd "$(dirname "$0")/.."

echo "Starting pytest-watch for continuous testing..."
echo "Press Ctrl+C to stop."
echo ""

python -m pytest_watch tests/ -- -v --tb=short
