"""Module-level constants for sandbox management."""

import os

SANDBOX_IMAGE = os.getenv("SANDBOX_IMAGE", "python:3.12-slim")
SANDBOX_NETWORK = "workstation-preview-network"
SANDBOX_IDLE_TIMEOUT = int(os.getenv("SANDBOX_IDLE_TIMEOUT", "3600"))
SANDBOX_MEMORY_LIMIT = os.getenv("SANDBOX_MEMORY_LIMIT", "512m")
SANDBOX_CPU_QUOTA = int(os.getenv("SANDBOX_CPU_QUOTA", "50000"))
COMMAND_TIMEOUT = int(os.getenv("SANDBOX_COMMAND_TIMEOUT", "300"))
CREATION_FAILURE_COOLDOWN = int(os.getenv("SANDBOX_CREATION_FAILURE_COOLDOWN", "30"))
EXPORTED_IMAGE_TRACKING_MAX = int(os.getenv("SANDBOX_EXPORTED_IMAGES_MAX", "1000"))
