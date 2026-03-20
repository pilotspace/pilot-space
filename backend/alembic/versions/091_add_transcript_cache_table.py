"""Add transcript_cache table for ElevenLabs STT result caching.

Revision ID: 091_add_transcript_cache_table
Revises: 090_add_tags_and_usage_to_skills
Create Date: 2026-03-20

Caches ElevenLabs Speech-to-Text results keyed by SHA-256 audio hash
to avoid reprocessing identical audio (BYOK cost optimization).
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "091_add_transcript_cache_table"
down_revision: str = "090_add_tags_and_usage_to_skills"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create transcript_cache table."""
    op.create_table(
        "transcript_cache",
        sa.Column(
            "id",
            sa.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "workspace_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("audio_hash", sa.String(64), nullable=False),
        sa.Column("text", sa.Text, nullable=False),
        sa.Column("language_code", sa.String(10), nullable=True),
        sa.Column("duration_seconds", sa.Float, nullable=True),
        sa.Column(
            "provider",
            sa.String(50),
            nullable=False,
            server_default=sa.text("'elevenlabs'"),
        ),
        sa.Column("metadata_json", sa.JSON, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "workspace_id",
            "audio_hash",
            name="uq_transcript_cache_workspace_audio_hash",
        ),
    )

    # Index on workspace_id (from WorkspaceScopedMixin pattern)
    op.create_index(
        "ix_transcript_cache_workspace_id",
        "transcript_cache",
        ["workspace_id"],
    )

    # Index on audio_hash for fast cache lookups
    op.create_index(
        "ix_transcript_cache_audio_hash",
        "transcript_cache",
        ["audio_hash"],
    )


def downgrade() -> None:
    """Drop transcript_cache table."""
    op.drop_index("ix_transcript_cache_audio_hash", table_name="transcript_cache")
    op.drop_index("ix_transcript_cache_workspace_id", table_name="transcript_cache")
    op.drop_table("transcript_cache")
