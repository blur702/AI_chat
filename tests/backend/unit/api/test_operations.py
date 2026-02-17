"""Tests for operations API endpoint dependency helpers."""

from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.api.operations import get_resource_manager


class TestGetResourceManager:
    def test_raises_503_when_no_kernel(self):
        request = MagicMock()
        request.app.state = MagicMock(spec=[])  # no kernel attr
        with pytest.raises(HTTPException) as exc_info:
            get_resource_manager(request)
        assert exc_info.value.status_code == 503
        assert "Kernel not initialized" in exc_info.value.detail

    def test_raises_503_when_no_resource_manager(self):
        request = MagicMock()
        kernel = MagicMock()
        kernel.get_service.return_value = None
        request.app.state.kernel = kernel
        with pytest.raises(HTTPException) as exc_info:
            get_resource_manager(request)
        assert exc_info.value.status_code == 503
        assert "ResourceManager" in exc_info.value.detail

    def test_returns_resource_manager(self):
        request = MagicMock()
        mock_rm = MagicMock()
        kernel = MagicMock()
        kernel.get_service.return_value = mock_rm
        request.app.state.kernel = kernel
        result = get_resource_manager(request)
        assert result is mock_rm
