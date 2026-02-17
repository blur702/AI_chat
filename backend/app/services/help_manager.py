"""
HelpManager: Service for managing help topics in the database.
"""

import logging
from typing import List, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.help_topic import HelpTopic

logger = logging.getLogger(__name__)


class HelpManager:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_topic(self, topic_id: UUID) -> Optional[HelpTopic]:
        result = await self.db.execute(select(HelpTopic).where(HelpTopic.id == topic_id))
        return result.scalar_one_or_none()

    async def get_topic_by_slug(self, slug: str) -> Optional[HelpTopic]:
        result = await self.db.execute(select(HelpTopic).where(HelpTopic.slug == slug))
        return result.scalar_one_or_none()

    async def list_topics(self, section_id: Optional[str] = None, tag: Optional[str] = None) -> List[HelpTopic]:
        stmt = select(HelpTopic)
        if section_id:
            stmt = stmt.where(HelpTopic.section_id == section_id)
        if tag:
            stmt = stmt.where(HelpTopic.tags.contains([tag]))
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def create_topic(self, slug: str, section_id: str, title: str, body: str, tags: Optional[List[str]] = None) -> HelpTopic:
        topic = HelpTopic(slug=slug, section_id=section_id, title=title, body=body, tags=tags or [])
        try:
            self.db.add(topic)
            await self.db.commit()
            await self.db.refresh(topic)
        except Exception:
            await self.db.rollback()
            logger.exception("Failed to create help topic for slug '%s'", slug)
            raise
        return topic

    async def create_or_update_topic(
        self,
        slug: str,
        section_id: str,
        title: str,
        body: str,
        tags: Optional[List[str]] = None,
    ) -> tuple[HelpTopic, bool]:
        """
        Create a new topic or update an existing one by slug.

        Returns:
            (topic, changed) where changed is True if the row was created or updated.
        """
        existing = await self.get_topic_by_slug(slug)
        normalized_tags = tags or []

        if existing is None:
            created = await self.create_topic(
                slug=slug,
                section_id=section_id,
                title=title,
                body=body,
                tags=normalized_tags,
            )
            return created, True

        changed = (
            existing.section_id != section_id
            or existing.title != title
            or existing.body != body
            or (existing.tags or []) != normalized_tags
        )
        if not changed:
            return existing, False

        existing.section_id = section_id
        existing.title = title
        existing.body = body
        existing.tags = normalized_tags
        try:
            await self.db.commit()
            await self.db.refresh(existing)
        except Exception:
            await self.db.rollback()
            logger.exception("Failed to update help topic for slug '%s'", slug)
            raise
        return existing, True

    async def delete_topic(self, topic_id: UUID) -> bool:
        topic = await self.get_topic(topic_id)
        if not topic:
            return False
        try:
            await self.db.delete(topic)
            await self.db.commit()
            return True
        except Exception:
            await self.db.rollback()
            logger.exception("Failed to delete help topic %s", topic_id)
            return False
