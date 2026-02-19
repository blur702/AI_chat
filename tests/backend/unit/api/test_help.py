"""Unit tests for help API ranking and feedback helpers."""

from types import SimpleNamespace
from uuid import uuid4

from app.api.help import (
    _expand_query_terms,
    _feedback_summary_from_counts,
    _lexical_score,
)


class TestExpandQueryTerms:
    def test_adds_synonyms_for_known_terms(self):
        terms = _expand_query_terms("login 401")
        assert "login" in terms
        assert "auth" in terms
        assert "token" in terms

    def test_returns_compact_tokens_for_unknown_input(self):
        terms = _expand_query_terms("palette gradient")
        assert "palette" in terms
        assert "gradient" in terms


class TestLexicalScore:
    def test_title_matches_score_higher_than_body_only(self):
        title_match_topic = SimpleNamespace(
            title="Login Troubleshooting",
            body="General operational notes",
            tags=["auth"],
        )
        body_match_topic = SimpleNamespace(
            title="Troubleshooting",
            body="Use login and token refresh flows",
            tags=[],
        )
        terms = ["login", "token"]

        title_score = _lexical_score(title_match_topic, terms, "login token")
        body_score = _lexical_score(body_match_topic, terms, "login token")

        assert title_score > body_score

    def test_score_is_bounded_to_zero_one(self):
        topic = SimpleNamespace(title="A", body="B", tags=[])
        score = _lexical_score(topic, ["x"], "x")
        assert 0.0 <= score <= 1.0


class TestFeedbackSummary:
    def test_builds_ratio_from_counts(self):
        topic_id = uuid4()
        summary = _feedback_summary_from_counts(topic_id, helpful_count=3, unhelpful_count=1)
        assert summary.topic_id == str(topic_id)
        assert summary.total_feedback_count == 4
        assert summary.helpful_ratio == 0.75

    def test_ratio_is_none_when_no_votes(self):
        topic_id = uuid4()
        summary = _feedback_summary_from_counts(topic_id, helpful_count=0, unhelpful_count=0)
        assert summary.total_feedback_count == 0
        assert summary.helpful_ratio is None

