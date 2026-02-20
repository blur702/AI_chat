"""Tests for BaseTool abstract class and parameter validation."""

from typing import Any, Dict, Optional, Set

import pytest

from app.kernel.tool_base import BaseTool


class EchoTool(BaseTool):
    """Concrete tool for testing."""

    @property
    def name(self) -> str:
        return "echo"

    @property
    def description(self) -> str:
        return "Echoes back the message"

    @property
    def parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "message": {"type": "string", "description": "Message to echo"},
                "count": {"type": "integer", "minimum": 1, "maximum": 10},
            },
            "required": ["message"],
        }

    @property
    def required_permissions(self) -> Set[str]:
        return {"tools.execute"}

    async def execute(
        self, parameters: Dict[str, Any], context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        return {"echoed": parameters["message"]}


class InvalidSchemaTool(BaseTool):
    """Tool with an invalid JSON Schema for testing error handling."""

    @property
    def name(self) -> str:
        return "invalid_schema"

    @property
    def description(self) -> str:
        return "Tool with bad schema"

    @property
    def parameters_schema(self) -> Dict[str, Any]:
        # Invalid schema: "type" should be a string, not a list
        return {"type": 123}

    @property
    def required_permissions(self) -> Set[str]:
        return set()

    async def execute(self, parameters: Dict[str, Any], context=None) -> Dict[str, Any]:
        return {}


class TestBaseToolProperties:
    def test_name(self):
        tool = EchoTool()
        assert tool.name == "echo"

    def test_description(self):
        tool = EchoTool()
        assert tool.description == "Echoes back the message"

    def test_parameters_schema(self):
        tool = EchoTool()
        schema = tool.parameters_schema
        assert schema["type"] == "object"
        assert "message" in schema["properties"]
        assert "message" in schema["required"]

    def test_required_permissions(self):
        tool = EchoTool()
        assert "tools.execute" in tool.required_permissions


class TestValidateParameters:
    def test_valid_parameters(self):
        tool = EchoTool()
        errors = tool.validate_parameters({"message": "hello"})
        assert errors is None

    def test_valid_parameters_with_optional(self):
        tool = EchoTool()
        errors = tool.validate_parameters({"message": "hello", "count": 5})
        assert errors is None

    def test_missing_required_field(self):
        tool = EchoTool()
        errors = tool.validate_parameters({})
        assert errors is not None
        assert len(errors) > 0
        assert "message" in errors[0].lower()

    def test_wrong_type(self):
        tool = EchoTool()
        errors = tool.validate_parameters({"message": 123})
        assert errors is not None
        assert len(errors) > 0

    def test_value_below_minimum(self):
        tool = EchoTool()
        errors = tool.validate_parameters({"message": "hi", "count": 0})
        assert errors is not None

    def test_value_above_maximum(self):
        tool = EchoTool()
        errors = tool.validate_parameters({"message": "hi", "count": 100})
        assert errors is not None

    def test_invalid_schema_reports_error(self):
        tool = InvalidSchemaTool()
        errors = tool.validate_parameters({"anything": "value"})
        assert errors is not None
        assert any("schema" in e.lower() or "Internal" in e for e in errors)


class TestExecute:
    @pytest.mark.asyncio
    async def test_execute_returns_result(self):
        tool = EchoTool()
        result = await tool.execute({"message": "hello"})
        assert result == {"echoed": "hello"}

    @pytest.mark.asyncio
    async def test_execute_with_context(self):
        tool = EchoTool()
        result = await tool.execute({"message": "test"}, context={"session_id": "abc"})
        assert result["echoed"] == "test"
