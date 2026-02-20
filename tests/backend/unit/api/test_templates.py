"""
Unit tests for system prompt (template) schema validation.

Validates SystemPromptCreateRequest, SystemPromptUpdateRequest,
and SystemPromptResponse Pydantic models.
"""

import pytest
from pydantic import ValidationError

from app.schemas.context import (
    SystemPromptCreateRequest,
    SystemPromptResponse,
    SystemPromptUpdateRequest,
)


@pytest.mark.unit
class TestSystemPromptCreateRequest:
    def test_requires_name_and_content(self):
        req = SystemPromptCreateRequest(name="My Prompt", content="You are helpful.")
        assert req.name == "My Prompt"
        assert req.content == "You are helpful."

    def test_missing_name_raises(self):
        with pytest.raises(ValidationError) as exc_info:
            SystemPromptCreateRequest(content="Some content")
        assert "name" in str(exc_info.value)

    def test_missing_content_raises(self):
        with pytest.raises(ValidationError) as exc_info:
            SystemPromptCreateRequest(name="Prompt")
        assert "content" in str(exc_info.value)

    def test_name_max_length_255(self):
        req = SystemPromptCreateRequest(name="A" * 255, content="test")
        assert len(req.name) == 255

        with pytest.raises(ValidationError):
            SystemPromptCreateRequest(name="A" * 256, content="test")

    def test_content_min_length_1(self):
        with pytest.raises(ValidationError):
            SystemPromptCreateRequest(name="Prompt", content="")

    def test_content_max_length_50000(self):
        req = SystemPromptCreateRequest(name="Prompt", content="A" * 50000)
        assert len(req.content) == 50000

        with pytest.raises(ValidationError):
            SystemPromptCreateRequest(name="Prompt", content="A" * 50001)

    def test_optional_description(self):
        req = SystemPromptCreateRequest(name="Prompt", content="test")
        assert req.description is None

        req_with = SystemPromptCreateRequest(
            name="Prompt", content="test", description="A coding assistant"
        )
        assert req_with.description == "A coding assistant"

    def test_is_default_defaults_false(self):
        req = SystemPromptCreateRequest(name="Prompt", content="test")
        assert req.is_default is False

    def test_is_default_can_be_true(self):
        req = SystemPromptCreateRequest(
            name="Prompt", content="test", is_default=True
        )
        assert req.is_default is True


@pytest.mark.unit
class TestSystemPromptUpdateRequest:
    def test_all_fields_optional(self):
        req = SystemPromptUpdateRequest()
        assert req.name is None
        assert req.content is None
        assert req.description is None
        assert req.is_default is None

    def test_partial_update_name(self):
        req = SystemPromptUpdateRequest(name="New Name")
        assert req.name == "New Name"
        assert req.content is None

    def test_partial_update_content(self):
        req = SystemPromptUpdateRequest(content="Updated content")
        assert req.content == "Updated content"

    def test_content_min_length_1(self):
        with pytest.raises(ValidationError):
            SystemPromptUpdateRequest(content="")

    def test_name_max_length_255(self):
        with pytest.raises(ValidationError):
            SystemPromptUpdateRequest(name="A" * 256)


@pytest.mark.unit
class TestSystemPromptResponse:
    def test_expected_fields(self):
        resp = SystemPromptResponse(
            id="sp-1",
            name="Test Prompt",
            content="You are a helpful assistant.",
        )
        assert resp.id == "sp-1"
        assert resp.name == "Test Prompt"
        assert resp.content == "You are a helpful assistant."
        assert resp.description is None
        assert resp.is_default is False
        assert resp.created_at is None
        assert resp.updated_at is None

    def test_all_fields_populated(self):
        resp = SystemPromptResponse(
            id="sp-2",
            name="Full Prompt",
            content="Be concise.",
            description="A concise assistant",
            is_default=True,
            created_at="2026-01-01T00:00:00Z",
            updated_at="2026-01-02T00:00:00Z",
        )
        assert resp.is_default is True
        assert resp.description == "A concise assistant"
        assert resp.created_at == "2026-01-01T00:00:00Z"

    def test_required_fields(self):
        with pytest.raises(ValidationError):
            SystemPromptResponse(name="P", content="C")  # missing id

        with pytest.raises(ValidationError):
            SystemPromptResponse(id="1", content="C")  # missing name

        with pytest.raises(ValidationError):
            SystemPromptResponse(id="1", name="P")  # missing content
