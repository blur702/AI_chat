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


class TechnologyDefinition(BaseModel):
    """Schema for a modular technology that can be composed into a project."""

    id: str
    name: str
    description: str
    category: str = Field(description="Category grouping, e.g. 'frontend', 'backend', 'database', 'language'")
    dependencies: List[str] = Field(
        default_factory=list,
        description="Package manager dependencies (e.g. npm packages, pip packages)",
    )
    install_commands: List[str] = Field(
        default_factory=list,
        description="Installation steps specific to this technology",
    )
    scaffold_files: Dict[str, str] = Field(
        default_factory=dict,
        description="Technology-specific boilerplate files to scaffold into /workspace",
    )
    environment: Dict[str, str] = Field(
        default_factory=dict,
        description="Environment variables to set in the container",
    )
    sidecar_services: List[SidecarService] = Field(
        default_factory=list,
        description="Database containers or other services to run alongside the sandbox",
    )
    requires_technologies: List[str] = Field(
        default_factory=list,
        description="Technology IDs this technology depends on (e.g. TypeScript requires Node.js)",
    )
    conflicts_with: List[str] = Field(
        default_factory=list,
        description="Technology IDs that are incompatible with this technology",
    )
    docker_image: Optional[str] = Field(
        None,
        description="Base Docker image override when this technology is a language runtime",
    )
    exposed_ports: List[int] = Field(
        default_factory=list,
        description="Ports this technology exposes for preview",
    )


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
    selected_technologies: List[str] = Field(
        default_factory=list,
        description="Technology IDs that compose this template (used as a preset)",
    )


class TemplateRegistry:
    """Loads and provides access to template and technology definitions from JSON files."""

    def __init__(self, definitions_dir: Optional[Path] = None) -> None:
        self._definitions_dir = definitions_dir or DEFINITIONS_DIR
        self._templates: Dict[str, TemplateDefinition] = {}
        self._technologies: Dict[str, TechnologyDefinition] = {}
        self._load_definitions()

    def _load_definitions(self) -> None:
        """Scan the definitions directory for JSON template and technology files."""
        if not self._definitions_dir.is_dir():
            logger.warning(
                "Template definitions directory not found: %s", self._definitions_dir
            )
            return

        # Load template definitions from top-level JSON files
        for json_path in sorted(self._definitions_dir.glob("*.json")):
            try:
                raw = json.loads(json_path.read_text(encoding="utf-8"))
                template = TemplateDefinition(**raw)
                self._templates[template.id] = template
                logger.debug("Loaded template: %s", template.id)
            except Exception:
                logger.exception("Failed to load template from %s", json_path)

        logger.info("Loaded %d template definitions", len(self._templates))

        # Load technology definitions from technologies/ subdirectory
        tech_dir = self._definitions_dir / "technologies"
        if tech_dir.is_dir():
            for json_path in sorted(tech_dir.glob("*.json")):
                try:
                    raw = json.loads(json_path.read_text(encoding="utf-8"))
                    tech = TechnologyDefinition(**raw)
                    self._technologies[tech.id] = tech
                    logger.debug("Loaded technology: %s", tech.id)
                except Exception:
                    logger.exception("Failed to load technology from %s", json_path)

            logger.info("Loaded %d technology definitions", len(self._technologies))

    # -- Template access ------------------------------------------------------

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
        """Return sorted list of unique template categories."""
        return sorted({t.category for t in self._templates.values()})

    # -- Technology access ----------------------------------------------------

    def get_technology(self, tech_id: str) -> Optional[TechnologyDefinition]:
        """Return a technology by ID, or None if not found."""
        return self._technologies.get(tech_id)

    def list_all_technologies(self) -> List[TechnologyDefinition]:
        """Return all registered technologies."""
        return list(self._technologies.values())

    def list_technologies_by_category(self, category: str) -> List[TechnologyDefinition]:
        """Return technologies filtered by category."""
        return [t for t in self._technologies.values() if t.category == category]

    @property
    def technology_categories(self) -> List[str]:
        """Return sorted list of unique technology categories."""
        return sorted({t.category for t in self._technologies.values()})

    # -- Reload ---------------------------------------------------------------

    def reload(self) -> None:
        """Re-scan definitions directory."""
        self._templates.clear()
        self._technologies.clear()
        self._load_definitions()
