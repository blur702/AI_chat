"""Tests for PromptBuilder — system prompt assembly and token-aware windowing."""

import pytest

from app.kernel.prompt_builder import PromptBuilder, _DEFAULT_SYSTEM_PROMPT
from app.kernel.token_counter import TokenCounter


@pytest.fixture
def builder():
    return PromptBuilder(TokenCounter())


class TestBuildSystemPrompt:
    def test_default_prompt_when_no_overrides(self, builder):
        prompt = builder.build_system_prompt(
            user_prefs={}, project_context={},
        )
        assert _DEFAULT_SYSTEM_PROMPT in prompt

    def test_custom_system_prompt_overrides_default(self, builder):
        prompt = builder.build_system_prompt(
            user_prefs={"custom_system_prompt": "You are a custom bot."},
            project_context={},
        )
        assert "custom bot" in prompt
        assert _DEFAULT_SYSTEM_PROMPT not in prompt

    def test_library_prompt_overrides_custom(self, builder):
        prompt = builder.build_system_prompt(
            user_prefs={"custom_system_prompt": "custom"},
            project_context={},
            system_prompt_content="Library prompt",
        )
        assert "Library prompt" in prompt
        assert "custom" not in prompt

    def test_coding_principles_numbered(self, builder):
        prompt = builder.build_system_prompt(
            user_prefs={"coding_principles": ["DRY", "KISS", "YAGNI"]},
            project_context={},
        )
        assert "1. DRY" in prompt
        assert "2. KISS" in prompt
        assert "3. YAGNI" in prompt
        assert "Coding Principles:" in prompt

    def test_empty_principles_skipped(self, builder):
        prompt = builder.build_system_prompt(
            user_prefs={"coding_principles": []},
            project_context={},
        )
        assert "Coding Principles:" not in prompt

    def test_response_style(self, builder):
        prompt = builder.build_system_prompt(
            user_prefs={"response_style": {"format": "markdown", "verbosity": "concise", "tone": "professional"}},
            project_context={},
        )
        assert "Format: markdown" in prompt
        assert "Verbosity: concise" in prompt
        assert "Tone: professional" in prompt

    def test_project_context_included(self, builder):
        prompt = builder.build_system_prompt(
            user_prefs={},
            project_context={"custom_context": "This is a FastAPI project using PostgreSQL."},
        )
        assert "Project Context:" in prompt
        assert "FastAPI project" in prompt

    def test_important_files_listed(self, builder):
        prompt = builder.build_system_prompt(
            user_prefs={},
            project_context={"important_files": ["src/main.py", "tests/conftest.py"]},
        )
        assert "Important Project Files:" in prompt
        assert "- src/main.py" in prompt

    def test_chat_instructions_appended(self, builder):
        prompt = builder.build_system_prompt(
            user_prefs={}, project_context={},
            chat_instructions="Focus on TypeScript only.",
        )
        assert "Chat Instructions:" in prompt
        assert "TypeScript only" in prompt

    def test_active_plan_context(self, builder):
        prompt = builder.build_system_prompt(
            user_prefs={}, project_context={},
            active_plan={
                "title": "Build Auth",
                "status": "active",
                "current_phase": {"title": "Phase 1", "status": "in_progress", "outputs": ["auth.py"]},
                "success_criteria": ["Tests pass", "Auth works"],
            },
        )
        assert "Active Plan: Build Auth" in prompt
        assert "Status: active" in prompt
        assert "Current Phase: Phase 1" in prompt
        assert "Expected Outputs: auth.py" in prompt
        assert "Success Criteria: Tests pass; Auth works" in prompt

    def test_mode_modifier_prepended(self, builder):
        prompt = builder.build_system_prompt(
            user_prefs={}, project_context={},
            chat_mode="suggest",
        )
        assert prompt.startswith("[MODE: Code Suggestions]")

    def test_agent_mode_no_modifier(self, builder):
        prompt = builder.build_system_prompt(
            user_prefs={}, project_context={},
            chat_mode="agent",
        )
        assert not prompt.startswith("[MODE:")

    def test_unknown_mode_no_modifier(self, builder):
        prompt = builder.build_system_prompt(
            user_prefs={}, project_context={},
            chat_mode="nonexistent",
        )
        assert not prompt.startswith("[MODE:")


