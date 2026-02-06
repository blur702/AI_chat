"""Unit tests for the ContextManager kernel service."""

import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.kernel.context_manager import ContextManager
from tests.kernel.test_helpers import (
    assert_redis_key_exists,
    assert_redis_key_absent,
    assert_redis_key_ttl,
    make_chat,
    make_compaction,
    make_message,
    make_project,
    make_user_preference,
)


# =========================================================================
# Lifecycle Tests
# =========================================================================

class TestContextManagerLifecycle:
    """Tests for ContextManager startup/shutdown/health."""

    @pytest.mark.unit
    async def test_startup_creates_redis(self, mock_redis, mock_session_factory):
        """startup() initializes Redis and sets running=True."""
        cm = ContextManager(
            session_factory=mock_session_factory,
            redis_client=mock_redis,
        )
        await cm.startup()

        assert cm.is_running
        assert cm.name == "context_manager"
        await cm.shutdown()

    @pytest.mark.unit
    async def test_startup_idempotent(self, mock_redis, mock_session_factory):
        """Calling startup() twice is safe."""
        cm = ContextManager(session_factory=mock_session_factory, redis_client=mock_redis)
        await cm.startup()
        await cm.startup()
        assert cm.is_running
        await cm.shutdown()

    @pytest.mark.unit
    async def test_shutdown_closes_redis(self, mock_redis, mock_session_factory):
        """shutdown() closes Redis connection when owned."""
        cm = ContextManager(session_factory=mock_session_factory, redis_client=None)
        cm._redis = mock_redis
        cm._owns_redis = True
        cm._running = True

        await cm.shutdown()
        assert not cm.is_running

    @pytest.mark.unit
    async def test_health_check_healthy(self, mock_redis, mock_session_factory):
        """health_check returns (True, 'ok') when running."""
        cm = ContextManager(session_factory=mock_session_factory, redis_client=mock_redis)
        await cm.startup()

        healthy, msg = await cm.health_check()
        assert healthy is True
        assert msg == "ok"
        await cm.shutdown()

    @pytest.mark.unit
    async def test_health_check_not_running(self, mock_redis, mock_session_factory):
        """health_check returns (False, ...) when not running."""
        cm = ContextManager(session_factory=mock_session_factory, redis_client=mock_redis)

        healthy, msg = await cm.health_check()
        assert healthy is False
        assert "not running" in msg


# =========================================================================
# Conversation State Tests
# =========================================================================

