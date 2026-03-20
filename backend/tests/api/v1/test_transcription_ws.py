"""Tests for live STT WebSocket proxy endpoint (LIVE-STT-01).

Tests cover the authentication rejection cases at the WS handshake stage,
before any ElevenLabs connection is attempted. No external calls are made.

Routes under test:
    WS /api/v1/ai/transcribe/stream

Auth:
    - Missing token query param -> server closes the WS after accepting
    - Invalid/expired JWT token -> server closes the WS after accepting

These tests use the Starlette TestClient's websocket_connect() which
exercises the ASGI layer without a live server.

The FastAPI WebSocket pattern is: accept() first, then validate, then close().
This means the client-side connect() call succeeds, but the server immediately
closes the socket with a 4001 close code. The test verifies the connection is
closed promptly without sending any application messages.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from pilot_space.main import app

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Fake JWT-like token for testing (not a real credential)
_FAKE_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJpbnZhbGlkIn0.bad_signature"  # pragma: allowlist secret


def _make_invalid_token() -> str:
    """Return a plausible-looking but invalid JWT string."""
    return _FAKE_TOKEN


# ---------------------------------------------------------------------------
# Test: missing token — server closes immediately after accept
# ---------------------------------------------------------------------------


def test_transcribe_stream_missing_token_closes_immediately() -> None:
    """WS connection without a token query param must be closed immediately.

    The server accepts the connection (per WS protocol) then sends a close
    frame with code 4001. Attempting to receive data raises WebSocketDisconnect.
    """
    with (
        TestClient(app) as client,
        client.websocket_connect("/api/v1/ai/transcribe/stream") as ws,
        pytest.raises(WebSocketDisconnect) as exc_info,
    ):
        # Server closed immediately; any receive triggers disconnect
        ws.receive_text()

    assert exc_info.value.code == 4001, (
        f"Expected close code 4001 (Unauthorized), got {exc_info.value.code}"
    )


# ---------------------------------------------------------------------------
# Test: invalid JWT token — server closes with 4001
# ---------------------------------------------------------------------------


def test_transcribe_stream_invalid_token_closes_4001() -> None:
    """WS connection with a malformed/invalid JWT must be closed with 4001."""
    from pilot_space.dependencies.jwt_providers import JWTValidationError

    invalid_token = _make_invalid_token()

    mock_provider = MagicMock()
    mock_provider.verify_token.side_effect = JWTValidationError("Invalid token")

    with (
        patch(
            "pilot_space.dependencies.auth._get_jwt_provider",
            return_value=mock_provider,
        ),
        TestClient(app) as client,
    ):
        with (
            client.websocket_connect(
                f"/api/v1/ai/transcribe/stream"
                f"?token={invalid_token}"
                f"&workspace_id=00000000-0000-0000-0000-000000000001"
            ) as ws,
            pytest.raises(WebSocketDisconnect) as exc_info,
        ):
            ws.receive_text()

        assert exc_info.value.code == 4001, (
            f"Expected close code 4001 (Unauthorized), got {exc_info.value.code}"
        )


# ---------------------------------------------------------------------------
# Test: expired JWT token — server closes with 4001
# ---------------------------------------------------------------------------


def test_transcribe_stream_expired_token_closes_4001() -> None:
    """WS connection with an expired JWT must be closed with 4001."""
    from pilot_space.dependencies.jwt_providers import JWTExpiredError

    expired_token = _make_invalid_token()

    mock_provider = MagicMock()
    mock_provider.verify_token.side_effect = JWTExpiredError("Token expired")

    with (
        patch(
            "pilot_space.dependencies.auth._get_jwt_provider",
            return_value=mock_provider,
        ),
        TestClient(app) as client,
    ):
        with (
            client.websocket_connect(
                f"/api/v1/ai/transcribe/stream"
                f"?token={expired_token}"
                f"&workspace_id=00000000-0000-0000-0000-000000000001"
            ) as ws,
            pytest.raises(WebSocketDisconnect) as exc_info,
        ):
            ws.receive_text()

        assert exc_info.value.code == 4001, (
            f"Expected close code 4001 (Unauthorized), got {exc_info.value.code}"
        )
