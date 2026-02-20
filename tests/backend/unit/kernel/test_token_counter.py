"""Tests for TokenCounter kernel service."""

import pytest

from app.kernel.token_counter import TokenCounter, _MODEL_CONTEXT_WINDOWS


class TestTokenCounterInit:
    def test_default_encoding(self):
        tc = TokenCounter()
        assert tc._encoding_name == "cl100k_base"
        assert tc._encoding is not None

    def test_name_property(self):
        tc = TokenCounter()
        assert tc.name == "token_counter"

    def test_not_running_initially(self):
        tc = TokenCounter()
        assert tc.is_running is False


class TestTokenCounterLifecycle:
    @pytest.mark.asyncio
    async def test_startup_sets_running(self):
        tc = TokenCounter()
        await tc.startup()
        assert tc.is_running is True

    @pytest.mark.asyncio
    async def test_startup_idempotent(self):
        tc = TokenCounter()
        await tc.startup()
        await tc.startup()
        assert tc.is_running is True

    @pytest.mark.asyncio
    async def test_shutdown_clears_running(self):
        tc = TokenCounter()
        await tc.startup()
        await tc.shutdown()
        assert tc.is_running is False


class TestTokenCounterHealthCheck:
    @pytest.mark.asyncio
    async def test_healthy_when_running(self):
        tc = TokenCounter()
        await tc.startup()
        healthy, msg = await tc.health_check()
        assert healthy is True
        assert msg == "ok"
        await tc.shutdown()

    @pytest.mark.asyncio
    async def test_unhealthy_when_not_running(self):
        tc = TokenCounter()
        healthy, msg = await tc.health_check()
        assert healthy is False
        assert "not running" in msg


class TestCountTokens:
    def test_counts_simple_text(self):
        tc = TokenCounter()
        count = tc.count_tokens("Hello, world!")
        assert count > 0
        assert isinstance(count, int)

    def test_empty_string_returns_zero(self):
        tc = TokenCounter()
        assert tc.count_tokens("") == 0

    def test_longer_text_has_more_tokens(self):
        tc = TokenCounter()
        short = tc.count_tokens("Hello")
        long = tc.count_tokens("Hello, this is a much longer text with many more words")
        assert long > short

    def test_consistent_results(self):
        tc = TokenCounter()
        text = "The quick brown fox jumps over the lazy dog"
        assert tc.count_tokens(text) == tc.count_tokens(text)


class TestCountMessages:
    def test_single_message(self):
        tc = TokenCounter()
        messages = [{"role": "user", "content": "Hello!"}]
        count = tc.count_messages(messages)
        assert count > 0

    def test_empty_messages(self):
        tc = TokenCounter()
        count = tc.count_messages([])
        # Should still have the 2-token reply priming
        assert count == 2

    def test_multiple_messages_more_tokens(self):
        tc = TokenCounter()
        one_msg = tc.count_messages([{"role": "user", "content": "Hi"}])
        two_msgs = tc.count_messages([
            {"role": "user", "content": "Hi"},
            {"role": "assistant", "content": "Hello!"},
        ])
        assert two_msgs > one_msg

    def test_includes_overhead_per_message(self):
        tc = TokenCounter()
        # Each message adds ~4 tokens overhead
        base = tc.count_messages([])
        with_msg = tc.count_messages([{"role": "user", "content": ""}])
        # overhead should be at least 4 (for role + delimiters) + role tokens
        assert with_msg > base

    def test_handles_missing_fields(self):
        tc = TokenCounter()
        messages = [{"role": "user"}]  # missing content
        count = tc.count_messages(messages)
        assert count > 0  # Should not crash


class TestTokenizeWithSpans:
    def test_returns_spans_for_text(self):
        tc = TokenCounter()
        spans = tc.tokenize_with_spans("Hello world")
        assert len(spans) > 0
        for token_id, token_bytes, start, end in spans:
            assert isinstance(token_id, int)
            assert isinstance(token_bytes, bytes)
            assert start < end

    def test_empty_string_returns_empty(self):
        tc = TokenCounter()
        assert tc.tokenize_with_spans("") == []

    def test_spans_cover_entire_text(self):
        tc = TokenCounter()
        text = "Hello world"
        spans = tc.tokenize_with_spans(text)
        # Last span's end should cover the encoded length
        if spans:
            total_bytes = sum(len(s[1]) for s in spans)
            assert total_bytes == len(text.encode("utf-8"))


class TestEstimateModelContextWindow:
    def test_known_model_exact_match(self):
        tc = TokenCounter()
        assert tc.estimate_model_context_window("llama3") == 8192
        assert tc.estimate_model_context_window("mistral") == 32768

    def test_known_model_prefix_match(self):
        tc = TokenCounter()
        assert tc.estimate_model_context_window("llama3.2-vision") == 131072

    def test_model_with_tag(self):
        tc = TokenCounter()
        # "llama3:latest" should strip tag and match "llama3"
        assert tc.estimate_model_context_window("llama3:latest") == 8192

    def test_unknown_model_returns_default(self):
        tc = TokenCounter()
        assert tc.estimate_model_context_window("unknown-model-xyz") == 8192

    def test_empty_model_returns_default(self):
        tc = TokenCounter()
        assert tc.estimate_model_context_window("") == 8192

    def test_case_insensitive(self):
        tc = TokenCounter()
        assert tc.estimate_model_context_window("Mistral") == 32768

    def test_all_known_models_have_entries(self):
        tc = TokenCounter()
        for model_name, window in _MODEL_CONTEXT_WINDOWS.items():
            assert tc.estimate_model_context_window(model_name) == window
