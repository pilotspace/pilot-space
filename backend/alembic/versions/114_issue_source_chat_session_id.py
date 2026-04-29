"""Add source_chat_session_id to issues table (ARTF-04).

AI-created issues now stamp the originating chat session so that
LineageChip can render "From chat" attribution in the frontend.

Schema changes:

  * Add ``issues.source_chat_session_id`` UUID NULL FK to ``ai_sessions.id``
    with ``ON DELETE SET NULL`` (mirrors the pattern on the notes table).
  * Add index ``ix_issues_source_chat_session_id`` to support lineage
    look-ups (e.g. "show all issues created from this chat session").

RLS: existing workspace-isolation policy on ``issues`` does NOT reference
``source_chat_session_id``, so no policy changes are needed.  Adding a
nullable column is backward-compatible with all existing rows.

Revision ID: 114_issue_source_chat_session_id
Revises: 113_artifact_project_id_nullable
Create Date: 2026-04-29
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "114_issue_source_chat_session_id"
down_revision: str | None = "113_artifact_project_id_nullable"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    # 1. Add nullable FK column.
    op.add_column(
        "issues",
        sa.Column(
            "source_chat_session_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("ai_sessions.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )

    # 2. Index to support per-session lineage queries.
    op.create_index(
        "ix_issues_source_chat_session_id",
        "issues",
        ["source_chat_session_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_issues_source_chat_session_id", table_name="issues")
    op.drop_column("issues", "source_chat_session_id")
