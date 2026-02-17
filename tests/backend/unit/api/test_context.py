"""
Unit tests for context management schema validation.

Validates ConversationStateResponse, TokenUsageRequest,
ContextSnippetCreateRequest, and TokenizeRequest Pydantic models.
"""

import pytest
from pydantic import ValidationError

from app.schemas.context import (
    ContextSnippetCreateRequest,
    ConversationStateResponse,
    TokenizeRequest,
    TokenUsageRequest,
)


@pytest.mark.unit
class TestConversationStateResponse:
    def test_minimal_construction(self):
        resp = ConversationStateResponse(
            chat_id="chat-1",
            project_id="proj-1",
            title="Test Chat",
        )
        assert resp.chat_id == "chat-1"
        assert resp.project_id == "proj-1"
        assert resp.title == "Test Chat"
        assert resp.messages == []
        assert resp.compactions == []
        assert resp.current_token_count == 0
        assert resp.chat_instructions is None
        assert resp.system_prompt_id is None
        assert resp.chat_mode is None

    def test_full_construction(self):
        resp = ConversationStateResponse(
            chat_id="chat-2",
            project_id="proj-2",
            title="Full Chat",
            current_token_count=1500,
            chat_instructions="Be concise",
            system_prompt_id="sp-1",
            chat_mode="code",
        )
        assert resp.current_token_count == 1500
        assert resp.chat_instructions == "Be concise"

    def test_required_fields(self):
        with pytest.raises(ValidationError):
            ConversationStateResponse(project_id="p", title="t")  # missing chat_id

        with pytest.raises(ValidationError):
            ConversationStateResponse(chat_id="c", title="t")  # missing project_id

        with pytest.raises(ValidationError):
            ConversationStateResponse(chat_id="c", project_id="p")  # missing title


@pytest.mark.unit
class TestTokenUsageRequest:
    def test_valid_request(self):
        req = TokenUsageRequest(token_count=100, max_tokens=4096)
        assert req.token_count == 100
        assert req.max_tokens == 4096

    def test_token_count_must_be_positive(self):
        with pytest.raises(ValidationError):
            TokenUsageRequest(token_count=0, max_tokens=4096)

        with pytest.raises(ValidationError):
            TokenUsageRequest(token_count=-1, max_tokens=4096)

    def test_max_tokens_must_be_positive(self):
        with pytest.raises(ValidationError):
            TokenUsageRequest(token_count=100, max_tokens=0)

        with pytest.raises(ValidationError):
            TokenUsageRequest(token_count=100, max_tokens=-1)

    def test_both_fields_required(self):
        with pytest.raises(ValidationError):
            TokenUsageRequest(token_count=100)

        with pytest.raises(ValidationError):
            TokenUsageRequest(max_tokens=4096)


@pytest.mark.unit
class TestContextSnippetCreateRequest:
    def test_valid_request(self):
        req = ContextSnippetCreateRequest(
            name="My Snippet",
            content="Some useful context",
        )
        assert req.name == "My Snippet"
        assert req.content == "Some useful context"
        assert req.tags == []

    def test_name_not_blank(self):
        with pytest.raises(ValidationError) as exc_info:
            ContextSnippetCreateRequest(name="   ", content="test")
        assert "blank" in str(exc_info.value).lower()

    def test_name_is_stripped(self):
        req = ContextSnippetCreateRequest(name="  padded name  ", content="test")
        assert req.name == "padded name"

    def test_name_min_length_1(self):
        with pytest.raises(ValidationError):
            ContextSnippetCreateRequest(name="", content="test")

    def test_tags_max_20(self):
        tags_21 = [f"tag{i}" for i in range(21)]
        with pytest.raises(ValidationError) as exc_info:
            ContextSnippetCreateRequest(
                name="Snippet", content="test", tags=tags_21
            )
        assert "20" in str(exc_info.value)

    def test_tags_at_limit(self):
        tags_20 = [f"tag{i}" for i in range(20)]
        req = ContextSnippetCreateRequest(
            name="Snippet", content="test", tags=tags_20
        )
        assert len(req.tags) == 20

    def test_tags_empty_strings_stripped(self):
        req = ContextSnippetCreateRequest(
            name="Snippet", content="test", tags=["valid", "  ", ""]
        )
        assert req.tags == ["valid"]

    def test_tag_max_length_100(self):
        with pytest.raises(ValidationError):
            ContextSnippetCreateRequest(
                name="Snippet", content="test", tags=["A" * 101]
            )

    def test_optional_description(self):
        req = ContextSnippetCreateRequest(name="S", content="C")
        assert req.description is None

        req_with = ContextSnippetCreateRequest(
            name="S", content="C", description="A description"
        )
        assert req_with.description == "A description"


@pytest.mark.unit
class TestTokenizeRequest:
    def test_valid_request(self):
        req = TokenizeRequest(text="Hello world")
        assert req.text == "Hello world"

    def test_text_min_length_1(self):
        with pytest.raises(ValidationError):
            TokenizeRequest(text="")

    def test_text_max_length_100000(self):
        req = TokenizeRequest(text="A" * 100_000)
        assert len(req.text) == 100_000

        with pytest.raises(ValidationError):
            TokenizeRequest(text="A" * 100_001)

    def test_text_required(self):
        with pytest.raises(ValidationError):
            TokenizeRequest()
