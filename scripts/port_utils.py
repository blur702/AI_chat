"""Port detection and cleanup utilities for AI Workstation.

Provides cross-platform helpers to detect port conflicts and safely
terminate the processes occupying them.
"""

import logging
import platform
import signal
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional

import psutil

logger = logging.getLogger(__name__)


@dataclass
class ProcessInfo:
    """Information about a process using a network port."""

    pid: int
    name: str
    port: int
    status: str = ""
    cmdline: List[str] = field(default_factory=list)

    def __str__(self) -> str:
        cmd = " ".join(self.cmdline) if self.cmdline else self.name
        return f"PID {self.pid} ({self.name}) on port {self.port} [{self.status}] - {cmd}"


def is_port_in_use(port: int) -> bool:
    """Check whether *port* is occupied by any process."""
    for conn in psutil.net_connections(kind="inet"):
        if conn.laddr and conn.laddr.port == port and conn.status == psutil.CONN_LISTEN:
            return True
    return False


def get_process_using_port(port: int) -> Optional[ProcessInfo]:
    """Return a `ProcessInfo` for the process listening on *port*, or ``None``."""
    for conn in psutil.net_connections(kind="inet"):
        if conn.laddr and conn.laddr.port == port and conn.status == psutil.CONN_LISTEN:
            if conn.pid is None:
                continue
            try:
                proc = psutil.Process(conn.pid)
                return ProcessInfo(
                    pid=proc.pid,
                    name=proc.name(),
                    port=port,
                    status=proc.status(),
                    cmdline=proc.cmdline(),
                )
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                return ProcessInfo(pid=conn.pid, name="<unknown>", port=port)
    return None


def get_all_port_conflicts(ports: List[int]) -> Dict[int, ProcessInfo]:
    """Return a mapping of ``{port: ProcessInfo}`` for every conflicting port."""
    conflicts: Dict[int, ProcessInfo] = {}
    for port in ports:
        info = get_process_using_port(port)
        if info is not None:
            conflicts[port] = info
    return conflicts


def terminate_process(
    pid: int,
    timeout_seconds: int = 10,
) -> bool:
    """Terminate a single process by PID with graceful-then-forceful shutdown.

    On Unix the process receives SIGTERM first; on Windows ``terminate()``
    is called (which sends ``TerminateProcess``).  If the process is still
    alive after *timeout_seconds*, SIGKILL / ``kill()`` is used.

    Returns ``True`` when the process is confirmed dead.
    """
    try:
        proc = psutil.Process(pid)
    except psutil.NoSuchProcess:
        logger.debug("PID %d already gone", pid)
        return True

    proc_name = proc.name()
    logger.info("Terminating PID %d (%s) …", pid, proc_name)

    try:
        if platform.system() != "Windows":
            proc.send_signal(signal.SIGTERM)
        else:
            proc.terminate()
    except (psutil.NoSuchProcess, psutil.AccessDenied) as exc:
        logger.warning("Could not send terminate signal to PID %d: %s", pid, exc)
        return not psutil.pid_exists(pid)

    try:
        proc.wait(timeout=timeout_seconds)
        logger.info("PID %d terminated gracefully", pid)
        return True
    except psutil.TimeoutExpired:
        logger.warning("PID %d did not exit in %ds, force-killing …", pid, timeout_seconds)

    try:
        proc.kill()
        proc.wait(timeout=5)
        logger.info("PID %d force-killed", pid)
        return True
    except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.TimeoutExpired) as exc:
        logger.error("Failed to kill PID %d: %s", pid, exc)
        return False


def terminate_processes_on_ports(
    ports: List[int],
    excluded_processes: Optional[List[str]] = None,
    timeout_seconds: int = 10,
    retry_attempts: int = 3,
) -> Dict[int, bool]:
    """Terminate every process listening on the given *ports*.

    Processes whose name appears in *excluded_processes* are skipped.
    Each port is retried up to *retry_attempts* times if it remains
    occupied after termination.

    Returns ``{port: True/False}`` indicating whether the port was freed.
    """
    excluded = set(excluded_processes or [])
    results: Dict[int, bool] = {}

    for port in ports:
        freed = False
        for attempt in range(1, retry_attempts + 1):
            info = get_process_using_port(port)
            if info is None:
                freed = True
                break

            if info.name in excluded:
                logger.warning(
                    "Port %d used by excluded process %s (PID %d) — skipping",
                    port,
                    info.name,
                    info.pid,
                )
                break

            logger.info("Attempt %d/%d to free port %d", attempt, retry_attempts, port)
            success = terminate_process(info.pid, timeout_seconds=timeout_seconds)

            if success:
                # Brief pause to let the OS release the socket
                time.sleep(0.5)
                if not is_port_in_use(port):
                    freed = True
                    break
                logger.warning("Port %d still in use after terminating PID %d", port, info.pid)
            else:
                logger.error("Could not terminate PID %d on port %d", info.pid, port)

        results[port] = freed

    return results
