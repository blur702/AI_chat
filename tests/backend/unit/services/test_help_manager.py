"""Tests for HelpManager service."""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.services.help_manager import HelpManager


@pytest.fixture
def mock_db():
    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.rollback = AsyncMock()
    db.delete = AsyncMock()
    return db


@pytest.fixture
def manager(mock_db):
    return HelpManager(mock_db)


class TestGetTopic:
    @pytest.mark.asyncio
    async def test_returns_topic_when_found(self, manager, mock_db):
        mock_topic = MagicMock(id=uuid4(), slug="getting-started")
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_topic
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await manager.get_topic(mock_topic.id)
        assert result is mock_topic

    @pytest.mark.asyncio
    async def test_returns_none_when_not_found(self, manager, mock_db):
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await manager.get_topic(uuid4())
        assert result is None


class TestGetTopicBySlug:
    @pytest.mark.asyncio
    async def test_returns_topic_by_slug(self, manager, mock_db):
        mock_topic = MagicMock(slug="faq")
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_topic
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await manager.get_topic_by_slug("faq")
        assert result is mock_topic


class TestListTopics:
    @pytest.mark.asyncio
    async def test_list_all_topics(self, manager, mock_db):
        topics = [MagicMock(slug="a"), MagicMock(slug="b")]
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = topics
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await manager.list_topics()
        assert len(result) == 2

    @pytest.mark.asyncio
    async def test_list_with_section_filter(self, manager, mock_db):
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await manager.list_topics(section_id="getting-started")
        assert result == []
        mock_db.execute.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_list_with_tag_filter(self, manager, mock_db):
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await manager.list_topics(tag="beginner")
        assert result == []


class TestCreateTopic:
    @pytest.mark.asyncio
    async def test_creates_topic_successfully(self, manager, mock_db):
        with patch("app.services.help_manager.HelpTopic") as MockTopic:
            mock_instance = MagicMock(slug="new-topic", title="New Topic")
            MockTopic.return_value = mock_instance

            result = await manager.create_topic(
                slug="new-topic", section_id="general", title="New Topic", body="Body text",
            )
            assert result is mock_instance
            mock_db.add.assert_called_once()
            mock_db.commit.assert_awaited_once()
            mock_db.refresh.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_creates_topic_with_tags(self, manager, mock_db):
        with patch("app.services.help_manager.HelpTopic") as MockTopic:
            mock_instance = MagicMock()
            MockTopic.return_value = mock_instance

            await manager.create_topic(
                slug="tagged", section_id="general", title="Tagged", body="Body",
                tags=["python", "tutorial"],
            )
            call_kwargs = MockTopic.call_args[1]
            assert call_kwargs["tags"] == ["python", "tutorial"]

    @pytest.mark.asyncio
    async def test_create_topic_rollback_on_error(self, manager, mock_db):
        mock_db.commit = AsyncMock(side_effect=Exception("DB error"))
        with patch("app.services.help_manager.HelpTopic"):
            with pytest.raises(Exception, match="DB error"):
                await manager.create_topic(
                    slug="fail", section_id="general", title="Fail", body="Body",
                )
            mock_db.rollback.assert_awaited_once()


class TestCreateOrUpdateTopic:
    @pytest.mark.asyncio
    async def test_creates_when_not_existing(self, manager, mock_db):
        # Patch get_topic_by_slug to return None (new topic)
        manager.get_topic_by_slug = AsyncMock(return_value=None)
        # Patch create_topic to return a mock
        mock_created = MagicMock(slug="new")
        manager.create_topic = AsyncMock(return_value=mock_created)

        topic, changed = await manager.create_or_update_topic(
            slug="new", section_id="general", title="New", body="Body",
        )
        assert changed is True
        assert topic is mock_created

    @pytest.mark.asyncio
    async def test_no_change_when_identical(self, manager, mock_db):
        existing = MagicMock(
            slug="existing", section_id="general", title="Title", body="Body", tags=["tag1"],
        )
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = existing
        mock_db.execute = AsyncMock(return_value=mock_result)

        topic, changed = await manager.create_or_update_topic(
            slug="existing", section_id="general", title="Title", body="Body", tags=["tag1"],
        )
        assert changed is False
        assert topic is existing

    @pytest.mark.asyncio
    async def test_updates_when_different(self, manager, mock_db):
        existing = MagicMock(
            slug="existing", section_id="general", title="Old Title", body="Old Body", tags=[],
        )
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = existing
        mock_db.execute = AsyncMock(return_value=mock_result)

        topic, changed = await manager.create_or_update_topic(
            slug="existing", section_id="general", title="New Title", body="New Body",
        )
        assert changed is True
        assert existing.title == "New Title"
        assert existing.body == "New Body"
        mock_db.commit.assert_awaited_once()


class TestDeleteTopic:
    @pytest.mark.asyncio
    async def test_deletes_existing_topic(self, manager, mock_db):
        mock_topic = MagicMock(id=uuid4())
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_topic
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await manager.delete_topic(mock_topic.id)
        assert result is True
        mock_db.delete.assert_awaited_once()
        mock_db.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_returns_false_when_not_found(self, manager, mock_db):
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await manager.delete_topic(uuid4())
        assert result is False

    @pytest.mark.asyncio
    async def test_returns_false_on_delete_error(self, manager, mock_db):
        mock_topic = MagicMock(id=uuid4())
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_topic
        mock_db.execute = AsyncMock(return_value=mock_result)
        mock_db.delete = AsyncMock(side_effect=Exception("DB error"))

        result = await manager.delete_topic(mock_topic.id)
        assert result is False
        mock_db.rollback.assert_awaited_once()
