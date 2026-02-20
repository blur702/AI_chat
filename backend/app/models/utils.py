"""
Password hashing utilities for user authentication.
"""

import re
from typing import Optional, Tuple

from passlib.context import CryptContext

# Configure password hashing context with bcrypt
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Top common passwords to reject
COMMON_PASSWORDS = frozenset({
    "password", "123456", "12345678", "qwerty", "abc123", "monkey", "master",
    "dragon", "111111", "baseball", "iloveyou", "trustno1", "sunshine",
    "princess", "football", "charlie", "shadow", "michael", "login",
    "superman", "letmein", "welcome", "admin", "passw0rd", "password1",
    "1234567", "123456789", "1234567890", "12345", "1234", "123123",
    "000000", "654321", "qwerty123", "password123", "admin123", "root",
    "toor", "pass", "test", "guest", "access", "love", "god", "secret",
    "angel", "hello", "donald", "starwars", "mustang",
    "hockey", "ranger", "thomas", "klaster", "george", "computer",
    "michelle", "daniel", "maggie", "qwerty1", "soccer", "anthony",
    "friends", "butterfly", "purple", "jordan", "liverpool", "abcdef",
    "andrea", "chester", "joshua", "matthew", "harley", "andrew",
    "buster", "ginger", "hunter", "summer", "corvette", "phoenix",
    "mercedes", "thunder", "pepper", "hammer", "yankees", "dallas",
    "austin", "taylor", "matrix", "minemine", "marina", "bailey",
    "freedom", "killer", "jennifer", "amanda", "jessica", "samantha",
    "lovely", "master1", "whatever", "trustme", "banana",
})


def validate_password_strength(password: str) -> Tuple[bool, Optional[str]]:
    """
    Validate password meets strength requirements.

    Returns:
        Tuple of (is_valid, error_message). error_message is None when valid.
    """
    if len(password) < 8:
        return False, "Password must be at least 8 characters long"

    if not re.search(r"[A-Z]", password):
        return False, "Password must contain at least one uppercase letter"

    if not re.search(r"[a-z]", password):
        return False, "Password must contain at least one lowercase letter"

    if not re.search(r"\d", password):
        return False, "Password must contain at least one digit"

    if not re.search(r"[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]", password):
        return False, "Password must contain at least one special character"

    if password.lower() in COMMON_PASSWORDS:
        return False, "Password is too common. Please choose a more unique password"

    return True, None


def hash_password(password: str) -> str:
    """
    Hash a plain text password using bcrypt.

    Args:
        password: The plain text password to hash.

    Returns:
        The hashed password string.
    """
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a plain text password against a hashed password.

    Args:
        plain_password: The plain text password to verify.
        hashed_password: The hashed password to compare against.

    Returns:
        True if the password matches, False otherwise.
    """
    return pwd_context.verify(plain_password, hashed_password)
