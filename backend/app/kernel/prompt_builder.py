"""Centralized prompt builder for assembling LLM messages from user prefs and project context."""

import logging
from typing import Any, Dict, List, Optional, Tuple

from app.kernel.mode_prompts import get_mode_modifier
from app.kernel.token_counter import TokenCounter
from app.schemas.context import TokenBreakdownResponse

logger = logging.getLogger(__name__)

# Use 75% of context window for history to leave room for the response
_CONTEXT_FILL_RATIO = 0.75

_DEFAULT_SYSTEM_PROMPT = """You are an AI development assistant integrated into the AI Workstation platform. You operate within isolated Docker sandbox environments where users write, run, and preview code in real time.

## Capabilities

You can propose the following actions by embedding them in your response. Each action must start on its own line with the format `[ACTION:type]` followed by an optional JSON block:

- **file_create** — Create a new file in the project workspace.
- **file_modify** — Replace the contents of an existing file.
- **file_delete** — Delete a file from the workspace.
- **run_command** — Execute a shell command inside the sandbox container.
- **install_package** — Install a dependency via pip, npm, yarn, or pnpm.

### Action format

```
[ACTION:file_create]
```json
{"path": "/workspace/src/app.py", "content": "print('hello')"}
```

```
[ACTION:run_command]
```json
{"command": "python src/app.py"}
```

Only propose actions when the user's request clearly calls for creating, modifying, or running code. Always explain what each action does before proposing it.

## Environment

- Each project runs in its own isolated Docker container with a `/workspace` directory.
- The sandbox supports Python and Node.js environments with common tooling pre-installed.
- Users can see file changes in the file explorer, run commands via the integrated terminal, and preview web apps through the sandbox preview panel.
- A knowledge base (RAG) may inject relevant project documentation into the conversation automatically.
- Previous conversation history may be summarized via compaction when the context window fills up.

## Guidelines

- Be concise and direct. Provide working code, not pseudocode.
- When modifying existing files, show the complete updated file content rather than partial diffs.
- If the user's intent is ambiguous, ask a clarifying question before proposing changes.
- Respect the project's existing conventions (language, framework, style) when suggesting code.
- When errors occur, diagnose the root cause and suggest a specific fix.
- Do not fabricate file paths or dependencies that don't exist in the project."""


