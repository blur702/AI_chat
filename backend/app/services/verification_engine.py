"""Verification engine for plan phase checks.

Runs different check types against the sandbox container and returns
structured pass/fail results.
"""

import logging
from typing import Any
from uuid import UUID

from app.services.sandbox_manager import SandboxManager

logger = logging.getLogger(__name__)


async def run_verification_checks(
    checks: list[dict[str, str]],
    project_id: UUID,
    sandbox: SandboxManager,
    template_id: str | None = None,
) -> dict[str, Any]:
    """Run a list of verification checks and return aggregated results.

    Each check has a ``type`` and ``criteria`` field.
    Supported types: test, static, integration, manual, ui.

    Returns::

        {
            "passed": bool,
            "results": [
                {"type": "test", "criteria": "...", "passed": bool, "output": str},
                ...
            ],
            "summary": "3/4 checks passed"
        }
    """
    container_id = await sandbox.get_or_create_container(
        project_id, template_id=template_id
    )

    results: list[dict[str, Any]] = []

    for check in checks:
        check_type = check.get("type", "manual")
        criteria = check.get("criteria", "")

        if check_type == "test":
            result = await _run_test_check(container_id, criteria, sandbox)
        elif check_type == "static":
            result = await _run_static_check(container_id, criteria, sandbox)
        elif check_type == "integration":
            result = await _run_integration_check(container_id, criteria, sandbox)
        elif check_type == "manual":
            result = _manual_check(criteria)
        elif check_type == "ui":
            result = _ui_check(criteria)
        else:
            result = {
                "type": check_type,
                "criteria": criteria,
                "passed": False,
                "output": f"Unknown check type: {check_type}",
            }

        results.append(result)

    # Manual and UI checks are informational — don't count toward pass/fail
    automated_results = [r for r in results if r["type"] not in ("manual", "ui")]
    passed_count = sum(1 for r in automated_results if r["passed"])
    total = len(automated_results)
    all_passed = passed_count == total if total > 0 else True

    return {
        "passed": all_passed,
        "results": results,
        "summary": f"{passed_count}/{total} checks passed",
    }


async def _run_test_check(
    container_id: str, criteria: str, sandbox: SandboxManager
) -> dict[str, Any]:
    """Run a test command in the sandbox and check exit code."""
    cmd = criteria if criteria else "npm test"
    try:
        output = await sandbox.exec_simple(container_id, cmd)
        return {
            "type": "test",
            "criteria": criteria,
            "passed": True,
            "output": output[:2000] if output else "Tests passed",
        }
    except RuntimeError as exc:
        return {
            "type": "test",
            "criteria": criteria,
            "passed": False,
            "output": str(exc)[:2000],
        }


async def _run_static_check(
    container_id: str, criteria: str, sandbox: SandboxManager
) -> dict[str, Any]:
    """Run a linter/type checker in the sandbox."""
    if criteria:
        cmd = criteria
        try:
            output = await sandbox.exec_simple(container_id, cmd)
            return {
                "type": "static",
                "criteria": criteria,
                "passed": True,
                "output": output[:2000] if output else "Static analysis passed",
            }
        except RuntimeError as exc:
            return {
                "type": "static",
                "criteria": criteria,
                "passed": False,
                "output": str(exc)[:2000],
            }

    commands = ["npx tsc --noEmit 2>&1", "python -m mypy . 2>&1"]
    outputs: list[str] = []
    all_passed = True
    try:
        for cmd in commands:
            try:
                outputs.append(await sandbox.exec_simple(container_id, cmd))
            except RuntimeError as exc:
                all_passed = False
                outputs.append(str(exc))
        output = "\n\n".join(part for part in outputs if part).strip()
        return {
            "type": "static",
            "criteria": criteria,
            "passed": all_passed,
            "output": output[:2000] if output else "Static analysis passed",
        }
    except RuntimeError as exc:
        return {
            "type": "static",
            "criteria": criteria,
            "passed": False,
            "output": str(exc)[:2000],
        }


async def _run_integration_check(
    container_id: str, criteria: str, sandbox: SandboxManager
) -> dict[str, Any]:
    """Run an integration check (e.g. curl an endpoint)."""
    cmd = criteria if criteria else "echo 'No integration command specified'"
    try:
        output = await sandbox.exec_simple(container_id, cmd)
        return {
            "type": "integration",
            "criteria": criteria,
            "passed": True,
            "output": output[:2000] if output else "Integration check passed",
        }
    except RuntimeError as exc:
        return {
            "type": "integration",
            "criteria": criteria,
            "passed": False,
            "output": str(exc)[:2000],
        }


def _manual_check(criteria: str) -> dict[str, Any]:
    """Manual checks always return pending — require human confirmation."""
    return {
        "type": "manual",
        "criteria": criteria,
        "passed": False,
        "output": "Requires manual verification",
    }


def _ui_check(criteria: str) -> dict[str, Any]:
    """UI checks are placeholder — return pending for future visual/a11y checks."""
    return {
        "type": "ui",
        "criteria": criteria,
        "passed": False,
        "output": "UI verification not yet implemented",
    }
