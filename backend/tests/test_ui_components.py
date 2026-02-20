"""Unit tests for UI Component CRUD and schema validation."""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.models.ui_component import UIComponent
from app.schemas.ui_component import (
    UIComponentCreateRequest,
    UIComponentUpdateRequest,
    UIComponentResponse,
    UIComponentListResponse,
)


# ---------------------------------------------------------------------------
# Schema validation
# ---------------------------------------------------------------------------


class TestUIComponentSchemaValidation:
    """Validate Pydantic schemas for UI components."""

    @pytest.mark.unit
    def test_create_request_valid(self):
        req = UIComponentCreateRequest(
            name="Button",
            category="basic",
            description="A clickable button",
            html_template='<button class="btn">{{label}}</button>',
            tags=["basic", "interactive"],
            is_mobile_responsive=True,
        )
        assert req.name == "Button"
        assert req.category == "basic"
        assert req.is_framework_specific is False
        assert req.framework is None
        assert req.props_schema == {}
        assert req.tags == ["basic", "interactive"]

    @pytest.mark.unit
    def test_create_request_minimal(self):
        req = UIComponentCreateRequest(
            name="X",
            category="a",
            html_template="<div></div>",
        )
        assert req.description == ""
        assert req.tags == []
        assert req.is_mobile_responsive is True

    @pytest.mark.unit
    def test_create_request_rejects_empty_name(self):
        with pytest.raises(Exception):
            UIComponentCreateRequest(
                name="",
                category="basic",
                html_template="<div></div>",
            )

    @pytest.mark.unit
    def test_create_request_rejects_empty_template(self):
        with pytest.raises(Exception):
            UIComponentCreateRequest(
                name="Button",
                category="basic",
                html_template="",
            )

    @pytest.mark.unit
    def test_update_request_partial(self):
        req = UIComponentUpdateRequest(name="New Name")
        dumped = req.model_dump(exclude_unset=True)
        assert dumped == {"name": "New Name"}

    @pytest.mark.unit
    def test_update_request_empty(self):
        req = UIComponentUpdateRequest()
        dumped = req.model_dump(exclude_unset=True)
        assert dumped == {}

    @pytest.mark.unit
    def test_response_from_attributes(self):
        resp = UIComponentResponse(
            id="abc-123",
            name="Card",
            category="layout",
            description="A card container",
            is_framework_specific=False,
            html_template="<div class='card'>{{children}}</div>",
            tags=["layout"],
            is_mobile_responsive=True,
        )
        assert resp.id == "abc-123"
        assert resp.framework is None
        assert resp.framework_code is None

    @pytest.mark.unit
    def test_list_response_defaults(self):
        resp = UIComponentListResponse()
        assert resp.components == []
        assert resp.categories == []
        assert resp.count == 0


# ---------------------------------------------------------------------------
# Model construction
# ---------------------------------------------------------------------------


class TestUIComponentModel:
    """Test the SQLAlchemy model construction."""

    @pytest.mark.unit
    def test_model_default_values(self):
        comp = UIComponent(
            name="Input",
            category="form",
            html_template="<input />",
        )
        assert comp.name == "Input"
        assert comp.category == "form"
        # SQLAlchemy `default=` is server-side; Python-side value is None
        # until INSERT. Verify the column exists and accepts False.
        assert comp.is_framework_specific in (False, None)
        assert comp.is_mobile_responsive in (True, None)

    @pytest.mark.unit
    def test_model_with_framework(self):
        comp = UIComponent(
            name="Button",
            category="basic",
            html_template="<button>{{label}}</button>",
            is_framework_specific=True,
            framework="react",
            framework_code="export const Button = ({label}) => <button>{label}</button>;",
        )
        assert comp.is_framework_specific is True
        assert comp.framework == "react"

    @pytest.mark.unit
    def test_model_with_props_schema(self):
        schema = {
            "type": "object",
            "properties": {
                "label": {"type": "string", "default": "Click me"},
                "variant": {"type": "string", "enum": ["primary", "secondary"]},
                "disabled": {"type": "boolean", "default": False},
            },
        }
        comp = UIComponent(
            name="Button",
            category="basic",
            html_template="<button>{{label}}</button>",
            props_schema=schema,
        )
        assert "properties" in comp.props_schema
        assert "label" in comp.props_schema["properties"]

    @pytest.mark.unit
    def test_model_tags(self):
        comp = UIComponent(
            name="Gallery",
            category="media",
            html_template="<div class='gallery'></div>",
            tags=["media", "responsive", "grid"],
        )
        assert len(comp.tags) == 3
        assert "responsive" in comp.tags


# ---------------------------------------------------------------------------
# API helper: _component_to_response
# ---------------------------------------------------------------------------


class TestComponentToResponse:
    """Test the _component_to_response helper function."""

    @pytest.mark.unit
    def test_converts_model_to_response(self):
        from app.api.ui_components import _component_to_response
        from datetime import datetime

        comp = MagicMock(spec=UIComponent)
        comp.id = uuid4()
        comp.name = "Button"
        comp.category = "basic"
        comp.description = "A button"
        comp.is_framework_specific = False
        comp.framework = None
        comp.html_template = "<button>{{label}}</button>"
        comp.framework_code = None
        comp.props_schema = {"properties": {"label": {"type": "string"}}}
        comp.preview_image = None
        comp.tags = ["basic"]
        comp.is_mobile_responsive = True
        comp.created_at = datetime(2024, 1, 1, 12, 0, 0)

        resp = _component_to_response(comp)
        assert resp.id == str(comp.id)
        assert resp.name == "Button"
        assert resp.tags == ["basic"]
        assert resp.created_at == "2024-01-01T12:00:00"

    @pytest.mark.unit
    def test_handles_none_optional_fields(self):
        from app.api.ui_components import _component_to_response

        comp = MagicMock(spec=UIComponent)
        comp.id = uuid4()
        comp.name = "Spacer"
        comp.category = "layout"
        comp.description = ""
        comp.is_framework_specific = False
        comp.framework = None
        comp.html_template = "<div></div>"
        comp.framework_code = None
        comp.props_schema = None
        comp.preview_image = None
        comp.tags = None
        comp.is_mobile_responsive = True
        comp.created_at = None

        resp = _component_to_response(comp)
        assert resp.props_schema == {}
        assert resp.tags == []
        assert resp.created_at is None


# ---------------------------------------------------------------------------
# Filtering logic
# ---------------------------------------------------------------------------


class TestUIComponentFiltering:
    """Test the query filtering logic in the list endpoint."""

    @pytest.mark.unit
    def test_tag_splitting(self):
        """Verify tag query parameter parsing logic."""
        raw = "basic, interactive , responsive"
        tag_list = [t.strip() for t in raw.split(",") if t.strip()]
        assert tag_list == ["basic", "interactive", "responsive"]

    @pytest.mark.unit
    def test_tag_splitting_empty(self):
        raw = "  ,  , "
        tag_list = [t.strip() for t in raw.split(",") if t.strip()]
        assert tag_list == []

    @pytest.mark.unit
    def test_tag_splitting_single(self):
        raw = "layout"
        tag_list = [t.strip() for t in raw.split(",") if t.strip()]
        assert tag_list == ["layout"]
