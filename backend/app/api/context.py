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

from app.api.chats import router as chats_router  # noqa: F401
from app.api.context_deps import (
    get_context_manager,
    get_current_user_payload,
    get_db_session,
    get_ollama_client,
    validate_chat_access,
)

# Re-export sub-module routers so main.py can import from here unchanged
from app.api.messages import router as messages_router  # noqa: F401
from app.api.projects import context_projects_router  # noqa: F401
from app.api.projects import router as projects_router  # noqa: F401
from app.auth import get_user_id
from app.kernel.context_manager import ContextManager
from app.kernel.prompt_builder import PromptBuilder
from app.kernel.token_counter import TokenCounter
from app.schemas.context import (
    ModelInfo,
    ModelListResponse,
    TokenizeRequest,
    TokenizeResponse,
    TokenSpan,
    TokenUsageRequest,
    TokenUsageResponse,
    UserPreferencesResponse,
    UserPreferencesUpdateRequest,
)
from app.services.ollama_client import OllamaClient

logger = logging.getLogger(__name__)

_token_counter = TokenCounter()
_prompt_builder = PromptBuilder(_token_counter)

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
    requesting_user = get_user_id(payload)
    if str(user_id) != str(requesting_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only access your own preferences",
        )

    try:
        prefs = await cm.get_user_preferences(user_id)
    except Exception as exc:
        logger.warning("Failed to load preferences for user %s: %s", user_id, exc)
        return UserPreferencesResponse()
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
    requesting_user = get_user_id(payload)
    if str(user_id) != str(requesting_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only update your own preferences",
        )

    from app.models.user_preference import UserPreference

    result = await db.execute(select(UserPreference).where(UserPreference.user_id == user_id))
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
        default_num_ctx=pref.default_num_ctx,
        email_notifications=pref.email_notifications,
        in_app_notifications=pref.in_app_notifications,
        imggen_default_workflow=pref.imggen_default_workflow,
        imggen_default_width=pref.imggen_default_width,
        imggen_default_height=pref.imggen_default_height,
        imggen_default_steps=pref.imggen_default_steps,
        imggen_default_cfg_scale=pref.imggen_default_cfg_scale,
        imggen_default_prompt=pref.imggen_default_prompt,
        imggen_system_prompt=pref.imggen_system_prompt,
        imggen_default_negative_prompt=pref.imggen_default_negative_prompt,
        imggen_completion_notification=pref.imggen_completion_notification,
        imggen_desktop_notification=pref.imggen_desktop_notification,
        imggen_sound_notification=pref.imggen_sound_notification,
        imggen_notification_sound=pref.imggen_notification_sound,
        imggen_auto_delete_days=pref.imggen_auto_delete_days,
        imggen_max_generations=pref.imggen_max_generations,
        comfyui_base_url=pref.comfyui_base_url,
        mode_prompt_overrides=pref.mode_prompt_overrides,
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


@router.post("/conversations/{chat_id}/tokens", response_model=TokenUsageResponse)
async def track_token_usage(
    chat_id: UUID,
    body: TokenUsageRequest,
    cm: ContextManager = Depends(get_context_manager),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> TokenUsageResponse:
    """Track token usage and trigger compaction if threshold is exceeded."""
    user_id = get_user_id(payload)
    await validate_chat_access(chat_id, user_id, db)

    needs_compaction = await cm.track_token_usage(chat_id, body.token_count, body.max_tokens)

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


@router.get("/conversations/{chat_id}/tokens", response_model=TokenUsageResponse)
async def get_token_usage(
    chat_id: UUID,
    cm: ContextManager = Depends(get_context_manager),
    ollama: OllamaClient = Depends(get_ollama_client),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> TokenUsageResponse:
    """Retrieve current token usage statistics for a conversation.

    Computes live from the same ``compute_token_breakdown()`` logic used by
    the Context Dashboard so both surfaces show identical numbers.
    """
    user_id = get_user_id(payload)
    await validate_chat_access(chat_id, user_id, db)

    state = await cm.get_conversation_state(chat_id)
    if state is None:
        return TokenUsageResponse(
            current_tokens=0,
            max_tokens=0,
            usage_ratio=0.0,
            compaction_triggered=False,
        )

    prefs = await cm.get_user_preferences(user_id)
    project_id = state.get("project_id")
    project_context = {}
    if project_id:
        project_context = await cm.get_project_context(UUID(str(project_id))) or {}

    system_prompt_content = await cm.resolve_system_prompt_content(
        chat_id=chat_id,
        project_id=UUID(str(project_id)) if project_id else None,
        user_id=UUID(str(user_id)),
    )

    resolved_model = prefs.get("default_model") or await ollama.get_default_model()

    breakdown = _prompt_builder.compute_token_breakdown(
        user_prefs=prefs,
        project_context=project_context,
        system_prompt_content=system_prompt_content,
        chat_instructions=state.get("chat_instructions"),
        messages=state.get("messages", []),
        compactions=state.get("compactions", []),
        model_name=resolved_model,
        chat_mode=state.get("chat_mode") or "agent",
    )

    return TokenUsageResponse(
        current_tokens=breakdown.total,
        max_tokens=breakdown.context_window,
        usage_ratio=breakdown.fill_ratio,
        compaction_triggered=False,
    )


# -------------------------------------------------------------------------
# Tokenize Text Endpoint
# -------------------------------------------------------------------------


@router.post("/tokenize", response_model=TokenizeResponse)
async def tokenize_text(
    body: TokenizeRequest,
    _payload: dict = Depends(get_current_user_payload),
) -> TokenizeResponse:
    """Tokenize text and return individual token spans with character offsets."""
    text = body.text
    text_bytes = text.encode("utf-8")
    spans: list[TokenSpan] = []
    for _tid, token_bytes, byte_start, byte_end in _token_counter.tokenize_with_spans(text):
        token_text = token_bytes.decode("utf-8", errors="replace")
        char_start = len(text_bytes[:byte_start].decode("utf-8", errors="replace"))
        char_end = len(text_bytes[:byte_end].decode("utf-8", errors="replace"))
        spans.append(TokenSpan(text=token_text, start=char_start, end=char_end))

    total = len(spans)
    characters = len(text)
    chars_per_token = characters / total if total > 0 else 0.0

    return TokenizeResponse(
        tokens=spans,
        total=total,
        characters=characters,
        chars_per_token=round(chars_per_token, 2),
    )
