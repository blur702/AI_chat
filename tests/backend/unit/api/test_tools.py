"""Tests for tools API endpoint dependency helpers."""

from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.api.tools import get_tool_registry


class TestGetToolRegistry:
    def test_raises_503_when_no_kernel(self):
        request = MagicMock()
        request.app.state = MagicMock(spec=[])  # no kernel attr
        with pytest.raises(HTTPException) as exc_info:
            get_tool_registry(request)
        assert exc_info.value.status_code == 503
        assert "Kernel not initialized" in exc_info.value.detail

    def test_raises_503_when_no_tool_registry(self):
        request = MagicMock()
        kernel = MagicMock()
        kernel.get_service.return_value = None
        request.app.state.kernel = kernel
        with pytest.raises(HTTPException) as exc_info:
            get_tool_registry(request)
        assert exc_info.value.status_code == 503
        assert "ToolRegistry" in exc_info.value.detail

    def test_returns_tool_registry(self):
        request = MagicMock()
        mock_tr = MagicMock()
        kernel = MagicMock()
        kernel.get_service.return_value = mock_tr
        request.app.state.kernel = kernel
        result = get_tool_registry(request)
        assert result is mock_tr
