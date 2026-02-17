"""
ContextManager kernel service for centralized conversation and project context management.

This module provides:
- Conversation state management with Redis caching
- Project-level context access with caching
- User preferences caching
- Token usage tracking with compaction triggering at 90% threshold

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
from app.models.system_prompt import SystemPrompt
from app.models.user_preference import UserPreference

logger = logging.getLogger(__name__)


class ContextManager(BaseKernelService):
    """
    Kernel service for centralized conversation and project context management.

    Features:
    - Conversation state caching (Chat + Messages + Compactions)
    - Project context caching (Project metadata + chat list)
    - User preferences caching
    - Token usage tracking with 90% compaction threshold
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
    COMPACTION_THRESHOLD = 0.9  # 90%

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
                if not msg.is_deleted
            ]

            # Build compactions list
            compactions = [
                {
                    "id": str(c.id),
                    "original_message_count": c.original_message_count,
                    "compacted_message_count": c.compacted_message_count,
                    "summary": c.summary,
                    "status": c.status,
                    "created_at": c.created_at.isoformat() if c.created_at else None,
                }
                for c in chat.context_compactions
            ]

            active_messages = [m for m in messages if not m.get("is_excluded")]

            state = {
                "chat_id": str(chat.id),
                "project_id": str(chat.project_id),
                "title": chat.title,
                "messages": messages,
                "compactions": compactions,
                "current_token_count": self._count_conversation_tokens(active_messages),
                "chat_instructions": chat.chat_instructions,
                "system_prompt_id": str(chat.system_prompt_id) if chat.system_prompt_id else None,
                "chat_mode": chat.chat_mode or "agent",
            }

        # Cache the state
        await self._redis.setex(cache_key, self.CONVERSATION_CACHE_TTL, json.dumps(state, default=str))
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
                    "is_pinned": c.is_pinned,
                    "is_archived": c.is_archived,
                    "chat_mode": c.chat_mode or "agent",
                    "created_at": c.created_at.isoformat() if c.created_at else None,
                    "updated_at": c.updated_at.isoformat() if c.updated_at else None,
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
                "template_id": project.template_id,
                "system_prompt_id": str(project.system_prompt_id) if project.system_prompt_id else None,
                "settings": project.settings,
                "custom_context": project.custom_context,
                "important_files": project.important_files,
                "chats": chat_list,
            }

        await self._redis.setex(cache_key, self.PROJECT_CACHE_TTL, json.dumps(context, default=str))
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
                    "is_pinned": c.is_pinned,
                    "is_archived": c.is_archived,
                    "chat_mode": c.chat_mode or "agent",
                    "created_at": c.created_at.isoformat() if c.created_at else None,
                    "updated_at": c.updated_at.isoformat() if c.updated_at else None,
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
                "default_model": pref.default_model,
                "default_temperature": pref.default_temperature,
                "default_num_ctx": pref.default_num_ctx,
                "email_notifications": pref.email_notifications,
                "in_app_notifications": pref.in_app_notifications,
                "imggen_default_workflow": pref.imggen_default_workflow,
                "imggen_default_width": pref.imggen_default_width,
                "imggen_default_height": pref.imggen_default_height,
                "imggen_default_steps": pref.imggen_default_steps,
                "imggen_default_cfg_scale": pref.imggen_default_cfg_scale,
                "imggen_default_prompt": pref.imggen_default_prompt,
                "imggen_system_prompt": pref.imggen_system_prompt,
                "imggen_default_negative_prompt": pref.imggen_default_negative_prompt,
                "imggen_completion_notification": pref.imggen_completion_notification,
                "imggen_desktop_notification": pref.imggen_desktop_notification,
                "imggen_sound_notification": pref.imggen_sound_notification,
                "imggen_notification_sound": pref.imggen_notification_sound,
                "imggen_auto_delete_days": pref.imggen_auto_delete_days,
                "imggen_max_generations": pref.imggen_max_generations,
                "comfyui_base_url": pref.comfyui_base_url,
            }

        await self._redis.setex(cache_key, self.USER_PREFS_CACHE_TTL, json.dumps(prefs_dict, default=str))
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
        """Create a pending compaction record. Returns compaction_id or None.

        This is the lightweight first step — actual LLM summarization runs in
        ``perform_compaction`` (called by the ARQ background worker).
        """
        async with self._session_factory() as session:
            # Only count non-excluded messages
            result = await session.execute(
                select(func.count(Message.id)).where(
                    Message.chat_id == chat_id,
                    Message.is_excluded == False,  # noqa: E712
                    Message.is_deleted == False,  # noqa: E712
                )
            )
            active_count = result.scalar_one()

            # Need at least 6 messages to make compaction worthwhile
            if active_count < 6:
                return None

            # Check for an existing pending compaction to avoid duplicates
            pending_result = await session.execute(
                select(func.count(ContextCompaction.id)).where(
                    ContextCompaction.chat_id == chat_id,
                    ContextCompaction.status == "pending",
                )
            )
            if pending_result.scalar_one() > 0:
                logger.debug("Pending compaction already exists for chat %s", chat_id)
                return None

            compaction = ContextCompaction(
                chat_id=chat_id,
                original_message_count=active_count,
                compacted_message_count=0,
                summary="[Pending compaction — awaiting LLM summarization]",
                status="pending",
            )
            session.add(compaction)
            await session.commit()
            await session.refresh(compaction)

            # Publish compaction_triggered event
            try:
                from app.kernel import WorkstationKernel
                kernel = WorkstationKernel()
                event_bus = kernel.get_service("event_bus")
                if event_bus:
                    await event_bus.publish_event(
                        event_type="compaction_triggered",
                        event_data={
                            "chat_id": str(chat_id),
                            "compaction_id": str(compaction.id),
                            "original_message_count": active_count,
                        },
                        severity="info",
                        source="context_manager",
                        persist=True,
                    )
            except Exception as e:
                logger.warning("Failed to publish compaction_triggered event: %s", e)

            return str(compaction.id)

    async def perform_compaction(self, chat_id: UUID, compaction_id: str) -> Dict[str, Any]:
        """Run LLM-based summarization for a pending compaction record.

        This is the heavy operation meant to run inside an ARQ background worker.
        It loads conversation messages, calls Ollama for a summary, updates the
        compaction record, marks old messages as excluded, and invalidates the cache.
        """
        from app.services.ollama_client import OllamaClient

        # Obtain an OllamaClient — try the kernel first, fall back to a fresh one
        ollama: Optional[OllamaClient] = None
        owns_ollama = False
        try:
            from app.kernel import WorkstationKernel
            kernel = WorkstationKernel()
            svc = kernel.get_service("ollama_client")
            if svc is not None and svc.is_running:
                ollama = svc
        except Exception as e:
            logger.debug(
                "Could not obtain OllamaClient from WorkstationKernel "
                "(get_service('ollama_client'), svc.is_running): %s; "
                "falling back to standalone ollama client",
                e,
            )

        if ollama is None:
            ollama = OllamaClient(
                base_url=os.environ.get(
                    "OLLAMA_BASE_URL", "http://ollama:11434"
                )
            )
            await ollama.startup()
            owns_ollama = True

        try:
            async with self._session_factory() as session:
                # Load active (non-excluded) messages in chronological order
                msg_result = await session.execute(
                    select(Message)
                    .where(
                        Message.chat_id == chat_id,
                        Message.is_excluded == False,  # noqa: E712
                        Message.is_deleted == False,  # noqa: E712
                    )
                    .order_by(Message.created_at.asc())
                )
                messages = list(msg_result.scalars().all())

                if len(messages) < 6:
                    logger.info(
                        "Skipping compaction for chat %s: only %d active messages",
                        chat_id, len(messages),
                    )
                    return {"status": "skipped", "reason": "too_few_messages"}

                # Keep newest 25% (minimum 5 messages)
                keep_count = max(5, len(messages) // 4)
                candidates = messages[:-keep_count]
                # Never compact pinned messages
                to_compact = [m for m in candidates if not m.is_pinned]

                if len(to_compact) < 3:
                    logger.info(
                        "Skipping compaction for chat %s: only %d compactable (non-pinned) messages",
                        chat_id, len(to_compact),
                    )
                    return {"status": "skipped", "reason": "too_few_compactable"}

                # Build summarization prompt — truncate each message to 500 chars
                truncated_history = "\n".join(
                    f"{m.role}: {m.content[:500]}" for m in to_compact
                )

                summarization_messages = [
                    {
                        "role": "system",
                        "content": (
                            "You are a conversation summarizer. Analyze the following conversation "
                            "and produce a structured summary using EXACTLY these markdown sections. "
                            "Each section should be concise and use bullet points.\n\n"
                            "## Key Decisions\n"
                            "Decisions made, approaches chosen, and rationale.\n\n"
                            "## Completed Work\n"
                            "What was accomplished, files created/modified, features implemented.\n\n"
                            "## Unresolved Issues\n"
                            "Open questions, pending tasks, known bugs. Write 'None' if all resolved.\n\n"
                            "## Current State\n"
                            "Where things stand now, what the user was last working on.\n\n"
                            "Output ONLY the structured summary with these four sections. "
                            "Do not include any preamble or explanation."
                        ),
                    },
                    {"role": "user", "content": truncated_history},
                ]

                # Call Ollama with low temperature for factual output
                llm_result = await ollama.chat_completion(
                    messages=summarization_messages,
                    temperature=0.3,
                )
                summary = llm_result.get("message", {}).get("content", "")

                if not summary:
                    logger.warning("Empty summary from LLM for chat %s", chat_id)
                    return {"status": "failed", "reason": "empty_summary"}

                # Update compaction record with real summary
                compaction = await session.get(
                    ContextCompaction, UUID(compaction_id)
                )
                if compaction:
                    compaction.summary = summary
                    compaction.compacted_message_count = len(to_compact)
                    compaction.status = "completed"

                # Mark compacted messages as excluded (soft removal)
                for msg in to_compact:
                    msg.is_excluded = True

                await session.commit()

            # Invalidate conversation cache so next fetch uses the summary
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
                            "compacted_message_count": len(to_compact),
                            "summary_length": len(summary),
                        },
                        severity="info",
                        source="context_manager",
                        persist=True,
                    )
            except Exception as e:
                logger.warning("Failed to publish context_compacted event: %s", e)

            logger.info(
                "Compaction completed: chat_id=%s, compacted=%d messages, summary=%d chars",
                chat_id, len(to_compact), len(summary),
            )
            return {
                "status": "completed",
                "compaction_id": compaction_id,
                "compacted_count": len(to_compact),
                "summary_length": len(summary),
            }

        except Exception as exc:
            logger.error("Compaction failed for chat %s: %s", chat_id, exc)
            # Mark the compaction record as failed so it doesn't block future compactions
            try:
                async with self._session_factory() as err_session:
                    comp = await err_session.get(ContextCompaction, UUID(compaction_id))
                    if comp and comp.status == "pending":
                        comp.status = "failed"
                        await err_session.commit()
            except Exception as update_exc:
                logger.warning("Failed to mark compaction %s as failed: %s", compaction_id, update_exc)
            return {"status": "failed", "reason": str(exc)}

        finally:
            if owns_ollama and ollama is not None:
                await ollama.shutdown()

    # -------------------------------------------------------------------------
    # System Prompt Resolution
    # -------------------------------------------------------------------------

    async def resolve_system_prompt_content(
        self,
        chat_id: UUID,
        project_id: Optional[UUID],
        user_id: UUID,
    ) -> Optional[str]:
        """Resolve the system prompt content via the priority chain.

        Resolution order:
        1. Chat's system_prompt_id
        2. Project's system_prompt_id
        3. User's default system prompt (is_default=True)
        4. None (caller falls back to user_prefs["custom_system_prompt"])
        """
        async with self._session_factory() as session:
            # 1. Check chat-level override
            if chat_id:
                chat = await session.get(Chat, chat_id)
                if chat and chat.system_prompt_id:
                    prompt = await session.get(SystemPrompt, chat.system_prompt_id)
                    if prompt and not prompt.is_deleted:
                        return prompt.content

            # 2. Check project-level override
            if project_id:
                project = await session.get(Project, project_id)
                if project and project.system_prompt_id:
                    prompt = await session.get(SystemPrompt, project.system_prompt_id)
                    if prompt and not prompt.is_deleted:
                        return prompt.content

            # 3. Check user's default prompt
            result = await session.execute(
                select(SystemPrompt).where(
                    SystemPrompt.user_id == user_id,
                    SystemPrompt.is_default == True,  # noqa: E712
                    SystemPrompt.is_deleted == False,  # noqa: E712
                )
            )
            default_prompt = result.scalar_one_or_none()
            if default_prompt:
                return default_prompt.content

        return None

    # -------------------------------------------------------------------------
    # Knowledge Base Context Retrieval
    # -------------------------------------------------------------------------

    async def get_relevant_kb_context(
        self,
        project_id: UUID,
        query: str,
        top_k: int = 3,
    ) -> List[Dict[str, Any]]:
        """Retrieve relevant KB chunks for a query using vector similarity.

        Returns an empty list if the embedding service is unavailable or
        no chunks with embeddings exist for the project.
        """
        try:
            from app.kernel import WorkstationKernel

            kernel = WorkstationKernel()
            embedding_svc = kernel.get_service("embedding_service")
            if embedding_svc is None or not embedding_svc.is_running:
                return []

            query_embedding = await embedding_svc.generate_embedding(query)

            from app.models.kb_chunk import KBChunk
            from pgvector.sqlalchemy import cosine_distance

            async with self._session_factory() as session:
                distance_expr = cosine_distance(KBChunk.embedding, query_embedding)
                similarity_expr = (1 - distance_expr).label("similarity")

                stmt = (
                    select(KBChunk, similarity_expr)
                    .where(
                        KBChunk.project_id == project_id,
                        KBChunk.embedding.isnot(None),
                    )
                    .order_by(distance_expr)
                    .limit(top_k)
                )

                result = await session.execute(stmt)
                rows = result.all()

                return [
                    {
                        "content": chunk.content,
                        "source_id": str(chunk.source_id),
                        "similarity": float(sim),
                    }
                    for chunk, sim in rows
                ]

        except Exception as exc:
            logger.warning("KB context retrieval failed: %s", exc)
            return []

    # -------------------------------------------------------------------------
    # Automation Action Helpers
    # -------------------------------------------------------------------------

    PENDING_ACTIONS_PREFIX = "context:pending_actions:"
    PENDING_ACTIONS_TTL = 30  # seconds

    async def get_pending_automation_actions(
        self, project_id: UUID
    ) -> List[Dict[str, Any]]:
        """Get pending (unapproved, unexecuted) automation actions for a project.

        Results are cached in Redis for 30 seconds.
        """
        cache_key = f"{self.PENDING_ACTIONS_PREFIX}{project_id}"

        # Check cache
        if self._redis:
            cached = await self._redis.get(cache_key)
            if cached:
                return json.loads(cached)

        from app.models.automation_action import AutomationAction

        async with self._session_factory() as session:
            result = await session.execute(
                select(AutomationAction)
                .where(
                    AutomationAction.project_id == project_id,
                    AutomationAction.user_approved == False,  # noqa: E712
                    AutomationAction.executed_at.is_(None),
                )
                .order_by(AutomationAction.created_at.desc())
            )
            actions = result.scalars().all()

            summaries = [
                {
                    "id": str(a.id),
                    "action_type": a.action_type,
                    "action_data": a.action_data,
                    "created_at": a.created_at.isoformat() if a.created_at else None,
                }
                for a in actions
            ]

        if self._redis:
            await self._redis.set(
                cache_key,
                json.dumps(summaries),
                ex=self.PENDING_ACTIONS_TTL,
            )

        return summaries

    # -------------------------------------------------------------------------
    # Active Plan Context
    # -------------------------------------------------------------------------

    ACTIVE_PLAN_PREFIX = "context:active_plan:"
    ACTIVE_PLAN_TTL = 3600  # 1 hour

    async def get_active_plan(self, chat_id: UUID) -> Optional[Dict[str, Any]]:
        """Get the active planning session for a chat (cached in Redis).

        Returns a summary dict suitable for injection into the system prompt,
        or None if no active plan exists.
        """
        cache_key = f"{self.ACTIVE_PLAN_PREFIX}{chat_id}"

        if self._redis:
            cached = await self._redis.get(cache_key)
            if cached is not None:
                if cached == "null":
                    return None
                return json.loads(cached)

        from app.models.planning_session import PlanningSession
        from app.models.plan_phase import PlanPhase

        async with self._session_factory() as session:
            result = await session.execute(
                select(PlanningSession)
                .where(
                    PlanningSession.chat_id == chat_id,
                    PlanningSession.status.in_(["active", "in_progress"]),
                )
                .options(selectinload(PlanningSession.phases))
                .order_by(PlanningSession.updated_at.desc())
                .limit(1)
            )
            plan_session = result.scalar_one_or_none()

            if not plan_session:
                # Cache negative result to avoid repeated DB hits
                if self._redis:
                    await self._redis.set(
                        cache_key, "null", ex=300  # 5 min TTL for negative cache
                    )
                return None

            current_phase = None
            if plan_session.current_phase_id and plan_session.phases:
                current_phase = next(
                    (p for p in plan_session.phases if p.id == plan_session.current_phase_id),
                    None,
                )

            plan_data: Dict[str, Any] = {
                "session_id": str(plan_session.id),
                "title": plan_session.title,
                "status": plan_session.status,
                "success_criteria": plan_session.success_criteria or [],
                "current_phase": None,
            }
            if current_phase:
                plan_data["current_phase"] = {
                    "title": current_phase.title,
                    "status": current_phase.status,
                    "outputs": current_phase.outputs or [],
                }

        if self._redis:
            await self._redis.set(
                cache_key, json.dumps(plan_data), ex=self.ACTIVE_PLAN_TTL
            )

        return plan_data

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

    @staticmethod
    def _count_conversation_tokens(messages: List[Dict[str, Any]]) -> int:
        """Count actual tokens in conversation messages using tiktoken."""
        try:
            from app.kernel.token_counter import TokenCounter
            counter = TokenCounter()
            return counter.count_messages(
                [{"role": m.get("role", ""), "content": m.get("content", "")} for m in messages]
            )
        except Exception:
            # Rough estimate: ~4 chars per token (common heuristic)
            return sum(len(m.get("content", "")) for m in messages) // 4
