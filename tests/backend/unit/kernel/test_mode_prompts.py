"""Tests for mode_prompts — chat mode system prompt modifiers."""

from app.kernel.mode_prompts import get_mode_modifier, MODE_PROMPT_MODIFIERS


class TestGetModeModifier:
    def test_agent_mode_returns_empty(self):
        assert get_mode_modifier("agent") == ""

    def test_suggest_mode_returns_modifier(self):
        modifier = get_mode_modifier("suggest")
        assert "[MODE: Code Suggestions]" in modifier
        assert "NEVER use [ACTION:...]" in modifier

    def test_plan_mode_returns_modifier(self):
        modifier = get_mode_modifier("plan")
        assert "[MODE: Structured Planning]" in modifier
        assert "PLAN:session" in modifier

    def test_ask_mode_returns_modifier(self):
        modifier = get_mode_modifier("ask")
        assert "[MODE: Ask Questions]" in modifier
        assert "never use [action:...]" in modifier.lower().replace("\u2014", "-")

    def test_chat_mode_returns_modifier(self):
        modifier = get_mode_modifier("chat")
        assert "[MODE: Conversational]" in modifier

    def test_unknown_mode_returns_empty(self):
        assert get_mode_modifier("nonexistent") == ""
        assert get_mode_modifier("") == ""

    def test_all_modes_defined(self):
        expected_modes = {"agent", "suggest", "plan", "ask", "chat"}
        assert set(MODE_PROMPT_MODIFIERS.keys()) == expected_modes

    def test_non_agent_modes_have_content(self):
        for mode, content in MODE_PROMPT_MODIFIERS.items():
            if mode == "agent":
                assert content == ""
            else:
                assert len(content) > 0
                assert content.startswith("[MODE:")
