"""
ContextManager kernel service for centralized conversation and project context management.

This module provides:
- Conversation state management with Redis caching
- Project-level context access with caching
- User preferences caching
- Token usage tracking with compaction triggering at 80% threshold

The ContextManager integrates with the kernel lifecycle and provides
unified access to Chat, Message, Project, UserPreference, and
ContextCompaction models through a Redis-backed caching layer.
"""

import json
import logging
import os
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID

import redis.asyncio as redis
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.kernel.base import BaseKernelService
from app.models.chat import Chat
from app.models.context_compaction import ContextCompaction
from app.models.message import Message
from app.models.project import Project
from app.models.user_preference import UserPreference

logger = logging.getLogger(__name__)


class ContextManager(BaseKernelService):
    """
    Kernel service for centralized conversation and project context management.

    Features:
    - Conversation state caching (Chat + Messages + Compactions)
    - Project context caching (Project metadata + chat list)
    - User preferences caching
    - Token usage tracking with 80% compaction threshold
    - Redis-backed with configurable TTLs
    """

    # Redis key prefixes
    CONVERSATION_CONTEXT_PREFIX = "context:conversation:"
    PROJECT_CONTEXT_PREFIX = "context:project:"
    USER_PREFS_PREFIX = "context:user_prefs:"
    TOKEN_USAGE_PREFIX = "context:tokens:"

    # Cache TTLs (seconds)
    CONVERSATION_CACHE_TTL = 3600    # 1 hour
    PROJECT_CACHE_TTL = 7200         # 2 hours
    USER_PREFS_CACHE_TTL = 86400     # 24 hours

    # Token threshold for compaction
    COMPACTION_THRESHOLD = 0.8  # 80%

    def __init__(
        self,
        session_factory,
        redis_client: Optional[redis.Redis] = None,
    ) -> None:
        self._session_factory = session_factory
        self._redis: Optional[redis.Redis] = redis_client
        self._owns_redis = redis_client is None
        self._running = False

    @property
    def name(self) -> str:
        return "context_manager"

    @property
    def is_running(self) -> bool:
        return self._running

    # -------------------------------------------------------------------------
    # Lifecycle
    # -------------------------------------------------------------------------

    async def startup(self) -> None:
        if self._running:
            return

        logger.info("Starting ContextManager service...")

        if self._redis is None:
            redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
            self._redis = redis.from_url(redis_url, decode_responses=True)
            self._owns_redis = True

        await self._redis.ping()

        self._running = True
        logger.info("ContextManager service started successfully")

    async def shutdown(self) -> None:
        logger.info("Shutting down ContextManager service...")

        self._running = False

        if self._redis and self._owns_redis:
            await self._redis.aclose()
            self._redis = None

        logger.info("ContextManager service shutdown complete")

    async def health_check(self) -> Tuple[bool, str]:
        if not self._running:
            return False, "not running"

        try:
            await self._redis.ping()
            return True, "ok"
        except Exception as e:
            return False, f"redis error: {e}"

    # -------------------------------------------------------------------------
    # Conversation State Management
    # -------------------------------------------------------------------------

    async def get_conversation_state(self, chat_id: UUID) -> Optional[Dict[str, Any]]:
        cache_key = self.CONVERSATION_CONTEXT_PREFIX + str(chat_id)

        # Check Redis cache
        cached = await self._redis.get(cache_key)
        if cached:
            logger.debug(f"Context cache HIT: chat_id={chat_id}")
            return json.loads(cached)

        # Cache miss — load from database
        logger.debug(f"Context cache MISS: chat_id={chat_id}")
        async with self._session_factory() as session:
            chat = await self._load_chat_with_relations(chat_id, session)
            if chat is None:
                return None

            # Build messages list
            messages = [
                {
                    "id": str(msg.id),
                    "role": msg.role,
                    "content": msg.content,
                    "metadata": msg.message_metadata,
                    "is_pinned": msg.is_pinned,
                    "is_excluded": msg.is_excluded,
                    "created_at": msg.created_at.isoformat() if msg.created_at else None,
                }
                for msg in chat.messages
            ]

            # Build compactions list
            compactions = [
                {
                    "id": str(c.id),
                    "original_message_count": c.original_message_count,
                    "compacted_message_count": c.compacted_message_count,
                    "summary": c.summary,
                    "created_at": c.created_at.isoformat() if c.created_at else None,
                }
                for c in chat.context_compactions
            ]

            state = {
                "chat_id": str(chat.id),
                "project_id": str(chat.project_id),
                "title": chat.title,
                "messages": messages,
                "compactions": compactions,
                "current_token_count": len(messages),
            }

        # Cache the state
        await self._redis.setex(cache_key, self.CONVERSATION_CACHE_TTL, json.dumps(state))
        return state

    async def update_conversation_state(
        self, chat_id: UUID, updates: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        # Persist supported fields to the database first
        async with self._session_factory() as session:
            chat = await self._load_chat_with_relations(chat_id, session)
            if chat is None:
                return None

            if "title" in updates:
                chat.title = updates["title"]

            await session.commit()

        # Invalidate stale cache and rebuild from the database
        await self.invalidate_conversation_cache(chat_id)
        return await self.get_conversation_state(chat_id)

    async def invalidate_conversation_cache(self, chat_id: UUID) -> None:
        cache_key = self.CONVERSATION_CONTEXT_PREFIX + str(chat_id)
        await self._redis.delete(cache_key)
        logger.debug(f"Invalidated conversation cache for chat {chat_id}")

    # -------------------------------------------------------------------------
    # Project-Level Context
    # -------------------------------------------------------------------------

    async def get_project_context(self, project_id: UUID) -> Optional[Dict[str, Any]]:
        cache_key = self.PROJECT_CONTEXT_PREFIX + str(project_id)

        cached = await self._redis.get(cache_key)
        if cached:
            logger.debug(f"Project context cache HIT: project_id={project_id}")
            return json.loads(cached)

        logger.debug(f"Project context cache MISS: project_id={project_id}")
        async with self._session_factory() as session:
            project = await self._load_project_with_chats(project_id, session)
            if project is None:
                return None

            chat_list = [
                {
                    "id": str(c.id),
                    "title": c.title,
                    "created_at": c.created_at.isoformat() if c.created_at else None,
                }
                for c in project.chats
                if not c.is_deleted
            ]

            context = {
                "project_id": str(project.id),
                "user_id": str(project.user_id),
                "name": project.name,
                "path": project.path,
                "type": project.type,
                "settings": project.settings,
                "custom_context": project.custom_context,
                "important_files": project.important_files,
                "chats": chat_list,
            }

        await self._redis.setex(cache_key, self.PROJECT_CACHE_TTL, json.dumps(context))
        return context

    async def get_all_chats_in_project(self, project_id: UUID) -> List[Dict[str, Any]]:
        async with self._session_factory() as session:
            result = await session.execute(
                select(Chat)
                .where(Chat.project_id == project_id, Chat.is_deleted == False)  # noqa: E712
                .order_by(Chat.created_at.desc())
            )
            chats = result.scalars().all()
            return [
                {
                    "id": str(c.id),
                    "title": c.title,
                    "created_at": c.created_at.isoformat() if c.created_at else None,
                }
                for c in chats
            ]

    async def invalidate_project_cache(self, project_id: UUID) -> None:
        cache_key = self.PROJECT_CONTEXT_PREFIX + str(project_id)
        await self._redis.delete(cache_key)
        logger.debug(f"Invalidated project cache for project {project_id}")

    # -------------------------------------------------------------------------
    # User Preferences Caching
    # -------------------------------------------------------------------------

    async def get_user_preferences(self, user_id: UUID) -> Dict[str, Any]:
        cache_key = self.USER_PREFS_PREFIX + str(user_id)

        cached = await self._redis.get(cache_key)
        if cached:
            return json.loads(cached)

        async with self._session_factory() as session:
            pref = await self._load_user_preference(user_id, session)
            if pref is None:
                return {}

            prefs_dict = {
                "custom_system_prompt": pref.custom_system_prompt,
                "coding_principles": pref.coding_principles,
                "response_style": pref.response_style,
            }

        await self._redis.setex(cache_key, self.USER_PREFS_CACHE_TTL, json.dumps(prefs_dict))
        return prefs_dict

    async def invalidate_user_preferences_cache(self, user_id: UUID) -> None:
        cache_key = self.USER_PREFS_PREFIX + str(user_id)
        await self._redis.delete(cache_key)
        logger.debug(f"Invalidated user preferences cache for user {user_id}")

    # -------------------------------------------------------------------------
    # Token Usage Tracking and Compaction
    # -------------------------------------------------------------------------

    async def track_token_usage(
        self, chat_id: UUID, token_count: int, max_tokens: int
    ) -> bool:
        cache_key = self.TOKEN_USAGE_PREFIX + str(chat_id)
        usage_data = {
            "current_tokens": token_count,
            "max_tokens": max_tokens,
            "usage_ratio": token_count / max_tokens if max_tokens > 0 else 0.0,
        }
        await self._redis.set(cache_key, json.dumps(usage_data))

        needs_compaction = usage_data["usage_ratio"] >= self.COMPACTION_THRESHOLD
        if needs_compaction:
            logger.info(
                f"Compaction triggered: chat_id={chat_id}, "
                f"tokens={token_count}/{max_tokens}, "
                f"ratio={usage_data['usage_ratio']:.2%}"
            )
        return needs_compaction

    async def get_token_usage(self, chat_id: UUID) -> Dict[str, Any]:
        cache_key = self.TOKEN_USAGE_PREFIX + str(chat_id)
        cached = await self._redis.get(cache_key)
        if cached:
            return json.loads(cached)
        return {"current_tokens": 0, "max_tokens": 0, "usage_ratio": 0.0}

    async def should_compact(self, chat_id: UUID) -> bool:
        usage = await self.get_token_usage(chat_id)
        return usage["usage_ratio"] >= self.COMPACTION_THRESHOLD

    async def trigger_compaction(self, chat_id: UUID) -> Optional[str]:
        async with self._session_factory() as session:
            # Count current messages
            result = await session.execute(
                select(func.count(Message.id)).where(Message.chat_id == chat_id)
            )
            original_count = result.scalar_one()

            if original_count == 0:
                return None

            # Create compaction record (actual summarization deferred to LLM service)
            compaction = ContextCompaction(
                chat_id=chat_id,
                original_message_count=original_count,
                compacted_message_count=0,
                summary="[Pending compaction — awaiting LLM summarization]",
            )
            session.add(compaction)
            await session.commit()
            await session.refresh(compaction)

            compaction_id = str(compaction.id)

        # Invalidate conversation cache so next fetch reflects the compaction
        await self.invalidate_conversation_cache(chat_id)

        # Publish event via EventBus if available
        try:
            from app.kernel import WorkstationKernel

            kernel = WorkstationKernel()
            event_bus = kernel.get_service("event_bus")
            if event_bus:
                await event_bus.publish_event(
                    event_type="context_compacted",
                    event_data={
                        "chat_id": str(chat_id),
                        "compaction_id": compaction_id,
                        "original_message_count": original_count,
                    },
                    severity="info",
                    source="context_manager",
                    persist=True,
                )
        except Exception as e:
            logger.warning(f"Failed to publish context_compacted event: {e}")

        return compaction_id

    # -------------------------------------------------------------------------
    # Database Helpers
    # -------------------------------------------------------------------------

    async def _load_chat_with_relations(
        self, chat_id: UUID, session: AsyncSession
    ) -> Optional[Chat]:
        result = await session.execute(
            select(Chat)
            .options(
                selectinload(Chat.messages),
                selectinload(Chat.context_compactions),
            )
            .where(Chat.id == chat_id, Chat.is_deleted == False)  # noqa: E712
        )
        return result.scalar_one_or_none()

    async def _load_project_with_chats(
        self, project_id: UUID, session: AsyncSession
    ) -> Optional[Project]:
        result = await session.execute(
            select(Project)
            .options(selectinload(Project.chats))
            .where(Project.id == project_id, Project.is_deleted == False)  # noqa: E712
        )
        return result.scalar_one_or_none()

    async def _load_user_preference(
        self, user_id: UUID, session: AsyncSession
    ) -> Optional[UserPreference]:
        result = await session.execute(
            select(UserPreference).where(UserPreference.user_id == user_id)
        )
        return result.scalar_one_or_none()
