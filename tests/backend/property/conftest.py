"""Hypothesis profiles for property-based testing."""

import os

from hypothesis import settings

settings.register_profile("ci", max_examples=50)
settings.register_profile("dev", max_examples=10)
settings.load_profile(os.getenv("HYPOTHESIS_PROFILE", "dev"))
