"""
Unit tests for chat CRUD schemas.

Validates ChatCreateRequest, ChatUpdateRequest, ChatCreateResponse,
and ChatSummary Pydantic models.
"""

from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas.context import (
    ChatCreateRequest,
    ChatCreateResponse,
    ChatSummary,
    ChatUpdateRequest,
)


@pytest.mark.unit
class TestChatCreateRequest:
    def test_requires_project_id_and_title(self):
        pid = uuid4()
        req = ChatCreateRequest(project_id=pid, title="Test Chat")
        assert req.project_id == pid
        assert req.title == "Test Chat"

    def test_missing_project_id_raises(self):
        with pytest.raises(ValidationError) as exc_info:
            ChatCreateRequest(title="Test Chat")
        assert "project_id" in str(exc_info.value)

    def test_missing_title_raises(self):
        with pytest.raises(ValidationError) as exc_info:
            ChatCreateRequest(project_id=uuid4())
        assert "title" in str(exc_info.value)

    def test_title_max_length(self):
        req = ChatCreateRequest(project_id=uuid4(), title="A" * 500)
        assert len(req.title) == 500

        with pytest.raises(ValidationError):
            ChatCreateRequest(project_id=uuid4(), title="A" * 501)

    def test_optional_fields_default_none(self):
        req = ChatCreateRequest(project_id=uuid4(), title="Test")
        assert req.chat_instructions is None
        assert req.system_prompt_id is None
        assert req.chat_mode is None

    def test_project_id_must_be_uuid(self):
        with pytest.raises(ValidationError):
            ChatCreateRequest(project_id="not-a-uuid", title="Test")


@pytest.mark.unit
class TestChatUpdateRequest:
    def test_all_fields_optional(self):
        req = ChatUpdateRequest()
        assert req.title is None
        assert req.is_pinned is None
        assert req.is_archived is None
        assert req.chat_instructions is None
        assert req.system_prompt_id is None
        assert req.chat_mode is None

    def test_partial_update(self):
        req = ChatUpdateRequest(title="New Title", is_pinned=True)
        assert req.title == "New Title"
        assert req.is_pinned is True
        assert req.is_archived is None

    def test_title_max_length(self):
        with pytest.raises(ValidationError):
            ChatUpdateRequest(title="A" * 501)


@pytest.mark.unit
class TestChatCreateResponse:
    def test_expected_fields(self):
        resp = ChatCreateResponse(
            id="chat-1",
            title="Test Chat",
            project_id="proj-1",
        )
        assert resp.id == "chat-1"
        assert resp.title == "Test Chat"
        assert resp.project_id == "proj-1"
        assert resp.chat_instructions is None
        assert resp.system_prompt_id is None
        assert resp.chat_mode is None
        assert resp.created_at is None

    def test_all_fields_populated(self):
        resp = ChatCreateResponse(
            id="chat-2",
            title="Full Chat",
            project_id="proj-2",
            chat_instructions="Be concise",
            system_prompt_id="sp-1",
            chat_mode="code",
            created_at="2026-01-01T00:00:00Z",
        )
        assert resp.chat_instructions == "Be concise"
        assert resp.created_at == "2026-01-01T00:00:00Z"


@pytest.mark.unit
class TestChatSummary:
    def test_minimal_construction(self):
        summary = ChatSummary(id="c1", title="Chat One")
        assert summary.id == "c1"
        assert summary.title == "Chat One"
        assert summary.is_pinned is False
        assert summary.is_archived is False

    def test_full_construction(self):
        summary = ChatSummary(
            id="c2",
            title="Chat Two",
            is_pinned=True,
            is_archived=True,
            chat_mode="creative",
            created_at="2026-01-01",
            updated_at="2026-01-02",
        )
        assert summary.is_pinned is True
        assert summary.is_archived is True
        assert summary.chat_mode == "creative"
