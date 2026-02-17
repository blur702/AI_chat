"""
Unit tests for message schema validation.

Validates MessageSubmitRequest, MessageUpdateRequest,
and MessageUpdateResponse Pydantic models.
"""

import pytest
from pydantic import ValidationError

from app.schemas.context import (
    MessageSubmitRequest,
    MessageUpdateRequest,
    MessageUpdateResponse,
)


@pytest.mark.unit
class TestMessageSubmitRequest:
    def test_requires_content(self):
        req = MessageSubmitRequest(content="Hello, world!")
        assert req.content == "Hello, world!"

    def test_missing_content_raises(self):
        with pytest.raises(ValidationError) as exc_info:
            MessageSubmitRequest()
        assert "content" in str(exc_info.value)

    def test_content_min_length_1(self):
        with pytest.raises(ValidationError):
            MessageSubmitRequest(content="")

    def test_content_max_length_100000(self):
        req = MessageSubmitRequest(content="A" * 100_000)
        assert len(req.content) == 100_000

        with pytest.raises(ValidationError):
            MessageSubmitRequest(content="A" * 100_001)

    def test_optional_metadata(self):
        req = MessageSubmitRequest(content="test")
        assert req.metadata is None

        req_with = MessageSubmitRequest(
            content="test", metadata={"key": "value"}
        )
        assert req_with.metadata == {"key": "value"}

    def test_optional_model(self):
        req = MessageSubmitRequest(content="test")
        assert req.model is None

        req_with = MessageSubmitRequest(content="test", model="llama3.2")
        assert req_with.model == "llama3.2"


@pytest.mark.unit
class TestMessageUpdateRequest:
    def test_all_optional_fields(self):
        req = MessageUpdateRequest()
        assert req.content is None
        assert req.is_pinned is None
        assert req.is_excluded is None

    def test_partial_update_pin(self):
        req = MessageUpdateRequest(is_pinned=True)
        assert req.is_pinned is True
        assert req.content is None

    def test_partial_update_content(self):
        req = MessageUpdateRequest(content="Updated content")
        assert req.content == "Updated content"

    def test_content_min_length_1(self):
        with pytest.raises(ValidationError):
            MessageUpdateRequest(content="")

    def test_content_max_length_100000(self):
        with pytest.raises(ValidationError):
            MessageUpdateRequest(content="A" * 100_001)

    def test_exclude_message(self):
        req = MessageUpdateRequest(is_excluded=True)
        assert req.is_excluded is True


@pytest.mark.unit
class TestMessageUpdateResponse:
    def test_expected_fields(self):
        resp = MessageUpdateResponse(
            id="msg-1",
            role="user",
            content="Hello",
        )
        assert resp.id == "msg-1"
        assert resp.role == "user"
        assert resp.content == "Hello"
        assert resp.is_pinned is False
        assert resp.is_excluded is False
        assert resp.updated_at is None

    def test_all_fields_populated(self):
        resp = MessageUpdateResponse(
            id="msg-2",
            role="assistant",
            content="Response",
            is_pinned=True,
            is_excluded=False,
            updated_at="2026-01-01T00:00:00Z",
        )
        assert resp.is_pinned is True
        assert resp.updated_at == "2026-01-01T00:00:00Z"

    def test_required_fields(self):
        with pytest.raises(ValidationError):
            MessageUpdateResponse(role="user", content="Hello")  # missing id

        with pytest.raises(ValidationError):
            MessageUpdateResponse(id="msg-1", content="Hello")  # missing role

        with pytest.raises(ValidationError):
            MessageUpdateResponse(id="msg-1", role="user")  # missing content
