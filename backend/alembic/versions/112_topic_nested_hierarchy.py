"""Topic nested hierarchy: parent_topic_id self-FK + topic_depth on notes.

Phase 93 Plan 01 — additive schema for the topic-level nested hierarchy.

Adds a SECOND, distinct hierarchy on the ``notes`` table:

  * ``parent_topic_id`` UUID NULL, self-FK to ``notes.id`` (ON DELETE SET NULL)
  * ``topic_depth`` SMALLINT NOT NULL DEFAULT 0 — denormalized depth for fast
    ancestor / breadcrumb queries.

The existing page-level hierarchy (``parent_id`` / ``depth`` / ``position``,
max depth 2) is intentionally untouched. Topic-level hierarchy is bounded at
max depth 5; the invariant is enforced in the service / repository layer
(NoteRepository.move_topic) — no DB CheckConstraint here because intermediate
states during a recursive depth recompute would otherwise trip it.

RLS preserved: workspace_id boundary already covers nested rows. No
ALTER TABLE on existing policies; existing notes RLS row-set is unchanged.

Indexes:
  * ``idx_notes_parent_topic_id`` on (parent_topic_id) — children listing
  * ``idx_notes_workspace_parent`` on (workspace_id, parent_topic_id) — tree queries

Revision ID: 112_topic_nested_hierarchy
Revises: 111_proposals_and_version_history
Create Date: 2026-04-25
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "112_topic_nested_hierarchy"
down_revision: str | None = "111_proposals_and_version_history"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    # ── Additive columns on notes ───────────────────────────────────────────
    # parent_topic_id: nullable self-FK, ON DELETE SET NULL (orphan safety).
    op.add_column(
        "notes",
        sa.Column(
            "parent_topic_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("notes.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    # topic_depth: denormalized; default 0 backfills existing rows automatically.
    op.add_column(
        "notes",
        sa.Column(
            "topic_depth",
            sa.SmallInteger(),
            server_default=sa.text("0"),
            nullable=False,
        ),
    )

    # ── Indexes ─────────────────────────────────────────────────────────────
    op.create_index(
        "idx_notes_parent_topic_id",
        "notes",
        ["parent_topic_id"],
    )
    op.create_index(
        "idx_notes_workspace_parent",
        "notes",
        ["workspace_id", "parent_topic_id"],
    )

    # RLS preserved: workspace_id boundary already covers nested rows.
    # No ALTER TABLE on existing policies; existing notes RLS row-set unchanged.


def downgrade() -> None:
    op.drop_index("idx_notes_workspace_parent", table_name="notes")
    op.drop_index("idx_notes_parent_topic_id", table_name="notes")
    op.drop_column("notes", "topic_depth")
    op.drop_column("notes", "parent_topic_id")
