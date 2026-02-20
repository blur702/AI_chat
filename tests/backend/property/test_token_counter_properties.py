"""Property-based tests for TokenCounter using Hypothesis."""

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.kernel.token_counter import TokenCounter


@pytest.fixture
def tc():
    return TokenCounter()


@pytest.mark.unit
class TestTokenCounterProperties:
    @given(text=st.text(min_size=0, max_size=1000))
    @settings(max_examples=50, deadline=None)
    def test_count_tokens_non_negative(self, text):
        """Token count is always non-negative."""
        tc = TokenCounter()
        assert tc.count_tokens(text) >= 0

    @given(text=st.text(min_size=1, max_size=500))
    @settings(max_examples=50, deadline=None)
    def test_non_empty_text_has_positive_count(self, text):
        """Non-empty text always produces at least 1 token."""
        tc = TokenCounter()
        assert tc.count_tokens(text) >= 1

    @given(text=st.text(min_size=0, max_size=200))
    @settings(max_examples=30, deadline=None)
    def test_count_is_deterministic(self, text):
        """Same text always produces the same token count."""
        tc = TokenCounter()
        assert tc.count_tokens(text) == tc.count_tokens(text)

    @given(
        a=st.text(min_size=1, max_size=200),
        b=st.text(min_size=1, max_size=200),
    )
    @settings(max_examples=30, deadline=None)
    def test_concatenation_bounded(self, a, b):
        """count(a+b) should be roughly bounded by count(a) + count(b).

        Token boundary shifts at the join point can add at most 1 extra token,
        so we allow combined <= separate + 1.
        """
        tc = TokenCounter()
        combined = tc.count_tokens(a + b)
        separate = tc.count_tokens(a) + tc.count_tokens(b)
        assert combined <= separate + 1

    @given(text=st.text(min_size=0, max_size=300))
    @settings(max_examples=30, deadline=None)
    def test_tokenize_spans_cover_input(self, text):
        """Token spans should fully cover the encoded input bytes."""
        tc = TokenCounter()
        spans = tc.tokenize_with_spans(text)
        if not text:
            assert spans == []
        else:
            total_bytes = sum(len(s[1]) for s in spans)
            assert total_bytes == len(text.encode("utf-8"))


@pytest.mark.unit
class TestCountMessagesProperties:
    @given(
        roles=st.lists(
            st.sampled_from(["user", "assistant"]),
            min_size=0, max_size=10,
        ),
        contents=st.lists(
            st.text(min_size=0, max_size=100),
            min_size=0, max_size=10,
        ),
    )
    @settings(max_examples=30, deadline=None)
    def test_message_count_monotonic(self, roles, contents):
        """Adding more messages should increase or maintain token count."""
        tc = TokenCounter()
        n = min(len(roles), len(contents))
        messages = [{"role": roles[i], "content": contents[i]} for i in range(n)]
        if n == 0:
            return
        fewer = tc.count_messages(messages[:n - 1])
        more = tc.count_messages(messages)
        assert more >= fewer