class TestConversationState:
    """Tests for conversation state management."""

    @pytest.fixture
    def cm(self, mock_redis, mock_session_factory):
        cm = ContextManager(session_factory=mock_session_factory, redis_client=mock_redis)
        cm._running = True
        return cm

    @pytest.mark.unit
    async def test_get_conversation_state_cache_hit(self, cm):
        """Cache hit returns cached data without DB query."""
        chat_id = uuid.uuid4()
        state = {"chat_id": str(chat_id), "title": "cached", "messages": []}
        cache_key = cm.CONVERSATION_CONTEXT_PREFIX + str(chat_id)
        await cm._redis.setex(cache_key, 3600, json.dumps(state))

        result = await cm.get_conversation_state(chat_id)
        assert result["title"] == "cached"

    @pytest.mark.unit
    async def test_get_conversation_state_cache_miss(self, cm, mock_db_session):
        """Cache miss loads from database and populates cache."""
        chat_id = uuid.uuid4()
        project_id = uuid.uuid4()
        msg = make_message(role="user", content="hello")
        comp = make_compaction(original_message_count=10, summary="summary")
        chat = make_chat(
            chat_id=chat_id,
            project_id=project_id,
            title="From DB",
            messages=[msg],
            context_compactions=[comp],
        )

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = chat
        mock_db_session.execute.return_value = mock_result

        result = await cm.get_conversation_state(chat_id)
        assert result is not None
        assert result["title"] == "From DB"
        assert len(result["messages"]) == 1
        assert len(result["compactions"]) == 1

        # Cache should be populated
        cache_key = cm.CONVERSATION_CONTEXT_PREFIX + str(chat_id)
        await assert_redis_key_exists(cm._redis, cache_key)

    @pytest.mark.unit
    async def test_get_conversation_state_not_found(self, cm, mock_db_session):
        """Returns None when chat not found in DB."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db_session.execute.return_value = mock_result

        result = await cm.get_conversation_state(uuid.uuid4())
        assert result is None

    @pytest.mark.unit
    async def test_invalidate_conversation_cache(self, cm):
        """invalidate_conversation_cache deletes Redis key."""
        chat_id = uuid.uuid4()
        cache_key = cm.CONVERSATION_CONTEXT_PREFIX + str(chat_id)
        await cm._redis.setex(cache_key, 3600, json.dumps({"test": True}))

        await cm.invalidate_conversation_cache(chat_id)
        await assert_redis_key_absent(cm._redis, cache_key)

    @pytest.mark.unit
    async def test_conversation_cache_ttl(self, cm, mock_db_session):
        """Conversation cache has 1 hour TTL."""
        chat_id = uuid.uuid4()
        chat = make_chat(chat_id=chat_id, title="Test")
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = chat
        mock_db_session.execute.return_value = mock_result

        await cm.get_conversation_state(chat_id)

        cache_key = cm.CONVERSATION_CONTEXT_PREFIX + str(chat_id)
        await assert_redis_key_ttl(cm._redis, cache_key, cm.CONVERSATION_CACHE_TTL)


# =========================================================================
# Project Context Tests
# =========================================================================

class TestProjectContext:
    """Tests for project-level context management."""

    @pytest.fixture
    def cm(self, mock_redis, mock_session_factory):
        cm = ContextManager(session_factory=mock_session_factory, redis_client=mock_redis)
        cm._running = True
        return cm

    @pytest.mark.unit
    async def test_get_project_context_cache_hit(self, cm):
        """Cache hit returns cached project data."""
        project_id = uuid.uuid4()
        ctx = {"project_id": str(project_id), "name": "cached project", "chats": []}
        cache_key = cm.PROJECT_CONTEXT_PREFIX + str(project_id)
        await cm._redis.setex(cache_key, 7200, json.dumps(ctx))

        result = await cm.get_project_context(project_id)
        assert result["name"] == "cached project"

    @pytest.mark.unit
    async def test_get_project_context_cache_miss(self, cm, mock_db_session):
        """Cache miss loads from database."""
        project_id = uuid.uuid4()
        active_chat = make_chat(title="Active Chat")
        active_chat.is_deleted = False
        deleted_chat = make_chat(title="Deleted Chat")
        deleted_chat.is_deleted = True

        project = make_project(
            project_id=project_id,
            name="From DB",
            chats=[active_chat, deleted_chat],
        )

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = project
        mock_db_session.execute.return_value = mock_result

        result = await cm.get_project_context(project_id)
        assert result is not None
        assert result["name"] == "From DB"
        # Deleted chats excluded
        assert len(result["chats"]) == 1
        assert result["chats"][0]["title"] == "Active Chat"

    @pytest.mark.unit
    async def test_get_project_context_not_found(self, cm, mock_db_session):
        """Returns None when project not found."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db_session.execute.return_value = mock_result

        result = await cm.get_project_context(uuid.uuid4())
        assert result is None

    @pytest.mark.unit
    async def test_invalidate_project_cache(self, cm):
        """invalidate_project_cache deletes Redis key."""
        project_id = uuid.uuid4()
        cache_key = cm.PROJECT_CONTEXT_PREFIX + str(project_id)
        await cm._redis.setex(cache_key, 7200, json.dumps({"test": True}))

        await cm.invalidate_project_cache(project_id)
        await assert_redis_key_absent(cm._redis, cache_key)

    @pytest.mark.unit
    async def test_project_cache_ttl(self, cm, mock_db_session):
        """Project cache has 2 hour TTL."""
        project_id = uuid.uuid4()
        project = make_project(project_id=project_id)
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = project
        mock_db_session.execute.return_value = mock_result

        await cm.get_project_context(project_id)

        cache_key = cm.PROJECT_CONTEXT_PREFIX + str(project_id)
        await assert_redis_key_ttl(cm._redis, cache_key, cm.PROJECT_CACHE_TTL)

    @pytest.mark.unit
    async def test_get_all_chats_in_project(self, cm, mock_db_session):
        """get_all_chats_in_project queries database."""
        chat1 = make_chat(title="Chat 1")
        chat2 = make_chat(title="Chat 2")
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [chat1, chat2]
        mock_db_session.execute.return_value = mock_result

        result = await cm.get_all_chats_in_project(uuid.uuid4())
        assert len(result) == 2


