"""Property-based tests for plan_parser using Hypothesis."""

import json

import pytest
from hypothesis import given, settings, assume
from hypothesis import strategies as st

from app.services.plan_parser import extract_plan_blocks, has_plan_blocks


# Strategies
_plan_types = st.sampled_from(["session", "phase", "task"])
_safe_text = st.text(
    alphabet=st.characters(whitelist_categories=("L", "N", "P", "S", "Z")),
    min_size=0,
    max_size=200,
)
_json_object = st.fixed_dictionaries({
    "title": _safe_text.filter(lambda s: s.strip()),
}).map(lambda d: {k: v for k, v in d.items() if v})


@pytest.mark.unit
class TestExtractPlanBlocksProperties:
    @given(plan_type=_plan_types, data=_json_object)
    @settings(max_examples=30)
    def test_valid_plan_block_always_extracted(self, plan_type, data):
        """Any well-formed [PLAN:type] with valid JSON is extracted."""
        json_str = json.dumps(data)
        content = f"[PLAN:{plan_type}]\n```json\n{json_str}\n```"
        blocks = extract_plan_blocks(content)
        assert len(blocks) == 1
        assert blocks[0]["type"] == plan_type
        assert blocks[0]["data"] == data

    @given(text=st.text(min_size=0, max_size=500))
    @settings(max_examples=30)
    def test_no_false_positives_on_random_text(self, text):
        """Random text without [PLAN:...] format should not yield blocks."""
        assume("[PLAN:" not in text)
        blocks = extract_plan_blocks(text)
        assert blocks == []

    @given(plan_type=_plan_types, data=_json_object)
    @settings(max_examples=20)
    def test_has_plan_blocks_consistent_with_extract(self, plan_type, data):
        """has_plan_blocks returns True iff extract returns non-empty."""
        json_str = json.dumps(data)
        content = f"[PLAN:{plan_type}]\n```json\n{json_str}\n```"
        assert has_plan_blocks(content) == (len(extract_plan_blocks(content)) > 0)


@pytest.mark.unit
class TestExtractPlanBlocksEdgeCases:
    @given(count=st.integers(min_value=1, max_value=5))
    @settings(max_examples=10)
    def test_multiple_blocks_all_extracted(self, count):
        """Multiple blocks in one message are all extracted."""
        parts = []
        for i in range(count):
            data = json.dumps({"title": f"Item {i}"})
            parts.append(f'[PLAN:session]\n```json\n{data}\n```')
        content = "\n\n".join(parts)
        blocks = extract_plan_blocks(content)
        assert len(blocks) == count

    def test_invalid_json_skipped_but_valid_extracted(self):
        """If one block has invalid JSON, it's skipped but others still work."""
        content = '''
[PLAN:session]
```json
{"title": "Good"}
```

[PLAN:phase]
```json
{bad json}
```

[PLAN:task]
```json
{"title": "Also Good"}
```
'''
        blocks = extract_plan_blocks(content)
        assert len(blocks) == 2
        assert blocks[0]["type"] == "session"
        assert blocks[1]["type"] == "task"
