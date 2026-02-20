#!/usr/bin/env bash
# AI Workstation startup wrapper
# Forwards all arguments to the Python startup script.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
python "$SCRIPT_DIR/scripts/startup.py" "$@"
