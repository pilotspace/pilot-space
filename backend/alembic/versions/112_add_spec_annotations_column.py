"""Add spec_annotations JSONB column to notes table.

Living Specs: stores AI deviation annotations and batch decision records
as a JSONB array on the source note.

Phase 78 Plan 01 — LSP-01 Living Specs backend foundation.

Revision ID: 112_add_spec_annotations_column
Revises: 111_batch_run_current_stage
Create Date: 2026-04-15
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy import text

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "112_add_spec_annotations_column"
down_revision: str | None = "111_batch_run_current_stage"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    """Add spec_annotations JSONB column to notes."""
    op.add_column(
        "notes",
        sa.Column(
            "spec_annotations",
            sa.dialects.postgresql.JSONB(),
            nullable=True,
            server_default=text("'[]'::jsonb"),
        ),
    )


def downgrade() -> None:
    """Drop spec_annotations column from notes."""
    op.drop_column("notes", "spec_annotations")
