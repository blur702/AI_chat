"""
Authentication API endpoints.

Provides login, user creation, and current user info.
"""

import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import (
    create_access_token,
    extract_request_metadata,
    get_current_user_payload,
    log_security_event,
    require_admin,
)
from app.database import get_db_session
from app.middleware.rate_limit import (
    rate_limit_login,
    rate_limit_password_change,
    rate_limit_password_reset,
    rate_limit_user_creation,
)
from app.models.user import User, is_master_user
from app.models.utils import hash_password, validate_password_strength, verify_password
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    PasswordChangeRequest,
    PasswordChangeResponse,
    PasswordResetConfirmRequest,
    PasswordResetConfirmResponse,
    PasswordResetRequest,
    PasswordResetResponse,
    UserCreateRequest,
    UserCreateResponse,
    UserResponse,
    UserUpdateRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])
users_router = APIRouter(prefix="/users", tags=["users"])

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_DURATION_MINUTES = 15


@router.post("/login", response_model=LoginResponse)
@rate_limit_login
async def login(
    body: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
) -> LoginResponse:
    """Authenticate with username or email and password."""
    meta = extract_request_metadata(request)
    invalid_credentials = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    result = await db.execute(
        select(User).where(
            or_(
                User.username == body.identifier,
                User.email == body.identifier,
            ),
            User.is_active == True,  # noqa: E712
        )
    )
    user = result.scalar_one_or_none()

    if user is None:
        await log_security_event(
            db, action="login_failed", event_status="failure",
            ip_address=meta["ip_address"], user_agent=meta["user_agent"],
            details={"identifier": body.identifier, "reason": "user_not_found"},
        )
        await db.commit()
        raise invalid_credentials

    # Check account lockout
    if user.is_locked():
        await log_security_event(
            db, action="login_blocked", event_status="warning",
            user_id=user.id,
            ip_address=meta["ip_address"], user_agent=meta["user_agent"],
            details={"reason": "account_locked"},
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is temporarily locked. Please try again later.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Clear stale lockout state after the lock window has expired
    if user.locked_until is not None:
        user.reset_failed_login()
        await db.commit()

    if not verify_password(body.password, user.hashed_password):
        was_locked = user.increment_failed_login(MAX_FAILED_ATTEMPTS, LOCKOUT_DURATION_MINUTES)
        if was_locked:
            logger.warning(
                "Account locked for user %s after %d failed attempts",
                user.username,
                user.failed_login_attempts,
            )
            await log_security_event(
                db, action="account_locked", event_status="warning",
                user_id=user.id,
                ip_address=meta["ip_address"], user_agent=meta["user_agent"],
                details={"failed_attempts": user.failed_login_attempts},
            )
        else:
            await log_security_event(
                db, action="login_failed", event_status="failure",
                user_id=user.id,
                ip_address=meta["ip_address"], user_agent=meta["user_agent"],
                details={"reason": "invalid_password"},
            )
        await db.commit()
        raise invalid_credentials

    # Successful login — reset lockout state
    user.reset_failed_login()
    user.last_login_at = datetime.now(timezone.utc)

    await log_security_event(
        db, action="login_success", event_status="success",
        user_id=user.id,
        ip_address=meta["ip_address"], user_agent=meta["user_agent"],
    )
    await db.commit()

    access_token = create_access_token(
        data={
            "user_id": str(user.id),
            "role": user.role,
            "username": user.username,
        }
    )

    return LoginResponse(
        access_token=access_token,
        user_id=user.id,
        role=user.role,
        username=user.username,
        screen_name=user.screen_name or user.username,
    )


@router.post(
    "/users",
    response_model=UserCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
@rate_limit_user_creation
async def create_user(
    body: UserCreateRequest,
    request: Request,
    _payload: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> UserCreateResponse:
    """Create a new user account (admin only)."""
    meta = extract_request_metadata(request)
    admin_id = _payload.get("user_id")

    # Prevent creating a user with a protected master username
    if is_master_user(body.username):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already exists",
        )

    # Check for existing username
    existing = await db.execute(
        select(User).where(User.username == body.username)
    )
    if existing.scalar_one_or_none():
        await log_security_event(
            db, action="user_creation_failed", event_status="failure",
            ip_address=meta["ip_address"], user_agent=meta["user_agent"],
            details={"reason": "username_exists", "username": body.username, "admin_id": admin_id},
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already exists",
        )

    # Check for existing email
    if body.email:
        existing_email = await db.execute(
            select(User).where(User.email == body.email)
        )
        if existing_email.scalar_one_or_none():
            await log_security_event(
                db, action="user_creation_failed", event_status="failure",
                ip_address=meta["ip_address"], user_agent=meta["user_agent"],
                details={"reason": "email_exists", "admin_id": admin_id},
            )
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already exists",
            )

    # Validate password strength
    is_valid, error_msg = validate_password_strength(body.password)
    if not is_valid:
        await log_security_event(
            db, action="user_creation_failed", event_status="failure",
            ip_address=meta["ip_address"], user_agent=meta["user_agent"],
            details={"reason": "weak_password", "admin_id": admin_id},
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_msg,
        )

    user = User(
        username=body.username,
        email=body.email,
        hashed_password=hash_password(body.password),
        role=body.role,
        first_name=body.first_name,
        last_name=body.last_name,
        screen_name=body.screen_name or body.username,
        last_password_change=datetime.now(timezone.utc),
    )
    db.add(user)
    await db.flush()

    await log_security_event(
        db, action="user_created", event_status="success",
        user_id=user.id,
        ip_address=meta["ip_address"], user_agent=meta["user_agent"],
        details={"username": user.username, "role": user.role, "admin_id": admin_id},
    )
    await db.commit()
    await db.refresh(user)

    return UserCreateResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        role=user.role,
        is_active=user.is_active,
        first_name=user.first_name,
        last_name=user.last_name,
        screen_name=user.screen_name,
    )


