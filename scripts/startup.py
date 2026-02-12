"""AI Workstation startup script with port conflict detection and cleanup.

Usage:
    python scripts/startup.py [OPTIONS]

Options:
    --interactive      Prompt before terminating each conflicting process
    --skip-cleanup     Detect conflicts but do not terminate anything
    --skip-services    Skip auto-starting external services (Ollama, ComfyUI)
    --env-file PATH    Path to .env file (default: .env in project root)
    --verbose          Enable debug-level logging
"""

import argparse
import json
import logging
import os
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path
from typing import Dict, List, Optional

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


def find_ollama_executable() -> Optional[str]:
    """Locate the Ollama executable on this system."""
    path = shutil.which("ollama")
    if path:
        return path
    # Common Windows install location
    local_app = os.environ.get("LOCALAPPDATA", "")
    if local_app:
        candidate = Path(local_app) / "Programs" / "Ollama" / "ollama.exe"
        if candidate.is_file():
            return str(candidate)
    return None


def _is_port_open(port: int) -> bool:
    """Return True if something is listening on localhost:port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(1)
        return s.connect_ex(("127.0.0.1", port)) == 0


def start_host_service(
    name: str,
    port: int,
    cmd: List[str],
    cwd: Optional[str] = None,
    timeout: int = 60,
) -> bool:
    """Start a host service if not already running. Returns True on success."""
    if _is_port_open(port):
        print(f"  {name} (port {port}): already running ✓")
        return True

    print(f"  {name} (port {port}): starting ", end="", flush=True)
    try:
        # Launch detached — don't capture stdout/stderr
        kwargs: Dict = {
            "stdout": subprocess.DEVNULL,
            "stderr": subprocess.DEVNULL,
        }
        if sys.platform == "win32":
            kwargs["creationflags"] = (
                subprocess.DETACHED_PROCESS | subprocess.CREATE_NO_WINDOW
            )
        else:
            kwargs["start_new_session"] = True

        subprocess.Popen(cmd, cwd=cwd, **kwargs)
    except FileNotFoundError:
        print(f"FAILED (executable not found: {cmd[0]})")
        return False
    except OSError as exc:
        print(f"FAILED ({exc})")
        return False

    # Poll until port opens
    start = time.monotonic()
    while time.monotonic() - start < timeout:
        time.sleep(2)
        print(".", end="", flush=True)
        if _is_port_open(port):
            elapsed = int(time.monotonic() - start)
            print(f" ready ({elapsed}s) ✓")
            return True

    print(f" TIMEOUT ({timeout}s)")
    return False


def start_external_services(env_file: str) -> None:
    """Auto-start Ollama and/or ComfyUI based on env config."""
    load_dotenv(env_file, override=True)

    ollama_auto = os.getenv("OLLAMA_AUTO_START", "false").lower() in ("true", "1", "yes")
    comfyui_auto = os.getenv("COMFYUI_AUTO_START", "false").lower() in ("true", "1", "yes")

    if not ollama_auto and not comfyui_auto:
        logger.debug("No external services configured for auto-start")
        return

    print("\nStarting external services ...")

    if ollama_auto:
        ollama_exe = find_ollama_executable()
        if ollama_exe:
            start_host_service("Ollama", 11434, [ollama_exe, "serve"])
        else:
            print("  Ollama: executable not found (install Ollama or set PATH)")

    if comfyui_auto:
        comfyui_dir = os.getenv("COMFYUI_DIR")
        comfyui_python = os.getenv("COMFYUI_PYTHON", "python")
        if comfyui_dir and Path(comfyui_dir).is_dir():
            start_host_service(
                "ComfyUI",
                8188,
                [comfyui_python, "main.py", "--listen", "0.0.0.0"],
                cwd=comfyui_dir,
            )
        else:
            print("  ComfyUI: COMFYUI_DIR not set or directory not found")

    print()


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
    parser.add_argument(
        "--skip-services",
        action="store_true",
        help="Skip auto-starting external services (Ollama, ComfyUI)",
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
    else:
        display_conflicts(conflicts)

        if args.skip_cleanup:
            print("--skip-cleanup specified; skipping process termination.")
            print("Attempting docker-compose up despite conflicts …\n")
        else:
            # Determine which ports to free
            excluded = config.get("excluded_processes", [])
            timeout = config.get("timeout_seconds", 10)
            retries = config.get("retry_attempts", 3)

            ports_to_clean: List[int] = []
            if args.interactive or config.get("require_confirmation", True):
                ports_to_clean = confirm_termination(conflicts)
                if not ports_to_clean:
                    print("No processes selected for termination.")
                    print("Attempting docker-compose up despite conflicts …\n")
            elif config.get("auto_kill", False):
                ports_to_clean = list(conflicts.keys())
            else:
                print("auto_kill is disabled and require_confirmation is off. Skipping cleanup.")

            if ports_to_clean:
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

    # Start external services (Ollama, ComfyUI) before Docker Compose
    if not args.skip_services:
        start_external_services(args.env_file)

    return run_docker_compose()


if __name__ == "__main__":
    sys.exit(main())
