"""TranscriptCache SQLAlchemy model.

Caches ElevenLabs STT transcription results keyed by SHA-256 audio hash
to avoid reprocessing identical audio (BYOK cost optimization).
"""

from __future__ import annotations

import uuid

from sqlalchemy import JSON, Float, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from pilot_space.infrastructure.database.base import Base, TimestampMixin, WorkspaceScopedMixin


class TranscriptCache(Base, TimestampMixin, WorkspaceScopedMixin):
    """Cached transcription result for a given audio file.

    Deduplication is performed using a SHA-256 hash of the audio bytes.
    One record per (workspace_id, audio_hash) pair — unique constraint enforced.

    Attributes:
        id: Primary key UUID.
        workspace_id: Workspace that owns this transcript (from WorkspaceScopedMixin).
        audio_hash: SHA-256 hex digest of the uploaded audio bytes (64 chars).
        text: Full transcription text returned by ElevenLabs.
        language_code: ISO 639-1 language code detected or requested.
        duration_seconds: Audio duration returned by ElevenLabs.
        provider: AI provider used for transcription (default "elevenlabs").
        metadata_json: Optional extra data (model used, confidence, etc.).
    """

    __tablename__ = "transcript_cache"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id",
            "audio_hash",
            name="uq_transcript_cache_workspace_audio_hash",
        ),
        Index("ix_transcript_cache_audio_hash", "audio_hash"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        server_default="gen_random_uuid()",
    )

    audio_hash: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        doc="SHA-256 hex digest of uploaded audio bytes",
    )

    text: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        doc="Full transcription text",
    )

    language_code: Mapped[str | None] = mapped_column(
        String(10),
        nullable=True,
        doc="ISO 639-1 language code",
    )

    duration_seconds: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
        doc="Audio duration in seconds",
    )

    provider: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        server_default="'elevenlabs'",
        doc="AI provider used for transcription",
    )

    metadata_json: Mapped[dict[str, object] | None] = mapped_column(
        JSON,
        nullable=True,
        doc="Extra metadata (model, confidence, etc.)",
    )

    def __repr__(self) -> str:
        """Return string representation."""
        return (
            f"<TranscriptCache(id={self.id}, "
            f"workspace_id={self.workspace_id}, "
            f"audio_hash={self.audio_hash[:8]}...)>"
        )


__all__ = ["TranscriptCache"]
