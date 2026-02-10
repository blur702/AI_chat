"""Message submission and streaming endpoints."""

import json
import logging
import re
import time
from typing import Optional
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.context_deps import (
    get_context_manager,
    get_current_user_payload,
    get_db_session,
    get_ollama_client,
    validate_chat_access,
)
from app.kernel.context_manager import ContextManager
from app.models.automation_action import AutomationAction
from app.models.message import Message
from app.schemas.context import (
    ConversationStateResponse,
    ConversationStateUpdateRequest,
    MessageSubmitRequest,
    MessageSubmitResponse,
)
from app.services.ollama_client import OllamaClient

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/context", tags=["context"])

# Pattern: [ACTION:type] at start of line, followed by optional JSON block
_ACTION_PATTERN = re.compile(
    r'^\s*\[ACTION:(\w+)\]\s*(?:```json\s*(.*?)\s*```)?',
    re.MULTILINE | re.DOTALL,
)


async def _extract_and_create_actions(
    content: str,
    project_id: UUID,
    db: AsyncSession,
) -> list[str]:
    """Parse assistant content for action proposals and create AutomationAction records."""
    action_ids: list[str] = []
    for match in _ACTION_PATTERN.finditer(content):
        action_type = match.group(1)
        json_str = match.group(2)
        action_data = None
        if json_str:
            try:
                action_data = json.loads(json_str)
            except json.JSONDecodeError:
                pass

        action = AutomationAction(
            project_id=project_id,
            action_type=action_type,
            action_data=action_data,
            user_approved=False,
        )
        db.add(action)
        await db.flush()
        action_ids.append(str(action.id))

    if action_ids:
        await db.commit()
        logger.info(
            "Created %d automation actions from assistant response for project %s",
            len(action_ids), project_id,
        )

    return action_ids


# -------------------------------------------------------------------------
# Conversation State Endpoints
# -------------------------------------------------------------------------


@router.get("/conversation/{chat_id}", response_model=ConversationStateResponse)
async def get_conversation_state(
    chat_id: UUID,
    cm: ContextManager = Depends(get_context_manager),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> ConversationStateResponse:
    """Retrieve the full conversation state for a chat."""
    user_id = payload.get("user_id", "")
    await validate_chat_access(chat_id, user_id, db)

    state = await cm.get_conversation_state(chat_id)
    if state is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Chat '{chat_id}' not found",
        )

    return ConversationStateResponse(**state)


@router.put("/conversation/{chat_id}", response_model=ConversationStateResponse)
async def update_conversation_state(
    chat_id: UUID,
    body: ConversationStateUpdateRequest,
    cm: ContextManager = Depends(get_context_manager),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> ConversationStateResponse:
    """Update the cached conversation state with the provided updates."""
    user_id = payload.get("user_id", "")
    await validate_chat_access(chat_id, user_id, db)

    state = await cm.update_conversation_state(chat_id, body.updates)
    if state is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Chat '{chat_id}' not found",
        )

    return ConversationStateResponse(**state)


