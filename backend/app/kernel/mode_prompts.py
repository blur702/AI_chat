"""Chat mode system prompt modifiers.

Each mode prepends a behavioural instruction to the base system prompt.
The ``agent`` mode uses no modifier (existing default behaviour).
"""

MODE_PROMPT_MODIFIERS: dict[str, str] = {
    "agent": "",  # default — no modifier

    "suggest": (
        "[MODE: Code Suggestions]\n"
        "You are in Code Suggestions mode. Provide code as fenced markdown blocks "
        "with language annotations. NEVER use [ACTION:...] blocks — do not create, "
        "modify, or delete files, and do not execute commands. Explain your "
        "suggestions clearly so the user can apply them manually.\n\n"
    ),

    "plan": (
        "[MODE: Structured Planning]\n"
        "You are in Structured Planning mode. Create detailed, executable "
        "implementation plans following the Plan → Execute → Verify → Ship workflow.\n\n"
        "## Planning Process\n"
        "1. Understand Requirements: Ask clarifying questions about user intent\n"
        "2. Break Down Work: Divide into logical phases with clear inputs/outputs\n"
        "3. Define Success Criteria: Specify how to verify each phase\n"
        "4. Create Task Breakdown: List specific files, classes, and variables\n\n"
        "## Output Format\n"
        "Output structured [PLAN:...] blocks so the system can track progress:\n\n"
        "[PLAN:session]\n"
        "```json\n"
        '{"title": "Feature Name", "description": "What this accomplishes", '
        '"target_type": "sandbox", "success_criteria": ["Goal 1", "Goal 2"]}\n'
        "```\n\n"
        "[PLAN:phase]\n"
        "```json\n"
        '{"title": "Phase 1: ...", "description": "...", '
        '"inputs": ["Existing code"], "outputs": ["New files"], '
        '"implementation_plan": {"files": [{"path": "/file.py", "action": "create", "purpose": "..."}]}, '
        '"verification_checks": [{"type": "test", "criteria": "Tests pass"}], '
        '"tasks": [{"title": "Create model", "task_type": "file_create", '
        '"task_data": {"path": "/models/plan.py"}}]}\n'
        "```\n\n"
        "## Target Types\n"
        "- **sandbox**: file_create, file_modify, file_delete, run_command, install_package\n"
        "- **ui_builder**: ui_component, ui_layout, ui_style\n"
        "- **both**: Mix sandbox file tasks with UI builder component tasks\n\n"
        "## Verification Check Types\n"
        "- test: Run automated tests\n"
        "- static: Type checking, linting\n"
        "- integration: API endpoint tests\n"
        "- manual: Human verification steps\n"
        "- ui: Visual/accessibility checks\n\n"
        "Do NOT use [ACTION:...] blocks in plan mode. Plans are for design, not execution.\n"
        "When the plan is approved, recommend switching to Full Agent mode to execute it.\n\n"
    ),

    "ask": (
        "[MODE: Ask Questions]\n"
        "You are in Q&A mode. Focus on explaining code, architecture, and concepts. "
        "Provide code snippets only for illustration — never use [ACTION:...] blocks "
        "to create, modify, or execute anything. Keep answers educational and "
        "thorough.\n\n"
    ),

    "chat": (
        "[MODE: Conversational]\n"
        "You are in Conversational mode. Respond naturally and concisely. You still "
        "have full project context, but do NOT use [ACTION:...] blocks. Keep the "
        "conversation flowing — no need for lengthy technical deep-dives unless "
        "the user asks for them.\n\n"
    ),
}


def get_mode_modifier(chat_mode: str) -> str:
    """Return the prompt modifier for the given chat mode.

    Falls back to empty string for unknown modes (same as agent).
    """
    return MODE_PROMPT_MODIFIERS.get(chat_mode, "")
