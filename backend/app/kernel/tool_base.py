"""
Base tool interface for kernel-managed tools.

All tools registered with the ToolRegistry must inherit from BaseTool
and implement the required methods. This ensures consistent parameter
validation, permission declaration, and execution contracts.
"""

import logging
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, Set

import jsonschema

logger = logging.getLogger(__name__)


class BaseTool(ABC):
    """
    Abstract base class for tools managed by the ToolRegistry.

    Subclasses must define:
    - name: Unique tool identifier
    - description: Human-readable description of what the tool does
    - parameters_schema: JSON Schema dict describing accepted parameters
    - required_permissions: Set of permission strings needed to execute
    - execute(): Async method containing the tool logic

    Example:
        class EchoTool(BaseTool):
            @property
            def name(self) -> str:
                return "echo"

            @property
            def description(self) -> str:
                return "Echoes back the provided message"

            @property
            def parameters_schema(self) -> Dict[str, Any]:
                return {
                    "type": "object",
                    "properties": {
                        "message": {"type": "string", "description": "Message to echo"}
                    },
                    "required": ["message"],
                }

            @property
            def required_permissions(self) -> Set[str]:
                return {"tools.execute"}

            async def execute(self, parameters: Dict[str, Any], context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
                return {"echoed": parameters["message"]}
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Return unique tool identifier."""
        pass

    @property
    @abstractmethod
    def description(self) -> str:
        """Return human-readable description of the tool."""
        pass

    @property
    @abstractmethod
    def parameters_schema(self) -> Dict[str, Any]:
        """
        Return JSON Schema dict describing accepted parameters.

        Must be a valid JSON Schema object (type: "object" with properties).
        Used for both documentation and runtime validation.
        """
        pass

    @property
    @abstractmethod
    def required_permissions(self) -> Set[str]:
        """
        Return set of permission strings required to execute this tool.

        The ToolRegistry checks that the caller has all listed permissions
        before allowing execution.
        """
        pass

    @abstractmethod
    async def execute(
        self,
        parameters: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Execute the tool with validated parameters.

        Called by the ToolRegistry after parameter validation and permission
        checks have passed. Implementations can assume parameters conform
        to the declared schema.

        Args:
            parameters: Validated parameter dictionary.
            context: Optional conversation-scoped state shared across tool
                executions within the same chat. Tools can read from this
                context and return updated context in their result under
                the ``"context_updates"`` key. Tools that don't need context
                can ignore this parameter.

        Returns:
            Result dictionary. Structure is tool-specific. May optionally
            include a ``"context_updates"`` dict that will be merged into
            the conversation context.

        Raises:
            Exception: On execution failure.
        """
        pass

    def validate_parameters(self, parameters: Dict[str, Any]) -> Optional[List[str]]:
        """
        Validate parameters against the declared JSON Schema.

        Args:
            parameters: Parameter dictionary to validate.

        Returns:
            None if valid, or a list of validation error messages.
        """
        errors: List[str] = []
        try:
            jsonschema.validate(instance=parameters, schema=self.parameters_schema)
        except jsonschema.ValidationError as e:
            errors.append(e.message)
        except jsonschema.SchemaError as e:
            logger.error(f"Invalid schema for tool '{self.name}': {e.message}")
            errors.append(f"Internal schema error: {e.message}")
        return errors if errors else None
