"""Live speech-to-text WebSocket proxy using ElevenLabs Scribe v2 Realtime.

Proxies audio from the browser to ElevenLabs Scribe v2 Realtime via a
server-side WebSocket connection, forwarding partial and committed transcripts
back to the browser in real-time.

Architecture:
    Browser --WS--> FastAPI --WS--> ElevenLabs Scribe Realtime
    Browser <--WS-- FastAPI <--WS-- ElevenLabs

Auth: JWT is passed as a query parameter (browsers cannot set WS headers).
BYOK: ElevenLabs API key is retrieved server-side and never sent to the browser.

Routes:
    WS /ai/transcribe/stream  — Stream audio to ElevenLabs Scribe Realtime

Feature: Live voice-to-text input for AI Chat (LIVE-STT-01)
"""

from __future__ import annotations

import asyncio
import json
from contextlib import suppress
from typing import Any
from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import exists, select

from pilot_space.infrastructure.logging import get_logger

logger = get_logger(__name__)

router = APIRouter(tags=["ai", "transcription"])

# ElevenLabs Scribe v2 Realtime WebSocket URL
_ELEVENLABS_REALTIME_URL = (
    "wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime"
)

# WebSocket close codes
_WS_CLOSE_UNAUTHORIZED = 4001
_WS_CLOSE_FORBIDDEN = 4003
_WS_CLOSE_KEY_NOT_CONFIGURED = 4022


async def _browser_to_elevenlabs(
    ws_browser: WebSocket,
    ws_elevenlabs: Any,
) -> None:
    """Forward audio chunks from browser WebSocket to ElevenLabs.

    Reads JSON messages from the browser, validates they are input_audio_chunk
    messages, and forwards them to ElevenLabs. Stops when a commit message is
    received or when the browser disconnects.

    Args:
        ws_browser: The browser WebSocket connection.
        ws_elevenlabs: The ElevenLabs WebSocket connection.
    """
    try:
        while True:
            try:
                raw = await ws_browser.receive_text()
            except WebSocketDisconnect:
                break
            except Exception:
                break

            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                logger.warning("transcription_ws_invalid_json", raw=raw[:100])
                continue

            if msg.get("message_type") != "input_audio_chunk":
                logger.warning(
                    "transcription_ws_unexpected_message_type",
                    message_type=msg.get("message_type"),
                )
                continue

            await ws_elevenlabs.send(json.dumps(msg))

            if msg.get("commit") is True:
                break
    except Exception as exc:
        logger.warning("transcription_ws_browser_to_elevenlabs_error", error=str(exc))


async def _elevenlabs_to_browser(
    ws_elevenlabs: Any,
    ws_browser: WebSocket,
) -> None:
    """Forward transcript events from ElevenLabs to the browser.

    Reads messages from ElevenLabs, parses them, and forwards
    partial_transcript and committed_transcript events to the browser as
    normalized ``{ type, text }`` messages. Stops when a committed_transcript
    is received (end of stream).

    Args:
        ws_elevenlabs: The ElevenLabs WebSocket connection.
        ws_browser: The browser WebSocket connection.
    """
    try:
        async for raw in ws_elevenlabs:
            try:
                msg = json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                continue

            msg_type = msg.get("type") or msg.get("message_type", "")

            if msg_type == "partial_transcript":
                text = msg.get("text", "")
                await ws_browser.send_text(json.dumps({"type": "partial", "text": text}))

            elif msg_type == "committed_transcript":
                text = msg.get("text", "")
                await ws_browser.send_text(json.dumps({"type": "committed", "text": text}))
                break

            # session_started and other messages are silently ignored

    except Exception as exc:
        logger.warning("transcription_ws_elevenlabs_to_browser_error", error=str(exc))


