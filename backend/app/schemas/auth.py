"""
Authentication request/response schemas.
"""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    identifier: str = Field(..., description="Username or email")
    password: str = Field(..., min_length=1)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: UUID
    role: str
    username: str
    screen_name: Optional[str] = None


class UserCreateRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=255)
    email: Optional[EmailStr] = None
    password: str = Field(..., min_length=8)
    role: str = Field(default="user", pattern=r"^(admin|user)$")
    first_name: Optional[str] = Field(default=None, max_length=255)
    last_name: Optional[str] = Field(default=None, max_length=255)
    screen_name: Optional[str] = Field(default=None, max_length=255)


class UserCreateResponse(BaseModel):
    id: UUID
    username: str
    email: Optional[str] = None
    role: str
    is_active: bool
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    screen_name: Optional[str] = None


class UserResponse(BaseModel):
    id: UUID
    username: str
    email: Optional[str] = None
    role: str
    is_active: bool
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    screen_name: Optional[str] = None


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8)


class PasswordChangeResponse(BaseModel):
    message: str
    changed_at: datetime


class PasswordResetRequest(BaseModel):
    email: EmailStr = Field(..., description="Email address of the account to reset")


class PasswordResetResponse(BaseModel):
    message: str


class PasswordResetConfirmRequest(BaseModel):
    token: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8)


class PasswordResetConfirmResponse(BaseModel):
    message: str
    reset_at: datetime


class PasswordValidationError(BaseModel):
    detail: str
    requirements: List[str] = [
        "Minimum 8 characters",
        "At least 1 uppercase letter",
        "At least 1 lowercase letter",
        "At least 1 digit",
        "At least 1 special character",
        "Not a common password",
    ]


class UserUpdateRequest(BaseModel):
    first_name: Optional[str] = Field(default=None, max_length=255)
    last_name: Optional[str] = Field(default=None, max_length=255)
    screen_name: Optional[str] = Field(default=None, max_length=255)
    email: Optional[EmailStr] = None
