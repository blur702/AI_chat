"""Tests for event_types — event type and severity constants."""

from app.kernel.event_types import (
    ALL_EVENT_TYPES,
    ALL_SEVERITIES,
    INFO,
    WARNING,
    ERROR_SEVERITY,
    CRITICAL,
    MODEL_LOADED,
    KERNEL_STARTUP,
    KERNEL_SHUTDOWN,
    IMAGE_GENERATION_STARTED,
    IMAGE_GENERATION_COMPLETED,
    PLAN_PHASE_STARTED,
)


class TestEventTypeConstants:
    def test_all_event_types_is_list(self):
        assert isinstance(ALL_EVENT_TYPES, list)
        assert len(ALL_EVENT_TYPES) > 0

    def test_all_event_types_are_strings(self):
        for et in ALL_EVENT_TYPES:
            assert isinstance(et, str)

    def test_no_duplicate_event_types(self):
        assert len(ALL_EVENT_TYPES) == len(set(ALL_EVENT_TYPES))

    def test_key_event_types_present(self):
        assert MODEL_LOADED in ALL_EVENT_TYPES
        assert KERNEL_STARTUP in ALL_EVENT_TYPES
        assert KERNEL_SHUTDOWN in ALL_EVENT_TYPES
        assert IMAGE_GENERATION_STARTED in ALL_EVENT_TYPES
        assert IMAGE_GENERATION_COMPLETED in ALL_EVENT_TYPES
        assert PLAN_PHASE_STARTED in ALL_EVENT_TYPES

    def test_event_type_values_are_snake_case(self):
        for et in ALL_EVENT_TYPES:
            assert et == et.lower()
            assert " " not in et


class TestSeverityConstants:
    def test_all_severities_list(self):
        assert isinstance(ALL_SEVERITIES, list)
        assert len(ALL_SEVERITIES) == 4

    def test_severity_values(self):
        assert INFO == "info"
        assert WARNING == "warning"
        assert ERROR_SEVERITY == "error"
        assert CRITICAL == "critical"

    def test_no_duplicate_severities(self):
        assert len(ALL_SEVERITIES) == len(set(ALL_SEVERITIES))

    def test_all_severities_are_strings(self):
        for sev in ALL_SEVERITIES:
            assert isinstance(sev, str)