class PromptBuilder:
    """Builds LLM message lists from user preferences and project context.

    Assembles a system prompt from all stored preference fields and
    performs token-aware windowing to fill the context window efficiently.
    """

    def __init__(self, token_counter: TokenCounter) -> None:
        self.token_counter = token_counter

    def build_system_prompt(
        self,
        user_prefs: Dict[str, Any],
        project_context: Dict[str, Any],
        system_prompt_content: Optional[str] = None,
        chat_instructions: Optional[str] = None,
        chat_mode: str = "agent",
        active_plan: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Assemble a system prompt from all stored fields.

        Layered order:
        1. system_prompt_content (from library) or custom_system_prompt or default
        2. coding_principles as numbered list
        3. response_style directives
        4. project custom_context
        5. project important_files list
        6. chat_instructions (per-chat layer)
        7. active_plan context (if a planning session is linked to this chat)
        """
        parts: List[str] = []

        # 1. Base system prompt (library prompt > user pref > default)
        base = (
            system_prompt_content
            or user_prefs.get("custom_system_prompt")
            or _DEFAULT_SYSTEM_PROMPT
        )
        parts.append(base)

        # 2. Coding principles
        principles = user_prefs.get("coding_principles")
        if principles and isinstance(principles, list) and len(principles) > 0:
            numbered = "\n".join(
                f"{i + 1}. {p}" for i, p in enumerate(principles) if p
            )
            if numbered:
                parts.append(f"\n\nCoding Principles:\n{numbered}")

        # 3. Response style
        style = user_prefs.get("response_style")
        if style and isinstance(style, dict):
            directives: List[str] = []
            if style.get("format"):
                directives.append(f"Format: {style['format']}")
            if style.get("verbosity"):
                directives.append(f"Verbosity: {style['verbosity']}")
            if style.get("tone"):
                directives.append(f"Tone: {style['tone']}")
            # Include any other style keys
            for key, value in style.items():
                if key not in ("format", "verbosity", "tone") and value:
                    directives.append(f"{key.replace('_', ' ').title()}: {value}")
            if directives:
                parts.append(
                    "\n\nResponse Style:\n" + "\n".join(f"- {d}" for d in directives)
                )

        # 4. Project custom context
        custom_context = project_context.get("custom_context")
        if custom_context and isinstance(custom_context, str) and custom_context.strip():
            parts.append(f"\n\nProject Context:\n{custom_context.strip()}")

        # 5. Important files
        important_files = project_context.get("important_files")
        if important_files and isinstance(important_files, list) and len(important_files) > 0:
            file_list = "\n".join(f"- {f}" for f in important_files if f)
            if file_list:
                parts.append(f"\n\nImportant Project Files:\n{file_list}")

        # 6. Chat instructions (per-chat layer)
        if chat_instructions and isinstance(chat_instructions, str) and chat_instructions.strip():
            parts.append(f"\n\nChat Instructions:\n{chat_instructions.strip()}")

        # 7. Active plan context
        if active_plan and isinstance(active_plan, dict):
            plan_parts = [f"\n\nActive Plan: {active_plan.get('title', 'Untitled')}"]
            plan_status = active_plan.get("status", "unknown")
            plan_parts.append(f"Status: {plan_status}")
            current_phase = active_plan.get("current_phase")
            if current_phase and isinstance(current_phase, dict):
                plan_parts.append(f"Current Phase: {current_phase.get('title', 'N/A')} ({current_phase.get('status', 'unknown')})")
                outputs = current_phase.get("outputs")
                if outputs and isinstance(outputs, list):
                    plan_parts.append(f"Expected Outputs: {', '.join(outputs)}")
            criteria = active_plan.get("success_criteria")
            if criteria and isinstance(criteria, list):
                plan_parts.append(f"Success Criteria: {'; '.join(criteria)}")
            parts.append("\n".join(plan_parts))

        prompt = "".join(parts)

        # Prepend mode modifier for non-agent modes
        mode_modifier = get_mode_modifier(chat_mode)
        if mode_modifier:
            prompt = mode_modifier + prompt

        logger.debug(
            "Built system prompt: %d chars, %d tokens, mode=%s",
            len(prompt),
            self.token_counter.count_tokens(prompt),
            chat_mode,
        )
        return prompt

    def build_messages(
        self,
        conversation_messages: List[Dict[str, Any]],
        system_prompt: str,
        kb_results: List[Dict[str, Any]],
        compactions: List[Dict[str, Any]],
        model_name: str,
    ) -> Tuple[List[Dict[str, str]], int]:
        """Build the final message list with token-aware windowing.

        Args:
            conversation_messages: Raw messages from conversation state.
            system_prompt: Assembled system prompt.
            kb_results: Knowledge base RAG results.
            compactions: Compaction summaries from conversation.
            model_name: Model name for context window lookup.

        Returns:
            Tuple of (messages list for Ollama, total token count).
        """
        context_window = self.token_counter.estimate_model_context_window(model_name)
        max_history_tokens = int(context_window * _CONTEXT_FILL_RATIO)

        # Start with system prompt
        messages: List[Dict[str, str]] = [
            {"role": "system", "content": system_prompt}
        ]
        token_budget = max_history_tokens - self.token_counter.count_messages(messages)

        # Inject latest compaction summary if available
        if compactions:
            latest_compaction = compactions[-1]
            summary = latest_compaction.get("summary", "")
            if summary and summary != "[Pending compaction — awaiting LLM summarization]":
                compaction_msg = {
                    "role": "system",
                    "content": f"Summary of earlier conversation:\n{summary}",
                }
                compaction_tokens = self.token_counter.count_messages([compaction_msg])
                if compaction_tokens < token_budget:
                    messages.append(compaction_msg)
                    token_budget -= compaction_tokens

        # Inject KB context
        if kb_results:
            valid_kb = [r for r in kb_results if r.get("content")]
            if valid_kb:
                kb_content = "\n\n".join(
                    f"[Knowledge Base Context {i + 1}]\n{r.get('content', '')}"
                    for i, r in enumerate(valid_kb)
                )
                kb_msg = {
                    "role": "system",
                    "content": f"Relevant project knowledge:\n{kb_content}",
                }
                kb_tokens = self.token_counter.count_messages([kb_msg])
                if kb_tokens < token_budget:
                    messages.append(kb_msg)
                    token_budget -= kb_tokens

        # Fill from newest messages backward until we use up to 75% of the window
        eligible = [
            m for m in conversation_messages
            if not m.get("is_excluded", False) and m.get("role") in ("user", "assistant")
        ]

        # Walk backward and collect messages that fit
        selected: List[Dict[str, str]] = []
        for m in reversed(eligible):
            role = m.get("role")
            content = m.get("content")
            if not role or not isinstance(content, str):
                continue
            msg = {"role": role, "content": content}
            msg_tokens = self.token_counter.count_messages([msg])
            if msg_tokens > token_budget:
                break
            selected.append(msg)
            token_budget -= msg_tokens

        # Reverse back to chronological order and append
        selected.reverse()
        messages.extend(selected)

        total_tokens = self.token_counter.count_messages(messages)
        logger.debug(
            "Built %d messages (%d conversation) for model=%s, tokens=%d/%d (%.0f%%)",
            len(messages),
            len(selected),
            model_name,
            total_tokens,
            context_window,
            (total_tokens / context_window * 100) if context_window else 0,
        )
        return messages, total_tokens

    def compute_token_breakdown(
        self,
        user_prefs: Dict[str, Any],
        project_context: Dict[str, Any],
        system_prompt_content: Optional[str],
        chat_instructions: Optional[str],
        messages: List[Dict[str, Any]],
        compactions: List[Dict[str, Any]],
        model_name: str,
        chat_mode: str = "agent",
    ) -> TokenBreakdownResponse:
        """Compute detailed per-layer token counts.

        Uses ``build_system_prompt()`` so the breakdown includes all layers
        (coding principles, response style, section headers) — not just the
        base prompt text.
        """
        tc = self.token_counter

        # Build the REAL assembled system prompt (includes all layers)
        assembled_prompt = self.build_system_prompt(
            user_prefs=user_prefs,
            project_context=project_context,
            system_prompt_content=system_prompt_content,
            chat_instructions=chat_instructions,
            chat_mode=chat_mode,
        )
        assembled_tokens = tc.count_tokens(assembled_prompt)

        # Sub-layer breakdown (for display)
        # Project context tokens
        project_text_parts = []
        custom_context = project_context.get("custom_context")
        if custom_context and isinstance(custom_context, str) and custom_context.strip():
            project_text_parts.append(custom_context.strip())
        important_files = project_context.get("important_files")
        if important_files and isinstance(important_files, list):
            project_text_parts.append("\n".join(f"- {f}" for f in important_files if f))
        project_context_tokens = tc.count_tokens("\n".join(project_text_parts)) if project_text_parts else 0

        # Chat instructions tokens
        chat_instructions_tokens = (
            tc.count_tokens(chat_instructions) if chat_instructions else 0
        )

        # System prompt tokens = assembled total minus the sub-layers counted separately.
        # This intentionally absorbs section header overhead (e.g. "\n\nProject Context:\n")
        # into the system_prompt bucket so the sub-fields still sum to assembled_tokens.
        system_prompt_tokens = assembled_tokens - project_context_tokens - chat_instructions_tokens

        # Compaction summary
        compaction_summary_tokens = 0
        if compactions:
            latest = compactions[-1]
            summary = latest.get("summary", "")
            if summary and summary != "[Pending compaction — awaiting LLM summarization]":
                compaction_summary_tokens = tc.count_tokens(summary)

        # Conversation messages
        active_msgs = [
            m for m in messages
            if not m.get("is_excluded", False) and m.get("role") in ("user", "assistant")
        ]
        conversation_tokens = tc.count_messages(
            [{"role": m.get("role", ""), "content": m.get("content", "")} for m in active_msgs]
        )

        total = assembled_tokens + compaction_summary_tokens + conversation_tokens

        context_window = tc.estimate_model_context_window(model_name)
        fill_ratio = total / context_window if context_window > 0 else 0.0

        excluded_count = sum(1 for m in messages if m.get("is_excluded", False))
        pinned_count = sum(1 for m in messages if m.get("is_pinned", False))

        return TokenBreakdownResponse(
            system_prompt_tokens=system_prompt_tokens,
            project_context_tokens=project_context_tokens,
            chat_instructions_tokens=chat_instructions_tokens,
            kb_results_tokens=0,
            compaction_summary_tokens=compaction_summary_tokens,
            conversation_tokens=conversation_tokens,
            total=total,
            context_window=context_window,
            fill_ratio=round(fill_ratio, 4),
            message_count=len(active_msgs),
            excluded_count=excluded_count,
            pinned_count=pinned_count,
        )