@router.websocket("/transcribe/stream")
async def transcribe_stream(
    websocket: WebSocket,
    token: str | None = None,
    workspace_id: str | None = None,
) -> None:
    """Stream audio to ElevenLabs Scribe v2 Realtime and return live transcripts.

    Accepts a WebSocket connection from the browser, authenticates the user via
    JWT query parameter, verifies workspace membership, retrieves the BYOK
    ElevenLabs API key, and proxies the audio stream to ElevenLabs Scribe.

    Query Params:
        token: JWT Bearer token (required — browsers cannot set WS headers).
        workspace_id: Workspace UUID (required for membership check and key lookup).

    Browser sends:
        { message_type: "input_audio_chunk", audio_base_64: "...", commit: false, sample_rate: 16000 }
        { message_type: "input_audio_chunk", audio_base_64: "", commit: true, sample_rate: 16000 }

    Browser receives:
        { type: "partial", text: "..." }
        { type: "committed", text: "..." }
        { type: "error", message: "..." }

    Close codes:
        4001: Authentication failed (missing/invalid/expired token)
        4003: Not a member of the specified workspace
        4022: ElevenLabs API key not configured
    """
    await websocket.accept()

    # ------------------------------------------------------------------ Auth
    if not token:
        logger.warning("transcription_ws_missing_token")
        await websocket.close(code=_WS_CLOSE_UNAUTHORIZED, reason="Unauthorized")
        return

    from pilot_space.dependencies.auth import (
        _get_jwt_provider,  # pyright: ignore[reportPrivateUsage]
    )
    from pilot_space.dependencies.jwt_providers import (
        JWTExpiredError,
        JWTValidationError,
    )

    try:
        payload = _get_jwt_provider().verify_token(token)
    except (JWTExpiredError, JWTValidationError) as exc:
        logger.warning("transcription_ws_invalid_token", error=str(exc))
        await websocket.close(code=_WS_CLOSE_UNAUTHORIZED, reason="Unauthorized")
        return

    user_id: UUID = payload.user_id

    # -------------------------------------------------------- Workspace check
    if not workspace_id:
        logger.warning("transcription_ws_missing_workspace_id", user_id=str(user_id))
        await websocket.close(code=_WS_CLOSE_FORBIDDEN, reason="workspace_id required")
        return

    try:
        ws_uuid = UUID(workspace_id)
    except ValueError:
        logger.warning(
            "transcription_ws_invalid_workspace_id",
            workspace_id=workspace_id,
            user_id=str(user_id),
        )
        await websocket.close(code=_WS_CLOSE_FORBIDDEN, reason="Invalid workspace_id")
        return

    from pilot_space.infrastructure.database.engine import get_db_session
    from pilot_space.infrastructure.database.models.workspace_member import WorkspaceMember
    from pilot_space.infrastructure.database.rls import set_rls_context

    async with get_db_session() as session:
        await set_rls_context(session, user_id, ws_uuid)
        is_member = (
            await session.execute(
                select(
                    exists().where(
                        WorkspaceMember.workspace_id == ws_uuid,
                        WorkspaceMember.user_id == user_id,
                        WorkspaceMember.is_deleted == False,  # noqa: E712
                    )
                )
            )
        ).scalar()

        if not is_member:
            logger.warning(
                "transcription_ws_not_member",
                user_id=str(user_id),
                workspace_id=str(ws_uuid),
            )
            await websocket.close(code=_WS_CLOSE_FORBIDDEN, reason="Not a member")
            return

        # --------------------------------------------------------- Key retrieval
        from pilot_space.ai.infrastructure.key_storage import SecureKeyStorage
        from pilot_space.config import get_settings

        settings = get_settings()
        key_storage = SecureKeyStorage(
            db=session,
            master_secret=settings.encryption_key.get_secret_value(),
        )
        api_key = await key_storage.get_api_key(ws_uuid, "elevenlabs", "stt")

    if not api_key:
        logger.warning(
            "transcription_ws_key_not_configured",
            user_id=str(user_id),
            workspace_id=str(ws_uuid),
        )
        await websocket.close(
            code=_WS_CLOSE_KEY_NOT_CONFIGURED, reason="ElevenLabs API key not configured"
        )
        return

    # ----------------------------------------------- ElevenLabs proxy session
    logger.info(
        "transcription_ws_connected",
        user_id=str(user_id),
        workspace_id=str(ws_uuid),
    )

    try:
        import websockets

        async with websockets.connect(
            _ELEVENLABS_REALTIME_URL,
            additional_headers={"xi-api-key": api_key},
        ) as ws_elevenlabs:
            task_browser = asyncio.create_task(_browser_to_elevenlabs(websocket, ws_elevenlabs))
            task_elevenlabs = asyncio.create_task(_elevenlabs_to_browser(ws_elevenlabs, websocket))

            # Wait for the browser relay to finish (either commit or disconnect).
            # Do NOT cancel the ElevenLabs relay yet — after a commit, ElevenLabs
            # still needs to send the committed_transcript back.
            await task_browser

            # Now wait for ElevenLabs to send the committed transcript (with timeout)
            try:
                await asyncio.wait_for(task_elevenlabs, timeout=15.0)
            except TimeoutError:
                logger.warning(
                    "transcription_ws_committed_timeout",
                    user_id=str(user_id),
                )
                task_elevenlabs.cancel()
                with suppress(asyncio.CancelledError):
                    await task_elevenlabs

            # Check for exceptions
            for task in (task_browser, task_elevenlabs):
                if task.done() and not task.cancelled():
                    exc = task.exception()
                    if exc:
                        logger.warning(
                            "transcription_ws_task_error",
                            error=str(exc),
                            user_id=str(user_id),
                        )

    except Exception as exc:
        logger.warning(
            "transcription_ws_elevenlabs_connection_error",
            error=str(exc),
            user_id=str(user_id),
            workspace_id=str(ws_uuid),
        )
        with suppress(Exception):
            await websocket.send_text(
                json.dumps({"type": "error", "message": f"ElevenLabs connection failed: {exc}"})
            )

    finally:
        logger.info(
            "transcription_ws_disconnected",
            user_id=str(user_id),
            workspace_id=str(ws_uuid),
        )
        with suppress(Exception):
            await websocket.close()


__all__ = ["router"]
