"""AI Workstation startup script with port conflict detection and cleanup.

Usage:
    python scripts/startup.py [OPTIONS]

Options:
    --interactive    Prompt before terminating each conflicting process
    --skip-cleanup   Detect conflicts but do not terminate anything
    --env-file PATH  Path to .env file (default: .env in project root)
    --verbose        Enable debug-level logging
"""

import argparse
import json
import logging
import os
import subprocess
import sys
from pathlib import Path
from typing import Dict, List

from dotenv import load_dotenv

# Resolve project root (parent of the scripts/ directory)
SCRIPTS_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPTS_DIR.parent

# Ensure the scripts directory is on sys.path so local modules (port_utils)
# can be imported regardless of the working directory at invocation time.
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from port_utils import (
    ProcessInfo,
    get_all_port_conflicts,
    is_port_in_use,
    terminate_processes_on_ports,
)

logger = logging.getLogger("startup")

CONFIG_PATH = SCRIPTS_DIR / "port_config.json"

# Default port settings matching .env.example
PORT_DEFAULTS: Dict[str, int] = {
    "POSTGRES_PORT": 5433,
    "REDIS_PORT": 6380,
    "BACKEND_PORT": 8001,
    "FRONTEND_PORT": 3001,
    "NGINX_HTTP_PORT": 9080,
    "NGINX_HTTPS_PORT": 8443,
}


def load_config() -> dict:
    """Load port_config.json and return as dict."""
    try:
        with open(CONFIG_PATH, "r") as fh:
            return json.load(fh)
    except (FileNotFoundError, json.JSONDecodeError) as exc:
        logger.warning("Could not load %s: %s — using defaults", CONFIG_PATH, exc)
        return {
            "auto_kill": False,
            "require_confirmation": True,
            "excluded_processes": [],
            "timeout_seconds": 10,
            "retry_attempts": 3,
        }


def read_port_config(env_file: str) -> Dict[str, int]:
    """Read port values from the environment (loaded from *env_file*)."""
    load_dotenv(env_file, override=True)
    ports: Dict[str, int] = {}
    for key, default in PORT_DEFAULTS.items():
        raw = os.getenv(key)
        try:
            ports[key] = int(raw) if raw is not None else default
        except ValueError:
            logger.warning("Invalid value for %s=%r, using default %d", key, raw, default)
            ports[key] = default
    return ports


def display_conflicts(conflicts: Dict[int, ProcessInfo]) -> None:
    """Pretty-print port conflicts."""
    print("\n  Port conflicts detected:\n")
    for port, info in conflicts.items():
        print(f"    Port {port}: {info}")
    print()


def confirm_termination(conflicts: Dict[int, ProcessInfo]) -> List[int]:
    """Interactively ask the user which ports to free. Returns ports to clean."""
    ports_to_clean: List[int] = []
    for port, info in conflicts.items():
        answer = input(f"  Terminate {info.name} (PID {info.pid}) on port {port}? [y/N] ").strip().lower()
        if answer in ("y", "yes"):
            ports_to_clean.append(port)
    return ports_to_clean


def run_docker_compose() -> int:
    """Run ``docker-compose up -d`` from the project root and return the exit code."""
    logger.info("Starting docker-compose …")
    try:
        result = subprocess.run(
            ["docker-compose", "up", "-d"],
            cwd=str(PROJECT_ROOT),
        )
        return result.returncode
    except FileNotFoundError:
        # docker-compose v2 might be a docker subcommand
        try:
            result = subprocess.run(
                ["docker", "compose", "up", "-d"],
                cwd=str(PROJECT_ROOT),
            )
            return result.returncode
        except FileNotFoundError:
            logger.error("Neither 'docker-compose' nor 'docker compose' found on PATH")
            return 1


def parse_args(argv: List[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="AI Workstation startup with port conflict detection",
    )
    parser.add_argument(
        "--interactive",
        action="store_true",
        help="Prompt before terminating each conflicting process",
    )
    parser.add_argument(
        "--skip-cleanup",
        action="store_true",
        help="Detect and report conflicts but do not terminate processes",
    )
    parser.add_argument(
        "--env-file",
        default=str(PROJECT_ROOT / ".env"),
        help="Path to .env file (default: <project_root>/.env)",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable debug-level logging output",
    )
    return parser.parse_args(argv)


def main(argv: List[str] | None = None) -> int:
    args = parse_args(argv)

    # Logging setup
    log_level = logging.DEBUG if args.verbose else logging.INFO
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    config = load_config()

    # Read port configuration
    port_map = read_port_config(args.env_file)
    ports = list(port_map.values())
    logger.debug("Checking ports: %s", {k: v for k, v in port_map.items()})

    # Detect conflicts
    print("Checking for port conflicts …")
    conflicts = get_all_port_conflicts(ports)

    if not conflicts:
        print("No port conflicts found.")
        return run_docker_compose()

    display_conflicts(conflicts)

    if args.skip_cleanup:
        print("--skip-cleanup specified; skipping process termination.")
        print("Attempting docker-compose up despite conflicts …\n")
        return run_docker_compose()

    # Determine which ports to free
    excluded = config.get("excluded_processes", [])
    timeout = config.get("timeout_seconds", 10)
    retries = config.get("retry_attempts", 3)

    if args.interactive or config.get("require_confirmation", True):
        ports_to_clean = confirm_termination(conflicts)
        if not ports_to_clean:
            print("No processes selected for termination.")
            print("Attempting docker-compose up despite conflicts …\n")
            return run_docker_compose()
    elif config.get("auto_kill", False):
        ports_to_clean = list(conflicts.keys())
    else:
        print("auto_kill is disabled and require_confirmation is off. Skipping cleanup.")
        return run_docker_compose()

    # Terminate conflicting processes
    print("Terminating conflicting processes …")
    results = terminate_processes_on_ports(
        ports_to_clean,
        excluded_processes=excluded,
        timeout_seconds=timeout,
        retry_attempts=retries,
    )

    # Report results
    failed_ports = [p for p, ok in results.items() if not ok]
    freed_ports = [p for p, ok in results.items() if ok]

    if freed_ports:
        print(f"  Freed ports: {', '.join(str(p) for p in freed_ports)}")
    if failed_ports:
        print(f"  Failed to free ports: {', '.join(str(p) for p in failed_ports)}")

    # Verify clearance
    still_blocked = [p for p in ports_to_clean if is_port_in_use(p)]
    if still_blocked:
        logger.warning("Ports still in use after cleanup: %s", still_blocked)
        print(f"\n  WARNING: ports {still_blocked} are still occupied.")
        print("  docker-compose may fail to bind these ports.\n")

    return run_docker_compose()


if __name__ == "__main__":
    sys.exit(main())
