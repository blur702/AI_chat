"""Common API utilities and helpers."""

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


async def get_or_404(
    db: AsyncSession,
    model: type,
    id_value,
    detail: str = "Not found",
):
    """
    Fetch a single row by primary key or raise 404.

    Args:
        db: AsyncSession for database access.
        model: SQLAlchemy model class.
        id_value: Value to match against model.id.
        detail: Error message for 404 response.

    Returns:
        The matched model instance.

    Raises:
        HTTPException: 404 Not Found if no matching row exists.
    """
    result = await db.execute(select(model).where(model.id == id_value))
    obj = result.scalar_one_or_none()
    if obj is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=detail,
        )
    return obj