class TestBuildMessages:
    def test_basic_message_build(self, builder):
        system_prompt = "You are a bot."
        messages = [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi there!"},
        ]
        result, total = builder.build_messages(
            messages, system_prompt, kb_results=[], compactions=[], model_name="llama3",
        )
        assert result[0]["role"] == "system"
        assert result[0]["content"] == system_prompt
        assert len(result) >= 2
        assert total > 0

    def test_excluded_messages_filtered(self, builder):
        messages = [
            {"role": "user", "content": "Hello", "is_excluded": False},
            {"role": "user", "content": "Excluded", "is_excluded": True},
            {"role": "assistant", "content": "Reply"},
        ]
        result, _ = builder.build_messages(
            messages, "System", kb_results=[], compactions=[], model_name="llama3",
        )
        contents = [m["content"] for m in result]
        assert "Excluded" not in contents

    def test_compaction_summary_injected(self, builder):
        compactions = [{"summary": "Earlier we discussed Python."}]
        result, _ = builder.build_messages(
            [], "System", kb_results=[], compactions=compactions, model_name="llama3",
        )
        has_compaction = any("Summary of earlier conversation" in m["content"] for m in result)
        assert has_compaction

    def test_pending_compaction_skipped(self, builder):
        compactions = [{"summary": "[Pending compaction — awaiting LLM summarization]"}]
        result, _ = builder.build_messages(
            [], "System", kb_results=[], compactions=compactions, model_name="llama3",
        )
        has_pending = any("Pending compaction" in m["content"] for m in result)
        assert not has_pending

    def test_kb_results_injected(self, builder):
        kb = [{"content": "FastAPI is a Python framework."}, {"content": "Use uvicorn to run."}]
        result, _ = builder.build_messages(
            [], "System", kb_results=kb, compactions=[], model_name="llama3",
        )
        has_kb = any("Knowledge Base Context" in m["content"] for m in result)
        assert has_kb

    def test_empty_kb_content_filtered(self, builder):
        kb = [{"content": ""}, {"content": None}]
        result, _ = builder.build_messages(
            [], "System", kb_results=kb, compactions=[], model_name="llama3",
        )
        has_kb = any("Knowledge Base Context" in m.get("content", "") for m in result)
        assert not has_kb

    def test_token_windowing_drops_old_messages(self, builder):
        """With a small context model, old messages should be dropped."""
        messages = [
            {"role": "user", "content": "A" * 1000}
            for _ in range(100)
        ]
        result, total = builder.build_messages(
            messages, "System", kb_results=[], compactions=[], model_name="phi",
        )
        # phi has 2048 context — should not include all 100 messages
        assert len(result) < 100

    def test_preserves_chronological_order(self, builder):
        messages = [
            {"role": "user", "content": "First"},
            {"role": "assistant", "content": "Second"},
            {"role": "user", "content": "Third"},
        ]
        result, _ = builder.build_messages(
            messages, "Sys", kb_results=[], compactions=[], model_name="llama3",
        )
        user_msgs = [m for m in result if m["role"] == "user"]
        if len(user_msgs) >= 2:
            assert user_msgs[0]["content"] == "First"


class TestComputeTokenBreakdown:
    def test_returns_breakdown_response(self, builder):
        result = builder.compute_token_breakdown(
            user_prefs={},
            project_context={},
            system_prompt_content=None,
            chat_instructions=None,
            messages=[],
            compactions=[],
            model_name="llama3",
        )
        assert result.total > 0
        assert result.context_window == 8192
        assert result.fill_ratio >= 0
        assert result.message_count == 0

    def test_breakdown_with_all_layers(self, builder):
        result = builder.compute_token_breakdown(
            user_prefs={
                "coding_principles": ["DRY"],
                "response_style": {"format": "markdown"},
            },
            project_context={
                "custom_context": "Project context here",
                "important_files": ["main.py"],
            },
            system_prompt_content="Custom base prompt",
            chat_instructions="Focus on tests",
            messages=[
                {"role": "user", "content": "Hello"},
                {"role": "assistant", "content": "Hi"},
            ],
            compactions=[{"summary": "Earlier discussion"}],
            model_name="mistral",
        )
        assert result.system_prompt_tokens > 0
        assert result.project_context_tokens > 0
        assert result.chat_instructions_tokens > 0
        assert result.conversation_tokens > 0
        assert result.compaction_summary_tokens > 0
        assert result.context_window == 32768

    def test_excluded_and_pinned_counts(self, builder):
        result = builder.compute_token_breakdown(
            user_prefs={}, project_context={},
            system_prompt_content=None, chat_instructions=None,
            messages=[
                {"role": "user", "content": "A", "is_excluded": True},
                {"role": "user", "content": "B", "is_pinned": True},
                {"role": "assistant", "content": "C"},
            ],
            compactions=[], model_name="llama3",
        )
        assert result.excluded_count == 1
        assert result.pinned_count == 1
