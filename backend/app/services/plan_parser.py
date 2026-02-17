"""Parser for [PLAN:...] blocks in AI responses.

Extracts structured planning data from message content and creates
PlanningSession, PlanPhase, and PlanTask records.
"""

import json
import logging
import re
from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.plan_phase import PlanPhase
from app.models.plan_task import PlanTask
from app.models.planning_session import PlanningSession

logger = logging.getLogger(__name__)

# Matches [PLAN:session], [PLAN:phase], [PLAN:task] followed by a JSON code block
PLAN_BLOCK_RE = re.compile(
    r"\[PLAN:(session|phase|task)\]\s*```(?:json)?\s*(.*?)\s*```",
    re.DOTALL,
)


def extract_plan_blocks(content: str) -> List[Dict[str, Any]]:
    """Extract all [PLAN:type] blocks from message content.

    Returns a list of dicts with 'type' and 'data' keys.
    """
    blocks: List[Dict[str, Any]] = []

    for match in PLAN_BLOCK_RE.finditer(content):
        block_type = match.group(1)
        json_content = match.group(2).strip()

        try:
            data = json.loads(json_content)
            blocks.append({"type": block_type, "data": data})
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse PLAN:{block_type} block: {e}")

    return blocks


def has_plan_blocks(content: str) -> bool:
    """Check if content contains any [PLAN:...] blocks."""
    return bool(PLAN_BLOCK_RE.search(content))


async def create_from_blocks(
    blocks: List[Dict[str, Any]],
    project_id: UUID,
    chat_id: Optional[UUID],
    user_id: UUID,
    db: AsyncSession,
) -> Optional[PlanningSession]:
    """Create a planning session with phases and tasks from parsed blocks.

    Processes blocks in order: session first, then phases, then tasks.
    Tasks are attached to the most recently created phase.

    Returns the created session, or None if no session block was found.
    """
    session_data = None
    phase_blocks: List[Dict[str, Any]] = []
    task_blocks: List[Dict[str, Any]] = []

    for block in blocks:
        if block["type"] == "session":
            session_data = block["data"]
        elif block["type"] == "phase":
            phase_blocks.append(block["data"])
        elif block["type"] == "task":
            task_blocks.append(block["data"])

    if not session_data:
        # No session block — just phases/tasks, try to attach to existing session
        logger.debug("No [PLAN:session] block found, skipping session creation")
        return None

    # Create session
    planning_session = PlanningSession(
        project_id=project_id,
        chat_id=chat_id,
        user_id=user_id,
        title=session_data.get("title", "Untitled Plan"),
        description=session_data.get("description"),
        target_type=session_data.get("target_type", "sandbox"),
        success_criteria=session_data.get("success_criteria", []),
        status="active",
    )
    db.add(planning_session)
    await db.flush()  # Get the session ID

    # Create phases and track embedded task counts per phase
    created_phases: List[PlanPhase] = []
    phase_task_counts: List[int] = []  # Track task count per phase (avoids lazy-load)
    for i, phase_data in enumerate(phase_blocks):
        phase = PlanPhase(
            session_id=planning_session.id,
            title=phase_data.get("title", f"Phase {i + 1}"),
            description=phase_data.get("description", ""),
            phase_order=i,
            inputs=phase_data.get("inputs", []),
            outputs=phase_data.get("outputs", []),
            implementation_plan=phase_data.get("implementation_plan", {}),
            verification_checks=phase_data.get("verification_checks", []),
        )
        db.add(phase)
        await db.flush()
        created_phases.append(phase)

        # Create tasks embedded in the phase data
        phase_tasks = phase_data.get("tasks", [])
        for j, task_data in enumerate(phase_tasks):
            task = PlanTask(
                phase_id=phase.id,
                title=task_data.get("title", f"Task {j + 1}"),
                description=task_data.get("description", ""),
                task_order=j,
                task_type=task_data.get("task_type", "file_modify"),
                task_data=task_data.get("task_data", {}),
                depends_on=task_data.get("depends_on", []),
            )
            db.add(task)
        phase_task_counts.append(len(phase_tasks))

    # Create standalone task blocks (attach to last phase)
    if task_blocks and created_phases:
        last_phase = created_phases[-1]
        existing_count = phase_task_counts[-1]
        for k, task_data in enumerate(task_blocks):
            task = PlanTask(
                phase_id=last_phase.id,
                title=task_data.get("title", f"Task {existing_count + k + 1}"),
                description=task_data.get("description", ""),
                task_order=existing_count + k,
                task_type=task_data.get("task_type", "file_modify"),
                task_data=task_data.get("task_data", {}),
                depends_on=task_data.get("depends_on", []),
            )
            db.add(task)

    await db.commit()

    title = session_data.get("title", "Untitled Plan")
    logger.info(
        f"Created planning session '{title}' with "
        f"{len(created_phases)} phases from chat {chat_id}"
    )
    return planning_session
