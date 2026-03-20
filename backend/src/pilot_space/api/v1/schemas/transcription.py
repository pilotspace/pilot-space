"""Transcription schemas for API requests/responses.

Pydantic models for voice-to-text transcription via ElevenLabs STT.
"""

from __future__ import annotations

from uuid import UUID

from pydantic import Field

from pilot_space.api.v1.schemas.base import BaseSchema


class TranscribeRequest(BaseSchema):
    """Metadata for transcription — audio file sent as multipart.

    Attributes:
        language: Optional ISO 639-1 language code hint (e.g. 'en', 'fr').
    """

    language: str | None = Field(
        default=None,
        description="ISO 639-1 language code hint (e.g. 'en', 'fr')",
        max_length=10,
    )


class TranscribeResponse(BaseSchema):
    """Response for a transcription request.

    Attributes:
        transcript_id: UUID of the persisted transcript cache record.
        text: The transcribed text.
        language_code: Detected or requested language code.
        duration_seconds: Audio duration in seconds.
        cached: True if result was served from cache (identical audio submitted before).
    """

    transcript_id: UUID = Field(description="UUID of the transcript cache record")
    text: str = Field(description="Transcribed text")
    language_code: str | None = Field(default=None, description="Detected language code")
    duration_seconds: float | None = Field(default=None, description="Audio duration in seconds")
    cached: bool = Field(
        default=False,
        description="True if result was served from cache",
    )


__all__ = ["TranscribeRequest", "TranscribeResponse"]
