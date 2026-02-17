"""Tool approval endpoints for human-in-the-loop tool execution."""

import asyncio
import json
import logging
from typing import Optional

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from app.api.context_deps import get_current_user_payload

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tool-approvals", tags=["tools"])

# Redis channel prefix for tool approval pub/sub
_APPROVAL_CHANNEL_PREFIX = "tool_approval:"
_APPROVAL_RESULT_PREFIX = "tool_approval_result:"
# How long to wait for approval before timing out (seconds)
_APPROVAL_TIMEOUT_SECONDS = 120


class ToolApprovalRequest(BaseModel):
    """Request body for approving or denying a tool call."""
    call_id: str
    approved: bool
    modified_arguments: Optional[dict] = None


class ToolApprovalResponse(BaseModel):
    """Response confirming the approval was published."""
    call_id: str
    status: str  # "published" or "error"


def _get_redis(request: Request) -> aioredis.Redis:
    """Get Redis client from app state."""
    kernel = getattr(request.app.state, "kernel", None)
    if kernel is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Kernel not initialized",
        )
    # Get Redis from the tool_registry service
    registry = kernel.get_service("tool_registry")
    if registry and getattr(registry, "_redis", None):
        return registry._redis

    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Redis not available",
    )


@router.post("", response_model=ToolApprovalResponse)
async def submit_tool_approval(
    body: ToolApprovalRequest,
    request: Request,
    payload: dict = Depends(get_current_user_payload),
) -> ToolApprovalResponse:
    """
    Submit an approval or denial for a pending tool call.

    The streaming endpoint subscribes to a Redis channel for each tool call
    that requires approval. This endpoint publishes the user's decision
    to that channel, unblocking the stream.
    """
    redis_client = _get_redis(request)

    channel = f"{_APPROVAL_CHANNEL_PREFIX}{body.call_id}"
    result_key = f"{_APPROVAL_RESULT_PREFIX}{body.call_id}"
    message = json.dumps({
        "approved": body.approved,
        "modified_arguments": body.modified_arguments,
        "user_id": payload.get("user_id", ""),
    })

    try:
        await redis_client.set(result_key, message, ex=int(_APPROVAL_TIMEOUT_SECONDS))
        await redis_client.publish(channel, message)
        logger.info(
            "Tool approval published: call_id=%s approved=%s",
            body.call_id, body.approved,
        )
        return ToolApprovalResponse(call_id=body.call_id, status="published")
    except Exception as e:
        logger.exception("Failed to publish tool approval: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to publish approval",
        )


async def wait_for_approval(
    redis_client: aioredis.Redis,
    call_id: str,
    timeout: float = _APPROVAL_TIMEOUT_SECONDS,
) -> Optional[dict]:
    """
    Wait for a tool approval decision via Redis pub/sub.

    Called from the streaming endpoint when a tool call requires approval.

    Args:
        redis_client: Async Redis client.
        call_id: Unique tool call identifier.
        timeout: Seconds to wait before timing out.

    Returns:
        Dict with 'approved' bool and optional 'modified_arguments',
        or None if timed out.
    """
    channel = f"{_APPROVAL_CHANNEL_PREFIX}{call_id}"
    result_key = f"{_APPROVAL_RESULT_PREFIX}{call_id}"
    pubsub = redis_client.pubsub()

    try:
        cached = await redis_client.get(result_key)
        if cached:
            try:
                return json.loads(cached)
            except (json.JSONDecodeError, TypeError):
                logger.warning("Invalid cached approval payload for call_id=%s", call_id)

        await pubsub.subscribe(channel)

        # Poll for messages with timeout
        deadline = asyncio.get_running_loop().time() + timeout
        while asyncio.get_running_loop().time() < deadline:
            message = await pubsub.get_message(
                ignore_subscribe_messages=True, timeout=1.0
            )
            if message and message["type"] == "message":
                try:
                    data = json.loads(message["data"])
                    return data
                except (json.JSONDecodeError, TypeError):
                    logger.warning("Invalid approval message for call_id=%s", call_id)
                    continue

        logger.info("Tool approval timed out: call_id=%s", call_id)
        return None

    finally:
        await pubsub.unsubscribe(channel)
        await pubsub.aclose()
