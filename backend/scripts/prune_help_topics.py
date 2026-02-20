"""
Delete orphaned help topics from the database by slug.
"""

import asyncio
import os
import sys

from sqlalchemy import delete

# Ensure app import works when script runs directly.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.database import AsyncSessionLocal
from app.models.help_topic import HelpTopic

ORPHAN_SLUGS = [
    "app-admin-overview",
    "app-chat-overview",
    "app-drupal-overview",
    "app-imagegen-overview",
    "app-kb-overview",
    "app-mcp-overview",
    "app-overview",
    "app-projects-overview",
    "app-settings-overview",
    "app-studio-overview",
    "app-tools-overview",
    "app-workspace-overview",
    "drupal-connect-api-key",
    "field-help-overview",
    "issues-severity",
    "issues-start-fix",
    "issues-status-workflow",
    "notes-ai-title",
    "notes-categories",
    "notes-kanban",
    "notes-promote-to-issue",
    "sidebar-help",
    "sidebar-ide",
    "sidebar-logout",
    "sidebar-palettes",
    "sidebar-projects",
    "sidebar-settings",
    "studio-export",
    "studio-media-bin",
    "studio-screen-recorder",
    "studio-subtitle-editor",
    "studio-timeline",
    "tool-parameter-number",
    "tool-parameter-select",
]


async def main() -> None:
    async with AsyncSessionLocal() as session:
        stmt = delete(HelpTopic).where(HelpTopic.slug.in_(ORPHAN_SLUGS))
        result = await session.execute(stmt)
        await session.commit()
        print(f"Deleted {result.rowcount or 0} help topics.")


if __name__ == "__main__":
    asyncio.run(main())