# =========================================================================
# User Preferences Tests
# =========================================================================

class TestUserPreferences:
    """Tests for user preferences caching."""

    @pytest.fixture
    def cm(self, mock_redis, mock_session_factory):
        cm = ContextManager(session_factory=mock_session_factory, redis_client=mock_redis)
        cm._running = True
        return cm

    @pytest.mark.unit
    async def test_get_preferences_cache_hit(self, cm):
        """Cache hit returns cached preferences."""
        user_id = uuid.uuid4()
        prefs = {"custom_system_prompt": "Be concise", "coding_principles": "TDD"}
        cache_key = cm.USER_PREFS_PREFIX + str(user_id)
        await cm._redis.setex(cache_key, 86400, json.dumps(prefs))

        result = await cm.get_user_preferences(user_id)
        assert result["custom_system_prompt"] == "Be concise"

    @pytest.mark.unit
    async def test_get_preferences_cache_miss(self, cm, mock_db_session):
        """Cache miss loads from database."""
        user_id = uuid.uuid4()
        pref = make_user_preference(
            user_id=user_id,
            custom_system_prompt="Be helpful",
            coding_principles="Clean code",
            response_style="verbose",
        )
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = pref
        mock_db_session.execute.return_value = mock_result

        result = await cm.get_user_preferences(user_id)
        assert result["custom_system_prompt"] == "Be helpful"
        assert result["coding_principles"] == "Clean code"
        assert result["response_style"] == "verbose"

        # Cache should be populated
        cache_key = cm.USER_PREFS_PREFIX + str(user_id)
        await assert_redis_key_exists(cm._redis, cache_key)

    @pytest.mark.unit
    async def test_get_preferences_not_found(self, cm, mock_db_session):
        """Returns empty dict when no preferences found."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db_session.execute.return_value = mock_result

        result = await cm.get_user_preferences(uuid.uuid4())
        assert result == {}

    @pytest.mark.unit
    async def test_invalidate_preferences_cache(self, cm):
        """invalidate_user_preferences_cache deletes Redis key."""
        user_id = uuid.uuid4()
        cache_key = cm.USER_PREFS_PREFIX + str(user_id)
        await cm._redis.setex(cache_key, 86400, json.dumps({"test": True}))

        await cm.invalidate_user_preferences_cache(user_id)
        await assert_redis_key_absent(cm._redis, cache_key)

    @pytest.mark.unit
    async def test_preferences_cache_ttl(self, cm, mock_db_session):
        """Preferences cache has 24 hour TTL."""
        user_id = uuid.uuid4()
        pref = make_user_preference(user_id=user_id)
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = pref
        mock_db_session.execute.return_value = mock_result

        await cm.get_user_preferences(user_id)

        cache_key = cm.USER_PREFS_PREFIX + str(user_id)
        await assert_redis_key_ttl(cm._redis, cache_key, cm.USER_PREFS_CACHE_TTL)


# =========================================================================
# Token Usage Tracking Tests
# =========================================================================

class TestTokenTracking:
    """Tests for token usage tracking and compaction triggering."""

    @pytest.fixture
    def cm(self, mock_redis, mock_session_factory):
        cm = ContextManager(session_factory=mock_session_factory, redis_client=mock_redis)
        cm._running = True
        return cm

    @pytest.mark.unit
    async def test_track_token_usage(self, cm):
        """track_token_usage stores usage data in Redis."""
        chat_id = uuid.uuid4()
        needs_compaction = await cm.track_token_usage(chat_id, 4000, 10000)

        assert needs_compaction is False
        cache_key = cm.TOKEN_USAGE_PREFIX + str(chat_id)
        await assert_redis_key_exists(cm._redis, cache_key)

    @pytest.mark.unit
    async def test_usage_ratio_calculated(self, cm):
        """usage_ratio is correctly calculated."""
        chat_id = uuid.uuid4()
        await cm.track_token_usage(chat_id, 5000, 10000)

        usage = await cm.get_token_usage(chat_id)
        assert usage["usage_ratio"] == 0.5
        assert usage["current_tokens"] == 5000
        assert usage["max_tokens"] == 10000

    @pytest.mark.unit
    async def test_compaction_threshold_triggered(self, cm):
        """Returns True when ratio >= 80%."""
        chat_id = uuid.uuid4()
        needs = await cm.track_token_usage(chat_id, 8500, 10000)
        assert needs is True

    @pytest.mark.unit
    async def test_compaction_threshold_not_triggered(self, cm):
        """Returns False when ratio < 80%."""
        chat_id = uuid.uuid4()
        needs = await cm.track_token_usage(chat_id, 7000, 10000)
        assert needs is False

    @pytest.mark.unit
    async def test_get_token_usage_default(self, cm):
        """get_token_usage returns zeros when no data stored."""
        usage = await cm.get_token_usage(uuid.uuid4())
        assert usage["current_tokens"] == 0
        assert usage["max_tokens"] == 0
        assert usage["usage_ratio"] == 0.0

    @pytest.mark.unit
    async def test_should_compact(self, cm):
        """should_compact checks threshold."""
        chat_id = uuid.uuid4()
        await cm.track_token_usage(chat_id, 9000, 10000)
        assert await cm.should_compact(chat_id) is True

        chat_id2 = uuid.uuid4()
        await cm.track_token_usage(chat_id2, 1000, 10000)
        assert await cm.should_compact(chat_id2) is False


# =========================================================================
# Compaction Triggering Tests
# =========================================================================

class TestCompactionTriggering:
    """Tests for trigger_compaction."""

    @pytest.fixture
    def cm(self, mock_redis, mock_session_factory):
        cm = ContextManager(session_factory=mock_session_factory, redis_client=mock_redis)
        cm._running = True
        return cm

    @pytest.mark.unit
    async def test_trigger_compaction_creates_record(self, cm, mock_db_session):
        """trigger_compaction creates ContextCompaction record."""
        chat_id = uuid.uuid4()

        # Mock count query returning 50 messages
        mock_count_result = MagicMock()
        mock_count_result.scalar_one.return_value = 50
        mock_db_session.execute.return_value = mock_count_result

        # Mock refresh to set id
        compaction_id_val = uuid.uuid4()
        async def refresh_effect(obj):
            obj.id = compaction_id_val
        mock_db_session.refresh = AsyncMock(side_effect=refresh_effect)

        with patch("app.kernel.WorkstationKernel") as mock_kernel_cls:
            mock_kernel = MagicMock()
            mock_kernel.get_service.return_value = None
            mock_kernel_cls.return_value = mock_kernel

            result = await cm.trigger_compaction(chat_id)

        assert result is not None
        mock_db_session.add.assert_called_once()
        mock_db_session.commit.assert_awaited_once()

    @pytest.mark.unit
    async def test_trigger_compaction_no_messages(self, cm, mock_db_session):
        """Returns None when no messages exist."""
        chat_id = uuid.uuid4()

        mock_count_result = MagicMock()
        mock_count_result.scalar_one.return_value = 0
        mock_db_session.execute.return_value = mock_count_result

        result = await cm.trigger_compaction(chat_id)
        assert result is None

    @pytest.mark.unit
    async def test_trigger_compaction_invalidates_cache(self, cm, mock_db_session):
        """Compaction invalidates conversation cache."""
        chat_id = uuid.uuid4()

        # Pre-populate cache
        cache_key = cm.CONVERSATION_CONTEXT_PREFIX + str(chat_id)
        await cm._redis.setex(cache_key, 3600, json.dumps({"old": True}))

        mock_count_result = MagicMock()
        mock_count_result.scalar_one.return_value = 20
        mock_db_session.execute.return_value = mock_count_result

        compaction_id_val = uuid.uuid4()
        async def refresh_effect(obj):
            obj.id = compaction_id_val
        mock_db_session.refresh = AsyncMock(side_effect=refresh_effect)

        with patch("app.kernel.WorkstationKernel") as mock_kernel_cls:
            mock_kernel = MagicMock()
            mock_kernel.get_service.return_value = None
            mock_kernel_cls.return_value = mock_kernel

            await cm.trigger_compaction(chat_id)

        await assert_redis_key_absent(cm._redis, cache_key)

    @pytest.mark.unit
    async def test_trigger_compaction_publishes_event(self, cm, mock_db_session):
        """Compaction publishes context_compacted event via EventBus."""
        chat_id = uuid.uuid4()

        mock_count_result = MagicMock()
        mock_count_result.scalar_one.return_value = 30
        mock_db_session.execute.return_value = mock_count_result

        compaction_id_val = uuid.uuid4()
        async def refresh_effect(obj):
            obj.id = compaction_id_val
        mock_db_session.refresh = AsyncMock(side_effect=refresh_effect)

        mock_event_bus = AsyncMock()

        with patch("app.kernel.WorkstationKernel") as mock_kernel_cls:
            mock_kernel = MagicMock()
            mock_kernel.get_service.return_value = mock_event_bus
            mock_kernel_cls.return_value = mock_kernel

            await cm.trigger_compaction(chat_id)

        mock_event_bus.publish_event.assert_awaited_once()
        call_kwargs = mock_event_bus.publish_event.call_args[1]
        assert call_kwargs["event_type"] == "context_compacted"
        assert call_kwargs["event_data"]["chat_id"] == str(chat_id)


# =========================================================================
# Database Helper Tests
# =========================================================================

class TestDatabaseHelpers:
    """Tests for internal database helper methods."""

    @pytest.fixture
    def cm(self, mock_redis, mock_session_factory):
        cm = ContextManager(session_factory=mock_session_factory, redis_client=mock_redis)
        cm._running = True
        return cm

    @pytest.mark.unit
    async def test_load_chat_with_relations(self, cm, mock_db_session):
        """_load_chat_with_relations uses selectinload."""
        chat = make_chat(title="Test Chat")
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = chat
        mock_db_session.execute.return_value = mock_result

        result = await cm._load_chat_with_relations(uuid.uuid4(), mock_db_session)
        assert result is not None
        assert result.title == "Test Chat"
        mock_db_session.execute.assert_awaited_once()

    @pytest.mark.unit
    async def test_load_chat_not_found(self, cm, mock_db_session):
        """Returns None when chat not found."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db_session.execute.return_value = mock_result

        result = await cm._load_chat_with_relations(uuid.uuid4(), mock_db_session)
        assert result is None

    @pytest.mark.unit
    async def test_load_project_with_chats(self, cm, mock_db_session):
        """_load_project_with_chats uses selectinload."""
        project = make_project(name="Test Project")
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = project
        mock_db_session.execute.return_value = mock_result

        result = await cm._load_project_with_chats(uuid.uuid4(), mock_db_session)
        assert result is not None
        assert result.name == "Test Project"

    @pytest.mark.unit
    async def test_load_user_preference(self, cm, mock_db_session):
        """_load_user_preference queries by user_id."""
        pref = make_user_preference(custom_system_prompt="Custom")
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = pref
        mock_db_session.execute.return_value = mock_result

        result = await cm._load_user_preference(uuid.uuid4(), mock_db_session)
        assert result is not None
        assert result.custom_system_prompt == "Custom"

    @pytest.mark.unit
    async def test_load_user_preference_not_found(self, cm, mock_db_session):
        """Returns None when no preference found."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db_session.execute.return_value = mock_result

        result = await cm._load_user_preference(uuid.uuid4(), mock_db_session)
        assert result is None