@router.get("/me", response_model=UserResponse)
async def get_current_user(
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> UserResponse:
    """Get current authenticated user info."""
    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: missing user_id",
        )

    result = await db.execute(
        select(User).where(User.id == user_id, User.is_active == True)  # noqa: E712
    )
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    return UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        role=user.role,
        is_active=user.is_active,
        first_name=user.first_name,
        last_name=user.last_name,
        screen_name=user.screen_name,
    )


async def _update_user_profile_handler(
    user_id: str,
    body: UserUpdateRequest,
    request: Request,
    payload: dict,
    db: AsyncSession,
) -> UserResponse:
    """Shared handler for profile update."""
    meta = extract_request_metadata(request)
    requesting_user_id = payload.get("user_id")

    if str(user_id) != str(requesting_user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only update your own profile",
        )

    result = await db.execute(
        select(User).where(User.id == user_id, User.is_active == True)  # noqa: E712
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Check email uniqueness if changing email
    if body.email is not None and body.email != user.email:
        existing_email = await db.execute(
            select(User).where(User.email == body.email)
        )
        if existing_email.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already exists",
            )

    if body.first_name is not None:
        user.first_name = body.first_name
    if body.last_name is not None:
        user.last_name = body.last_name
    if body.screen_name is not None:
        user.screen_name = body.screen_name
    if body.email is not None:
        user.email = body.email

    await log_security_event(
        db, action="profile_updated", event_status="success",
        user_id=user.id,
        ip_address=meta["ip_address"], user_agent=meta["user_agent"],
    )
    await db.commit()
    await db.refresh(user)

    return UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        role=user.role,
        is_active=user.is_active,
        first_name=user.first_name,
        last_name=user.last_name,
        screen_name=user.screen_name,
    )


