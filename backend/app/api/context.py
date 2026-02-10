"""
Context management API — preferences, models, and token tracking.

Conversation/message endpoints live in messages.py, chat CRUD in chats.py,
and project CRUD in projects.py.  All share dependencies from context_deps.py.
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.context_deps import (
    get_context_manager,
    get_current_user_payload,
    get_db_session,
    get_ollama_client,
    validate_chat_access,
)
from app.kernel.context_manager import ContextManager
from app.schemas.context import (
    ModelInfo,
    ModelListResponse,
    TokenUsageRequest,
    TokenUsageResponse,
    UserPreferencesResponse,
    UserPreferencesUpdateRequest,
)
from app.services.ollama_client import OllamaClient

# Re-export sub-module routers so main.py can import from here unchanged
from app.api.messages import router as messages_router  # noqa: F401
from app.api.chats import router as chats_router  # noqa: F401
from app.api.projects import router as projects_router  # noqa: F401
from app.api.projects import context_projects_router  # noqa: F401

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/context", tags=["context"])


# -------------------------------------------------------------------------
# User Preferences Endpoints
# -------------------------------------------------------------------------


@router.get("/user/{user_id}/preferences", response_model=UserPreferencesResponse)
async def get_user_preferences(
    user_id: UUID,
    cm: ContextManager = Depends(get_context_manager),
    payload: dict = Depends(get_current_user_payload),
) -> UserPreferencesResponse:
    """Retrieve cached user preferences."""
    requesting_user = payload.get("user_id", "")
    if str(user_id) != str(requesting_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only access your own preferences",
        )

    prefs = await cm.get_user_preferences(user_id)
    return UserPreferencesResponse(**prefs)


@router.put("/user/{user_id}/preferences", response_model=UserPreferencesResponse)
async def update_user_preferences(
    user_id: UUID,
    body: UserPreferencesUpdateRequest,
    cm: ContextManager = Depends(get_context_manager),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> UserPreferencesResponse:
    """Update user preferences for AI behaviour customization."""
    requesting_user = payload.get("user_id", "")
    if str(user_id) != str(requesting_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only update your own preferences",
        )

    from app.models.user_preference import UserPreference

    result = await db.execute(
        select(UserPreference).where(UserPreference.user_id == user_id)
    )
    pref = result.scalar_one_or_none()

    if pref is None:
        pref = UserPreference(user_id=user_id)
        db.add(pref)

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(pref, field, value)

    await db.commit()
    await db.refresh(pref)

    await cm.invalidate_user_preferences_cache(user_id)

    return UserPreferencesResponse(
        custom_system_prompt=pref.custom_system_prompt,
        coding_principles=pref.coding_principles,
        response_style=pref.response_style,
        default_model=pref.default_model,
        default_temperature=pref.default_temperature,
        email_notifications=pref.email_notifications,
        in_app_notifications=pref.in_app_notifications,
    )


@router.get("/models", response_model=ModelListResponse)
async def list_models(
    ollama: OllamaClient = Depends(get_ollama_client),
    _payload: dict = Depends(get_current_user_payload),
) -> ModelListResponse:
    """List available Ollama LLM models."""
    try:
        raw_models = await ollama.list_models()
        models = [
            ModelInfo(
                name=m.get("name", ""),
                size=m.get("size"),
                modified_at=m.get("modified_at"),
            )
            for m in raw_models
        ]
        return ModelListResponse(models=models)
    except Exception as exc:
        logger.warning("Failed to list Ollama models: %s", exc)
        return ModelListResponse(models=[])


# -------------------------------------------------------------------------
# Token Usage Endpoints
# -------------------------------------------------------------------------


@router.post("/conversation/{chat_id}/tokens", response_model=TokenUsageResponse)
async def track_token_usage(
    chat_id: UUID,
    body: TokenUsageRequest,
    cm: ContextManager = Depends(get_context_manager),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> TokenUsageResponse:
    """Track token usage and trigger compaction if threshold is exceeded."""
    user_id = payload.get("user_id", "")
    await validate_chat_access(chat_id, user_id, db)

    needs_compaction = await cm.track_token_usage(
        chat_id, body.token_count, body.max_tokens
    )

    compaction_triggered = False
    if needs_compaction:
        compaction_id = await cm.trigger_compaction(chat_id)
        compaction_triggered = compaction_id is not None

    usage = await cm.get_token_usage(chat_id)
    return TokenUsageResponse(
        current_tokens=usage["current_tokens"],
        max_tokens=usage["max_tokens"],
        usage_ratio=usage["usage_ratio"],
        compaction_triggered=compaction_triggered,
    )


@router.get("/conversation/{chat_id}/tokens", response_model=TokenUsageResponse)
async def get_token_usage(
    chat_id: UUID,
    cm: ContextManager = Depends(get_context_manager),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> TokenUsageResponse:
    """Retrieve current token usage statistics for a conversation."""
    user_id = payload.get("user_id", "")
    await validate_chat_access(chat_id, user_id, db)

    usage = await cm.get_token_usage(chat_id)
    return TokenUsageResponse(
        current_tokens=usage["current_tokens"],
        max_tokens=usage["max_tokens"],
        usage_ratio=usage["usage_ratio"],
        compaction_triggered=False,
    )
