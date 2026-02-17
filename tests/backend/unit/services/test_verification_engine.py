"""Tests for verification_engine — plan phase verification checks."""

import sys
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

# Pre-mock sandbox_manager to avoid circular import (sandbox.__init__ re-imports it)
if "app.services.sandbox_manager" not in sys.modules:
    sys.modules["app.services.sandbox_manager"] = MagicMock()

from app.services.verification_engine import (
    _manual_check,
    _ui_check,
    _run_test_check,
    _run_static_check,
    _run_integration_check,
    run_verification_checks,
)


class TestManualCheck:
    def test_returns_pending(self):
        result = _manual_check("Check the UI looks right")
        assert result["type"] == "manual"
        assert result["passed"] is False
        assert "manual verification" in result["output"].lower()

    def test_includes_criteria(self):
        result = _manual_check("Verify button color")
        assert result["criteria"] == "Verify button color"


class TestUICheck:
    def test_returns_pending(self):
        result = _ui_check("Check accessibility")
        assert result["type"] == "ui"
        assert result["passed"] is False
        assert "not yet implemented" in result["output"].lower()


class TestRunTestCheck:
    @pytest.mark.asyncio
    async def test_passes_on_success(self):
        sandbox = AsyncMock()
        sandbox.exec_simple = AsyncMock(return_value="All tests passed")

        result = await _run_test_check("container123", "pytest", sandbox)
        assert result["type"] == "test"
        assert result["passed"] is True
        assert "All tests passed" in result["output"]

    @pytest.mark.asyncio
    async def test_fails_on_runtime_error(self):
        sandbox = AsyncMock()
        sandbox.exec_simple = AsyncMock(side_effect=RuntimeError("exit code 1"))

        result = await _run_test_check("container123", "pytest", sandbox)
        assert result["passed"] is False
        assert "exit code 1" in result["output"]

    @pytest.mark.asyncio
    async def test_uses_default_command(self):
        sandbox = AsyncMock()
        sandbox.exec_simple = AsyncMock(return_value="ok")

        await _run_test_check("container123", "", sandbox)
        sandbox.exec_simple.assert_awaited_with("container123", "npm test")

    @pytest.mark.asyncio
    async def test_truncates_long_output(self):
        sandbox = AsyncMock()
        sandbox.exec_simple = AsyncMock(return_value="x" * 5000)

        result = await _run_test_check("container123", "pytest", sandbox)
        assert len(result["output"]) <= 2000


class TestRunStaticCheck:
    @pytest.mark.asyncio
    async def test_explicit_criteria_passes(self):
        sandbox = AsyncMock()
        sandbox.exec_simple = AsyncMock(return_value="no errors")

        result = await _run_static_check("c1", "npx eslint .", sandbox)
        assert result["passed"] is True

    @pytest.mark.asyncio
    async def test_explicit_criteria_fails(self):
        sandbox = AsyncMock()
        sandbox.exec_simple = AsyncMock(side_effect=RuntimeError("lint errors"))

        result = await _run_static_check("c1", "npx eslint .", sandbox)
        assert result["passed"] is False


class TestRunIntegrationCheck:
    @pytest.mark.asyncio
    async def test_passes_on_success(self):
        sandbox = AsyncMock()
        sandbox.exec_simple = AsyncMock(return_value="200 OK")

        result = await _run_integration_check("c1", "curl http://localhost:3000/health", sandbox)
        assert result["passed"] is True

    @pytest.mark.asyncio
    async def test_fails_on_error(self):
        sandbox = AsyncMock()
        sandbox.exec_simple = AsyncMock(side_effect=RuntimeError("connection refused"))

        result = await _run_integration_check("c1", "curl http://localhost:3000", sandbox)
        assert result["passed"] is False

    @pytest.mark.asyncio
    async def test_default_command_when_empty(self):
        sandbox = AsyncMock()
        sandbox.exec_simple = AsyncMock(return_value="ok")

        result = await _run_integration_check("c1", "", sandbox)
        assert result["passed"] is True


class TestRunVerificationChecks:
    @pytest.mark.asyncio
    async def test_all_checks_pass(self):
        sandbox = AsyncMock()
        sandbox.get_or_create_container = AsyncMock(return_value="container-id")
        sandbox.exec_simple = AsyncMock(return_value="ok")

        checks = [
            {"type": "test", "criteria": "pytest"},
            {"type": "integration", "criteria": "curl localhost"},
        ]
        result = await run_verification_checks(checks, uuid4(), sandbox)
        assert result["passed"] is True
        assert result["summary"] == "2/2 checks passed"
        assert len(result["results"]) == 2

    @pytest.mark.asyncio
    async def test_mixed_pass_fail(self):
        sandbox = AsyncMock()
        sandbox.get_or_create_container = AsyncMock(return_value="c1")
        sandbox.exec_simple = AsyncMock(side_effect=[
            "ok",  # test passes
            RuntimeError("fail"),  # integration fails
        ])

        checks = [
            {"type": "test", "criteria": "pytest"},
            {"type": "integration", "criteria": "curl localhost"},
        ]
        result = await run_verification_checks(checks, uuid4(), sandbox)
        assert result["passed"] is False
        assert result["summary"] == "1/2 checks passed"

    @pytest.mark.asyncio
    async def test_manual_and_ui_dont_count(self):
        sandbox = AsyncMock()
        sandbox.get_or_create_container = AsyncMock(return_value="c1")
        sandbox.exec_simple = AsyncMock(return_value="ok")

        checks = [
            {"type": "test", "criteria": "pytest"},
            {"type": "manual", "criteria": "Check visually"},
            {"type": "ui", "criteria": "Check a11y"},
        ]
        result = await run_verification_checks(checks, uuid4(), sandbox)
        assert result["passed"] is True
        assert result["summary"] == "1/1 checks passed"
        assert len(result["results"]) == 3

    @pytest.mark.asyncio
    async def test_unknown_check_type(self):
        sandbox = AsyncMock()
        sandbox.get_or_create_container = AsyncMock(return_value="c1")

        checks = [{"type": "unknown_type", "criteria": "???"}]
        result = await run_verification_checks(checks, uuid4(), sandbox)
        assert result["passed"] is False
        assert "Unknown check type" in result["results"][0]["output"]

    @pytest.mark.asyncio
    async def test_no_automated_checks_means_passed(self):
        sandbox = AsyncMock()
        sandbox.get_or_create_container = AsyncMock(return_value="c1")

        checks = [{"type": "manual", "criteria": "Look at it"}]
        result = await run_verification_checks(checks, uuid4(), sandbox)
        assert result["passed"] is True
        assert result["summary"] == "0/0 checks passed"

    @pytest.mark.asyncio
    async def test_uses_template_id(self):
        sandbox = AsyncMock()
        sandbox.get_or_create_container = AsyncMock(return_value="c1")

        checks = []
        await run_verification_checks(checks, uuid4(), sandbox, template_id="python-fastapi")
        sandbox.get_or_create_container.assert_awaited_once()
        call_kwargs = sandbox.get_or_create_container.call_args[1]
        assert call_kwargs["template_id"] == "python-fastapi"
