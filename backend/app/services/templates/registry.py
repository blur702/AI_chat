"""Template definition model and registry for sandbox templates."""

import json
import logging
from pathlib import Path
from typing import Dict, List, Optional

from pydantic import BaseModel, Field

logger = logging.getLogger("workstation.templates")

DEFINITIONS_DIR = Path(__file__).parent / "definitions"


class SidecarService(BaseModel):
    """A sidecar container that runs alongside the main sandbox."""

    name: str
    image: str
    environment: Dict[str, str] = Field(default_factory=dict)
    exposed_ports: List[int] = Field(default_factory=list)
    volumes: Dict[str, str] = Field(default_factory=dict)
    command: Optional[str] = None
    memory_limit: Optional[str] = None


class TemplateDefinition(BaseModel):
    """Schema for a sandbox project template."""

    id: str
    name: str
    description: str
    category: str = Field(description="Category grouping, e.g. 'python', 'node', 'php'")
    docker_image: Optional[str] = Field(
        None, description="Pre-built Docker image to use"
    )
    dockerfile: Optional[str] = Field(
        None, description="Relative path to a Dockerfile to build"
    )
    scaffold_files: Dict[str, str] = Field(
        default_factory=dict,
        description="Map of file path -> content to scaffold into /workspace",
    )
    setup_commands: List[str] = Field(
        default_factory=list,
        description="Commands to run inside the container after creation",
    )
    exposed_ports: List[int] = Field(
        default_factory=list,
        description="Ports the container exposes for preview",
    )
    environment: Dict[str, str] = Field(
        default_factory=dict,
        description="Environment variables to set in the container",
    )
    sidecar_services: List[SidecarService] = Field(
        default_factory=list,
        description="Additional containers to run alongside the sandbox",
    )
    memory_limit: str = Field(
        default="512m", description="Docker memory limit"
    )
    cpu_quota: int = Field(
        default=50000, description="Docker CPU quota (microseconds per period)"
    )


class TemplateRegistry:
    """Loads and provides access to template definitions from JSON files."""

    def __init__(self, definitions_dir: Optional[Path] = None) -> None:
        self._definitions_dir = definitions_dir or DEFINITIONS_DIR
        self._templates: Dict[str, TemplateDefinition] = {}
        self._load_definitions()

    def _load_definitions(self) -> None:
        """Scan the definitions directory for JSON template files."""
        if not self._definitions_dir.is_dir():
            logger.warning(
                "Template definitions directory not found: %s", self._definitions_dir
            )
            return

        for json_path in sorted(self._definitions_dir.glob("*.json")):
            try:
                raw = json.loads(json_path.read_text(encoding="utf-8"))
                template = TemplateDefinition(**raw)
                self._templates[template.id] = template
                logger.debug("Loaded template: %s", template.id)
            except Exception:
                logger.exception("Failed to load template from %s", json_path)

        logger.info("Loaded %d template definitions", len(self._templates))

    def get(self, template_id: str) -> Optional[TemplateDefinition]:
        """Return a template by ID, or None if not found."""
        return self._templates.get(template_id)

    def list_all(self) -> List[TemplateDefinition]:
        """Return all registered templates."""
        return list(self._templates.values())

    def list_by_category(self, category: str) -> List[TemplateDefinition]:
        """Return templates filtered by category."""
        return [t for t in self._templates.values() if t.category == category]

    @property
    def categories(self) -> List[str]:
        """Return sorted list of unique categories."""
        return sorted({t.category for t in self._templates.values()})

    def reload(self) -> None:
        """Re-scan definitions directory."""
        self._templates.clear()
        self._load_definitions()