@router.delete(
    "/conversation/{chat_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def invalidate_conversation_cache(
    chat_id: UUID,
    cm: ContextManager = Depends(get_context_manager),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Invalidate the cached conversation state for a chat."""
    user_id = payload.get("user_id", "")
    await validate_chat_access(chat_id, user_id, db)

    await cm.invalidate_conversation_cache(chat_id)


# -------------------------------------------------------------------------
# Message Submission Endpoint
# -------------------------------------------------------------------------


@router.post(
    "/conversations/{chat_id}/messages",
    response_model=MessageSubmitResponse,
    status_code=status.HTTP_201_CREATED,
)
async def submit_message(
    chat_id: UUID,
    body: MessageSubmitRequest,
    cm: ContextManager = Depends(get_context_manager),
    ollama: OllamaClient = Depends(get_ollama_client),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> MessageSubmitResponse:
    """Submit a user message and receive an AI assistant response."""
    user_id = payload.get("user_id", "")
    await validate_chat_access(chat_id, user_id, db)

    # -- 1. Persist user message and commit immediately --------------------
    user_msg = Message(
        chat_id=chat_id,
        role="user",
        content=body.content,
        message_metadata=body.metadata,
    )
    db.add(user_msg)
    await db.commit()
    user_msg_id = str(user_msg.id)
    logger.info(
        "User message stored: chat_id=%s, msg_id=%s, length=%d",
        chat_id, user_msg_id, len(body.content),
    )

    # -- 2. Build prompt from conversation history -------------------------
    state = await cm.get_conversation_state(chat_id)
    history_messages: list[dict[str, str]] = []

    prefs = await cm.get_user_preferences(user_id)
    system_prompt = (
        prefs.get("custom_system_prompt")
        or "You are a helpful AI assistant."
    )
    history_messages.append({"role": "system", "content": system_prompt})

    if state and state.get("messages"):
        recent = [
            m for m in state["messages"]
            if not m.get("is_excluded", False)
        ][-50:]
        for m in recent:
            if m["role"] in ("user", "assistant"):
                history_messages.append(
                    {"role": m["role"], "content": m["content"]}
                )

    # -- 2b. Inject KB context (RAG) -----------------------------------------
    project_id = state.get("project_id") if state else None
    if project_id:
        kb_results = await cm.get_relevant_kb_context(
            project_id=project_id, query=body.content, top_k=3
        )
        if kb_results:
            kb_context = "\n\n".join(
                f"[Knowledge Base Context {i + 1}]\n{r['content']}"
                for i, r in enumerate(kb_results)
            )
            history_messages.insert(1, {
                "role": "system",
                "content": f"Relevant project knowledge:\n{kb_context}",
            })

    history_messages.append({"role": "user", "content": body.content})

    # -- 3. Resolve model --------------------------------------------------
    model = body.model or await ollama.get_default_model()

    # -- 4. Call Ollama (no open DB transaction) ----------------------------
    t0 = time.monotonic()
    try:
        result = await ollama.chat_completion(
            messages=history_messages,
            model=model,
        )
    except (httpx.TimeoutException, httpx.HTTPStatusError, httpx.ConnectError) as exc:
        # Use a fresh session to avoid race conditions with the injected session
        from app.database import AsyncSessionLocal
        try:
            async with AsyncSessionLocal() as cleanup_db:
                orphan = await cleanup_db.get(Message, UUID(user_msg_id))
                if orphan:
                    await cleanup_db.delete(orphan)
                    await cleanup_db.commit()
        except Exception:
            logger.warning("Failed to clean up user message %s", user_msg_id)

        if isinstance(exc, httpx.TimeoutException):
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="Ollama request timed out",
            ) from exc
        if isinstance(exc, httpx.HTTPStatusError):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Ollama error: {exc.response.text}",
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cannot connect to Ollama service",
        ) from exc

    elapsed_ms = (time.monotonic() - t0) * 1000
    assistant_content = result.get("message", {}).get("content", "")
    logger.info(
        "Ollama response: model=%s, time=%.0fms, length=%d",
        model, elapsed_ms, len(assistant_content),
    )

    # -- 5. Persist assistant message in a fresh transaction ----------------
    assistant_msg = Message(
        chat_id=chat_id,
        role="assistant",
        content=assistant_content,
        message_metadata={"model": model},
    )
    db.add(assistant_msg)
    await db.commit()
    assistant_msg_id = str(assistant_msg.id)
    assistant_created = str(assistant_msg.created_at) if assistant_msg.created_at else None

    # -- 6. Extract action proposals ----------------------------------------
    action_ids: list[str] = []
    project_id = state.get("project_id") if state else None
    if project_id and _ACTION_PATTERN.search(assistant_content):
        action_ids = await _extract_and_create_actions(
            assistant_content, UUID(str(project_id)), db
        )

    # -- 7. Invalidate cache -----------------------------------------------
    await cm.invalidate_conversation_cache(chat_id)

    response = MessageSubmitResponse(
        message_id=user_msg_id,
        assistant_message_id=assistant_msg_id,
        content=assistant_content,
        model=model,
        created_at=assistant_created,
    )

    if action_ids:
        response.action_ids = action_ids

    return response


# -------------------------------------------------------------------------
# Streaming Message Endpoint (SSE)
# -------------------------------------------------------------------------


@router.post("/conversations/{chat_id}/messages/stream")
async def stream_message(
    chat_id: UUID,
    request: Request,
    cm: ContextManager = Depends(get_context_manager),
    ollama: OllamaClient = Depends(get_ollama_client),
    db: AsyncSession = Depends(get_db_session),
) -> StreamingResponse:
    """Stream an AI response via Server-Sent Events."""
    from app.auth import verify_token as _verify

    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
        )
    auth_token = auth_header[7:]

    payload = _verify(auth_token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    user_id = payload.get("user_id", "")

    body = await request.json()
    content: str = body.get("content", "").strip()
    model: Optional[str] = body.get("model")
    if not content:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Message content is required",
        )
    await validate_chat_access(chat_id, user_id, db)

    # -- Persist user message ----------------------------------------------
    user_msg = Message(
        chat_id=chat_id,
        role="user",
        content=content,
    )
    db.add(user_msg)
    await db.commit()
    user_msg_id = str(user_msg.id)
    logger.info(
        "SSE: user message stored chat_id=%s msg_id=%s len=%d",
        chat_id, user_msg_id, len(content),
    )

    # -- Build prompt from conversation history ----------------------------
    state = await cm.get_conversation_state(chat_id)
    history_messages: list[dict[str, str]] = []

    prefs = await cm.get_user_preferences(user_id)
    system_prompt = (
        prefs.get("custom_system_prompt")
        or "You are a helpful AI assistant."
    )
    history_messages.append({"role": "system", "content": system_prompt})

    if state and state.get("messages"):
        recent = [
            m for m in state["messages"]
            if not m.get("is_excluded", False)
        ][-50:]
        for m in recent:
            if m["role"] in ("user", "assistant"):
                history_messages.append(
                    {"role": m["role"], "content": m["content"]}
                )

    # -- Inject KB context (RAG) for streaming -----------------------------
    project_id = state.get("project_id") if state else None
    if project_id:
        kb_results = await cm.get_relevant_kb_context(
            project_id=project_id, query=content, top_k=3
        )
        if kb_results:
            kb_context = "\n\n".join(
                f"[Knowledge Base Context {i + 1}]\n{r['content']}"
                for i, r in enumerate(kb_results)
            )
            history_messages.insert(1, {
                "role": "system",
                "content": f"Relevant project knowledge:\n{kb_context}",
            })

    history_messages.append({"role": "user", "content": content})

    # -- Resolve model -----------------------------------------------------
    resolved_model = model or await ollama.get_default_model()

    # -- SSE generator -----------------------------------------------------
    async def event_generator():
        full_content = ""
        t0 = time.monotonic()
        try:
            async for token_text in ollama.chat_completion_stream(
                messages=history_messages,
                model=resolved_model,
            ):
                full_content += token_text
                event = json.dumps({"type": "token", "content": token_text})
                yield f"data: {event}\n\n"

            elapsed_ms = (time.monotonic() - t0) * 1000
            logger.info(
                "SSE: stream complete model=%s time=%.0fms len=%d",
                resolved_model, elapsed_ms, len(full_content),
            )

            from app.database import AsyncSessionLocal

            async with AsyncSessionLocal() as persist_db:
                assistant_msg = Message(
                    chat_id=chat_id,
                    role="assistant",
                    content=full_content,
                    message_metadata={"model": resolved_model},
                )
                persist_db.add(assistant_msg)
                await persist_db.commit()
                assistant_msg_id = str(assistant_msg.id)
                assistant_created = (
                    str(assistant_msg.created_at)
                    if assistant_msg.created_at
                    else None
                )

                await cm.invalidate_conversation_cache(chat_id)

                action_ids: list[str] = []
                if project_id and _ACTION_PATTERN.search(full_content):
                    action_ids = await _extract_and_create_actions(
                        full_content, UUID(str(project_id)), persist_db
                    )

            done_payload = {
                "type": "done",
                "message_id": assistant_msg_id,
                "model": resolved_model,
                "created_at": assistant_created,
            }
            if action_ids:
                done_payload["action_ids"] = action_ids

            done_event = json.dumps(done_payload)
            yield f"data: {done_event}\n\n"

        except (httpx.TimeoutException, httpx.ConnectError) as exc:
            logger.exception("SSE: Ollama error: %s", exc)
            try:
                async with AsyncSessionLocal() as cleanup_db:
                    orphan = await cleanup_db.get(Message, UUID(user_msg_id))
                    if orphan:
                        await cleanup_db.delete(orphan)
                        await cleanup_db.commit()
            except (Exception, ValueError):
                logger.warning("SSE: failed to clean up user message %s", user_msg_id)
            err_event = json.dumps({
                "type": "error",
                "message": "Failed to connect to LLM service",
            })
            yield f"data: {err_event}\n\n"

        except httpx.HTTPStatusError as exc:
            logger.exception("SSE: Ollama HTTP error: %s", exc)
            try:
                async with AsyncSessionLocal() as cleanup_db:
                    orphan = await cleanup_db.get(Message, UUID(user_msg_id))
                    if orphan:
                        await cleanup_db.delete(orphan)
                        await cleanup_db.commit()
            except (Exception, ValueError):
                logger.warning("SSE: failed to clean up user message %s", user_msg_id)
            err_event = json.dumps({
                "type": "error",
                "message": "LLM service returned an error",
            })
            yield f"data: {err_event}\n\n"

        except Exception as exc:
            logger.exception("SSE: unexpected error: %s", exc)
            err_event = json.dumps({
                "type": "error",
                "message": "An unexpected error occurred",
            })
            yield f"data: {err_event}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
