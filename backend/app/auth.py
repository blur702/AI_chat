"""
JWT Authentication utilities for WebSocket and API authentication.

Provides token generation, validation, FastAPI dependencies for auth,
and audit logging utilities for security events.
"""

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
from uuid import UUID

from fastapi import Header, HTTPException, Request, status
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("workstation.auth")

# JWT Configuration
SECRET_KEY = os.getenv("SECRET_KEY", "development-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30


def create_access_token(
    data: dict,
    expires_delta: Optional[timedelta] = None
) -> str:
    """
    Create a JWT access token.

    Args:
        data: Dictionary containing token claims (e.g., {"user_id": "..."})
        expires_delta: Optional custom expiration time. Defaults to 30 minutes.

    Returns:
        Encoded JWT token string.
    """
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode["exp"] = expire
    to_encode["iat"] = datetime.now(timezone.utc)

    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def verify_token(token: str) -> Optional[dict]:
    """
    Verify and decode a JWT token.

    Args:
        token: The JWT token string to verify.

    Returns:
        Decoded payload dictionary if valid, None otherwise.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError as e:
        logger.warning(f"Token validation failed: {e}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error during token validation: {e}")
        return None


def get_user_id_from_token(token: str) -> Optional[UUID]:
    """
    Extract user_id from a JWT token.

    Args:
        token: The JWT token string.

    Returns:
        UUID of the user if token is valid and contains user_id, None otherwise.
    """
    payload = verify_token(token)

    if not payload:
        return None

    user_id_str = payload.get("user_id")
    if not user_id_str:
        logger.warning("Token valid but missing user_id claim")
        return None

    try:
        return UUID(user_id_str)
    except (ValueError, TypeError) as e:
        logger.warning(f"Invalid user_id format in token: {e}")
        return None


def create_websocket_token(user_id: UUID, expires_minutes: int = 60) -> str:
    """
    Create a JWT token specifically for WebSocket connections.

    WebSocket tokens have a longer default expiration (60 minutes) to
    accommodate long-running connections.

    Args:
        user_id: UUID of the user.
        expires_minutes: Token expiration in minutes. Defaults to 60.

    Returns:
        Encoded JWT token string.
    """
    return create_access_token(
        data={"user_id": str(user_id), "token_type": "websocket"},
        expires_delta=timedelta(minutes=expires_minutes)
    )


# -------------------------------------------------------------------------
# FastAPI Dependencies
# -------------------------------------------------------------------------


def validate_bearer_token(authorization: Optional[str]) -> dict:
    """Validate a raw Authorization header value and return the JWT payload.

    This is a standalone helper that does not depend on FastAPI's DI.
    Use this when you need to verify a Bearer token outside of a
    ``Depends()`` context (e.g. endpoints with dual auth modes).

    Raises:
        HTTPException 401: If the header is missing, malformed, or the
            token is invalid/expired.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = authorization[len("Bearer "):]
    payload = verify_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return payload


def get_current_user_payload(
    authorization: Optional[str] = Header(None),
) -> dict:
    """
    FastAPI dependency to extract and verify JWT from the Authorization header.

    Returns the decoded token payload.

    Raises:
        HTTPException 401: If token is missing or invalid.
    """
    return validate_bearer_token(authorization)


def require_admin(
    authorization: Optional[str] = Header(None),
) -> dict:
    """
    Dependency that validates JWT and enforces admin role.

    Returns:
        Decoded JWT payload if valid and admin.

    Raises:
        HTTPException 401: If token is missing or invalid.
        HTTPException 403: If authenticated user is not an admin.
    """
    payload = validate_bearer_token(authorization)

    if payload.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    return payload


# -------------------------------------------------------------------------
# Audit Logging
# -------------------------------------------------------------------------


def extract_request_metadata(request: Request) -> Dict[str, Optional[str]]:
    """Extract IP address and user agent from a request."""
    return {
        "ip_address": request.client.host if request.client else None,
        "user_agent": request.headers.get("user-agent"),
    }


async def log_security_event(
    db: AsyncSession,
    action: str,
    event_status: str,
    user_id: Optional[UUID] = None,
    resource: Optional[str] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
) -> Optional[UUID]:
    """
    Record a security event in the audit log.

    Args:
        db: Database session.
        action: Action type (e.g. 'login_success', 'password_change').
        event_status: Outcome ('success', 'failure', 'warning').
        user_id: User who performed the action (nullable).
        resource: Affected resource identifier.
        ip_address: Client IP address.
        user_agent: Client user agent string.
        details: Additional JSON context.

    Returns:
        The created audit log ID, or None on failure.
    """
    from app.models.audit_log import AuditLog

    try:
        log_entry = AuditLog(
            user_id=user_id,
            action=action,
            resource=resource,
            ip_address=ip_address,
            user_agent=user_agent,
            status=event_status,
            details=details or {},
        )
        db.add(log_entry)
        await db.flush()
        return log_entry.id
    except Exception as e:
        logger.error("Failed to write audit log: %s", e)
        return None
