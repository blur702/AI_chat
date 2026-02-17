"""Unit tests for the Chat model."""

from uuid import uuid4

import pytest

from app.models.chat import Chat


pytestmark = pytest.mark.unit


# ---------------------------------------------------------------------------
# Construction
# ---------------------------------------------------------------------------


class TestChatConstruction:
    """Tests for Chat model instantiation."""

    def test_basic_construction(self):
        project_id = uuid4()
        chat = Chat(
            id=uuid4(),
            project_id=project_id,
            title="Test Chat",
        )
        assert chat.project_id == project_id
        assert chat.title == "Test Chat"

    def test_with_all_fields(self):
        chat = Chat(
            id=uuid4(),
            project_id=uuid4(),
            title="Full Chat",
            is_pinned=True,
            is_archived=False,
            is_deleted=False,
            chat_instructions="Be helpful",
            chat_mode="agent",
        )
        assert chat.title == "Full Chat"
        assert chat.is_pinned is True
        assert chat.chat_instructions == "Be helpful"
        assert chat.chat_mode == "agent"


# ---------------------------------------------------------------------------
# Default values
# ---------------------------------------------------------------------------


class TestChatDefaults:
    """Tests for Chat default values.

    Note: SQLAlchemy mapped_column(default=X) sets INSERT-time defaults,
    not Python __init__ defaults. Pure Python construction yields None for
    unset columns. These tests verify the explicit-set behavior and the
    None-when-omitted behavior.
    """

    def test_boolean_fields_none_when_omitted(self):
        """Boolean fields are None in pure Python construction (INSERT default applies in DB)."""
        chat = Chat(
            id=uuid4(),
            project_id=uuid4(),
            title="Test",
        )
        # These are server-side INSERT defaults, not Python-side
        assert chat.is_deleted is None
        assert chat.is_pinned is None
        assert chat.is_archived is None

    def test_boolean_fields_when_explicitly_set(self):
        chat = Chat(
            id=uuid4(),
            project_id=uuid4(),
            title="Test",
            is_deleted=False,
            is_pinned=True,
            is_archived=False,
        )
        assert chat.is_deleted is False
        assert chat.is_pinned is True
        assert chat.is_archived is False

    def test_deleted_at_defaults_none(self):
        chat = Chat(
            id=uuid4(),
            project_id=uuid4(),
            title="Test",
        )
        assert chat.deleted_at is None

    def test_system_prompt_id_defaults_none(self):
        chat = Chat(
            id=uuid4(),
            project_id=uuid4(),
            title="Test",
        )
        assert chat.system_prompt_id is None

    def test_chat_mode_none_when_omitted(self):
        chat = Chat(
            id=uuid4(),
            project_id=uuid4(),
            title="Test",
        )
        # Server-side default is "agent", but Python-side is None
        assert chat.chat_mode is None

    def test_chat_mode_when_explicitly_set(self):
        chat = Chat(
            id=uuid4(),
            project_id=uuid4(),
            title="Test",
            chat_mode="agent",
        )
        assert chat.chat_mode == "agent"


# ---------------------------------------------------------------------------
# soft_delete / restore
# ---------------------------------------------------------------------------


class TestChatSoftDelete:
    """Tests for soft_delete and restore methods."""

    def test_soft_delete(self):
        chat = Chat(
            id=uuid4(),
            project_id=uuid4(),
            title="Test",
            is_deleted=False,
        )
        chat.soft_delete()
        assert chat.is_deleted is True
        # deleted_at is set via func.now(), which is a SQL expression
        # In unit tests without a DB session, it will be an SQL clause element
        assert chat.deleted_at is not None

    def test_restore(self):
        chat = Chat(
            id=uuid4(),
            project_id=uuid4(),
            title="Test",
            is_deleted=True,
        )
        chat.restore()
        assert chat.is_deleted is False
        assert chat.deleted_at is None


# ---------------------------------------------------------------------------
# __repr__
# ---------------------------------------------------------------------------


class TestChatRepr:
    """Tests for Chat.__repr__."""

    def test_repr_format(self):
        uid = uuid4()
        pid = uuid4()
        chat = Chat(
            id=uid,
            project_id=pid,
            title="My Chat",
        )
        r = repr(chat)
        assert "Chat" in r
        assert "My Chat" in r
        assert str(uid) in r
        assert str(pid) in r
