"""Tests for plan_parser — extracts [PLAN:...] blocks from AI responses."""

import json
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.services.plan_parser import extract_plan_blocks, has_plan_blocks, create_from_blocks


# ---------------------------------------------------------------------------
# extract_plan_blocks
# ---------------------------------------------------------------------------

class TestExtractPlanBlocks:
    def test_extracts_session_block(self):
        content = '''Here is the plan:
[PLAN:session]
```json
{"title": "My Plan", "description": "A great plan"}
```
'''
        blocks = extract_plan_blocks(content)
        assert len(blocks) == 1
        assert blocks[0]["type"] == "session"
        assert blocks[0]["data"]["title"] == "My Plan"

    def test_extracts_multiple_block_types(self):
        content = '''
[PLAN:session]
```json
{"title": "Plan"}
```

[PLAN:phase]
```json
{"title": "Phase 1"}
```

[PLAN:task]
```json
{"title": "Task 1"}
```
'''
        blocks = extract_plan_blocks(content)
        assert len(blocks) == 3
        types = [b["type"] for b in blocks]
        assert types == ["session", "phase", "task"]

    def test_handles_no_plan_blocks(self):
        content = "Just a regular message with no plan blocks."
        blocks = extract_plan_blocks(content)
        assert blocks == []

    def test_handles_invalid_json(self):
        content = '''
[PLAN:session]
```json
{invalid json here}
```
'''
        blocks = extract_plan_blocks(content)
        assert blocks == []

    def test_handles_json_without_language_annotation(self):
        content = '''
[PLAN:session]
```
{"title": "No lang annotation"}
```
'''
        blocks = extract_plan_blocks(content)
        assert len(blocks) == 1
        assert blocks[0]["data"]["title"] == "No lang annotation"

    def test_extracts_complex_phase_data(self):
        phase_data = {
            "title": "Phase 1: Setup",
            "description": "Initial setup",
            "inputs": ["existing code"],
            "outputs": ["new files"],
            "implementation_plan": {"files": [{"path": "/app.py", "action": "create"}]},
            "verification_checks": [{"type": "test", "criteria": "pytest passes"}],
            "tasks": [{"title": "Create model", "task_type": "file_create"}],
        }
        content = f'[PLAN:phase]\n```json\n{json.dumps(phase_data)}\n```'
        blocks = extract_plan_blocks(content)
        assert len(blocks) == 1
        assert blocks[0]["data"]["inputs"] == ["existing code"]
        assert len(blocks[0]["data"]["tasks"]) == 1


# ---------------------------------------------------------------------------
# has_plan_blocks
# ---------------------------------------------------------------------------

class TestHasPlanBlocks:
    def test_returns_true_when_blocks_present(self):
        content = '[PLAN:session]\n```json\n{"title": "x"}\n```'
        assert has_plan_blocks(content) is True

    def test_returns_false_when_no_blocks(self):
        assert has_plan_blocks("Just a regular message") is False

    def test_returns_true_for_any_plan_type(self):
        assert has_plan_blocks('[PLAN:task]\n```\n{"t": 1}\n```') is True
        assert has_plan_blocks('[PLAN:phase]\n```\n{"t": 1}\n```') is True


# ---------------------------------------------------------------------------
# create_from_blocks
# ---------------------------------------------------------------------------

class TestCreateFromBlocks:
    @pytest.mark.asyncio
    async def test_returns_none_without_session_block(self):
        blocks = [{"type": "phase", "data": {"title": "P1"}}]
        db = AsyncMock()
        result = await create_from_blocks(
            blocks, project_id=uuid4(), chat_id=uuid4(), user_id=uuid4(), db=db,
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_creates_session_with_phases_and_tasks(self):
        blocks = [
            {"type": "session", "data": {"title": "My Plan", "description": "desc", "success_criteria": ["done"]}},
            {"type": "phase", "data": {
                "title": "Phase 1",
                "tasks": [{"title": "Task A", "task_type": "file_create"}],
            }},
            {"type": "task", "data": {"title": "Standalone Task"}},
        ]

        db = AsyncMock()
        db.add = MagicMock()
        db.flush = AsyncMock()
        db.commit = AsyncMock()

        with patch("app.services.plan_parser.PlanningSession") as MockSession, \
             patch("app.services.plan_parser.PlanPhase") as MockPhase, \
             patch("app.services.plan_parser.PlanTask") as MockTask:

            mock_session_instance = MagicMock()
            mock_session_instance.id = uuid4()
            MockSession.return_value = mock_session_instance

            mock_phase_instance = MagicMock()
            mock_phase_instance.id = uuid4()
            MockPhase.return_value = mock_phase_instance

            result = await create_from_blocks(
                blocks, project_id=uuid4(), chat_id=uuid4(), user_id=uuid4(), db=db,
            )
            assert result is mock_session_instance
            assert db.add.call_count >= 3  # session + phase + tasks
            db.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_standalone_tasks_attach_to_last_phase(self):
        blocks = [
            {"type": "session", "data": {"title": "Plan"}},
            {"type": "phase", "data": {"title": "Phase 1", "tasks": []}},
            {"type": "phase", "data": {"title": "Phase 2", "tasks": [{"title": "Embedded"}]}},
            {"type": "task", "data": {"title": "Standalone 1"}},
            {"type": "task", "data": {"title": "Standalone 2"}},
        ]

        db = AsyncMock()
        db.add = MagicMock()
        db.flush = AsyncMock()
        db.commit = AsyncMock()

        with patch("app.services.plan_parser.PlanningSession") as MockSession, \
             patch("app.services.plan_parser.PlanPhase") as MockPhase, \
             patch("app.services.plan_parser.PlanTask") as MockTask:

            mock_session = MagicMock(id=uuid4())
            MockSession.return_value = mock_session
            mock_phase = MagicMock(id=uuid4())
            MockPhase.return_value = mock_phase

            await create_from_blocks(
                blocks, project_id=uuid4(), chat_id=uuid4(), user_id=uuid4(), db=db,
            )

            # 1 session + 2 phases + 1 embedded task + 2 standalone tasks = 6
            assert db.add.call_count == 6

    @pytest.mark.asyncio
    async def test_session_with_no_phases(self):
        """Session block alone (no phases) creates just the session."""
        blocks = [{"type": "session", "data": {"title": "Solo Session"}}]

        db = AsyncMock()
        db.add = MagicMock()
        db.flush = AsyncMock()
        db.commit = AsyncMock()

        with patch("app.services.plan_parser.PlanningSession") as MockSession:
            mock_session = MagicMock(id=uuid4())
            MockSession.return_value = mock_session

            result = await create_from_blocks(
                blocks, project_id=uuid4(), chat_id=None, user_id=uuid4(), db=db,
            )
            assert result is mock_session
            # Only session should be added (no phases/tasks)
            assert db.add.call_count == 1
            db.commit.assert_awaited_once()
