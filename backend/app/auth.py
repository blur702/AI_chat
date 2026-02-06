"""
JWT Authentication utilities for WebSocket and API authentication.

Provides token generation and validation functions using python-jose.
"""

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from jose import JWTError, jwt

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