# Canonical route: /api/users/{user_id}
@users_router.put("/{user_id}", response_model=UserResponse)
async def update_user_profile(
    user_id: str,
    body: UserUpdateRequest,
    request: Request,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> UserResponse:
    """Update the current user's profile fields."""
    return await _update_user_profile_handler(user_id, body, request, payload, db)


# Backward-compatible alias: /api/auth/users/{user_id}
@router.put("/users/{user_id}", response_model=UserResponse, include_in_schema=False)
async def update_user_profile_alias(
    user_id: str,
    body: UserUpdateRequest,
    request: Request,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> UserResponse:
    return await _update_user_profile_handler(user_id, body, request, payload, db)


@router.post("/change-password", response_model=PasswordChangeResponse)
@rate_limit_password_change
async def change_password(
    body: PasswordChangeRequest,
    request: Request,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> PasswordChangeResponse:
    """Change the current user's password."""
    meta = extract_request_metadata(request)
    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: missing user_id",
        )

    result = await db.execute(
        select(User).where(User.id == user_id, User.is_active == True)  # noqa: E712
    )
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if not verify_password(body.current_password, user.hashed_password):
        await log_security_event(
            db, action="password_change_failed", event_status="failure",
            user_id=user.id,
            ip_address=meta["ip_address"], user_agent=meta["user_agent"],
            details={"reason": "incorrect_current_password"},
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect",
        )

    if body.current_password == body.new_password:
        await log_security_event(
            db, action="password_change_failed", event_status="failure",
            user_id=user.id,
            ip_address=meta["ip_address"], user_agent=meta["user_agent"],
            details={"reason": "same_password"},
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from current password",
        )

    is_valid, error_msg = validate_password_strength(body.new_password)
    if not is_valid:
        await log_security_event(
            db, action="password_change_failed", event_status="failure",
            user_id=user.id,
            ip_address=meta["ip_address"], user_agent=meta["user_agent"],
            details={"reason": "weak_password"},
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_msg,
        )

    now = datetime.now(timezone.utc)
    user.hashed_password = hash_password(body.new_password)
    user.last_password_change = now

    await log_security_event(
        db, action="password_change", event_status="success",
        user_id=user.id,
        ip_address=meta["ip_address"], user_agent=meta["user_agent"],
    )
    await db.commit()

    return PasswordChangeResponse(
        message="Password changed successfully",
        changed_at=now,
    )


RESET_TOKEN_EXPIRE_MINUTES = 30


@router.post("/reset-password", response_model=PasswordResetResponse)
@rate_limit_password_reset
async def request_password_reset(
    body: PasswordResetRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
) -> PasswordResetResponse:
    """Request a password reset token for the given email."""
    meta = extract_request_metadata(request)

    result = await db.execute(
        select(User).where(User.email == body.email, User.is_active == True)  # noqa: E712
    )
    user = result.scalar_one_or_none()

    if user is None:
        await log_security_event(
            db, action="password_reset_requested", event_status="failure",
            ip_address=meta["ip_address"], user_agent=meta["user_agent"],
            details={"email": body.email, "reason": "email_not_found"},
        )
        await db.commit()
        # Return same response to avoid email enumeration
        return PasswordResetResponse(
            message="If an account with that email exists, a reset token has been generated.",
        )

    # Master users cannot have their password reset externally
    if is_master_user(user.username):
        await log_security_event(
            db, action="password_reset_requested", event_status="failure",
            user_id=user.id,
            ip_address=meta["ip_address"], user_agent=meta["user_agent"],
            details={"reason": "master_user_protected"},
        )
        await db.commit()
        # Same response to avoid enumeration
        return PasswordResetResponse(
            message="If an account with that email exists, a reset token has been generated.",
        )

    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    user.password_reset_token = token_hash
    user.password_reset_expires = datetime.now(timezone.utc) + timedelta(
        minutes=RESET_TOKEN_EXPIRE_MINUTES,
    )

    await log_security_event(
        db, action="password_reset_requested", event_status="success",
        user_id=user.id,
        ip_address=meta["ip_address"], user_agent=meta["user_agent"],
        details={"email": body.email},
    )
    await db.commit()

    logger.info("Password reset token generated for user %s", user.username)

    return PasswordResetResponse(
        message="If an account with that email exists, a reset token has been generated.",
    )


@router.post("/reset-password/confirm", response_model=PasswordResetConfirmResponse)
async def confirm_password_reset(
    body: PasswordResetConfirmRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
) -> PasswordResetConfirmResponse:
    """Confirm a password reset using the token."""
    meta = extract_request_metadata(request)

    token_hash = hashlib.sha256(body.token.encode()).hexdigest()
    result = await db.execute(
        select(User).where(
            User.password_reset_token == token_hash,
            User.is_active == True,  # noqa: E712
        )
    )
    user = result.scalar_one_or_none()

    if user is None:
        await log_security_event(
            db, action="password_reset_confirmed", event_status="failure",
            ip_address=meta["ip_address"], user_agent=meta["user_agent"],
            details={"reason": "invalid_token"},
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )

    if (
        user.password_reset_expires is None
        or user.password_reset_expires < datetime.now(timezone.utc)
    ):
        user.password_reset_token = None
        user.password_reset_expires = None
        await log_security_event(
            db, action="password_reset_confirmed", event_status="failure",
            user_id=user.id,
            ip_address=meta["ip_address"], user_agent=meta["user_agent"],
            details={"reason": "token_expired"},
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )

    is_valid, error_msg = validate_password_strength(body.new_password)
    if not is_valid:
        await log_security_event(
            db, action="password_reset_confirmed", event_status="failure",
            user_id=user.id,
            ip_address=meta["ip_address"], user_agent=meta["user_agent"],
            details={"reason": "weak_password"},
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_msg,
        )

    now = datetime.now(timezone.utc)
    user.hashed_password = hash_password(body.new_password)
    user.last_password_change = now
    user.password_reset_token = None
    user.password_reset_expires = None

    await log_security_event(
        db, action="password_reset_confirmed", event_status="success",
        user_id=user.id,
        ip_address=meta["ip_address"], user_agent=meta["user_agent"],
    )
    await db.commit()

    return PasswordResetConfirmResponse(
        message="Password has been reset successfully",
        reset_at=now,
    )
