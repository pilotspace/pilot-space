"""Add proposals table + version history columns to issues.

Phase 89 Plan 01 — storage substrate for the Edit Proposal pipeline.

Creates ``proposals`` table (RLS-enabled + forced + workspace-isolation +
service_role bypass) to persist AI-generated edit intents queued for human
review. Adds ``version_number`` + ``version_history`` JSONB columns to
``issues`` so future revert / history-chip flows can read prior snapshots.

REV-89-01-A adds policy columns ``mode``, ``accept_disabled``, ``persist``,
``plan_preview_only`` to eliminate a follow-on migration in Plan 03 / 04.

Deferred per CONTEXT §2 line 103: ``specs`` table does not exist in schema,
so spec version columns are NOT added here. Plan 05 (or whichever plan
introduces specs) adds version columns when the table lands. ``decisions``
table likewise deferred.

Revision ID: 111_proposals_and_version_history
Revises: 110_workspace_hook_configs
Create Date: 2026-04-24
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy import text
from sqlalchemy.dialects import postgresql

from alembic import op
from pilot_space.infrastructure.database.rls import get_workspace_rls_policy_sql

# revision identifiers, used by Alembic.
revision: str = "111_proposals_and_version_history"
down_revision: str | None = "110_workspace_hook_configs"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    # ── Table: proposals ────────────────────────────────────────────────────
    op.create_table(
        "proposals",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
            nullable=False,
        ),
        sa.Column(
            "workspace_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("message_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("target_artifact_type", sa.String(length=32), nullable=False),
        sa.Column("target_artifact_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("intent_tool", sa.String(length=128), nullable=False),
        sa.Column(
            "intent_args",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column("diff_kind", sa.String(length=16), nullable=False),
        sa.Column(
            "diff_payload",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column("reasoning", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.String(length=16),
            server_default=sa.text("'pending'"),
            nullable=False,
        ),
        sa.Column("applied_version", sa.Integer(), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decided_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        # REV-89-01-A: ChatMode + policy flags frozen at proposal creation time
        sa.Column(
            "mode",
            sa.String(length=16),
            server_default=sa.text("'act'"),
            nullable=False,
        ),
        sa.Column(
            "accept_disabled",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column(
            "persist",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
        sa.Column(
            "plan_preview_only",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'applied', 'rejected', 'retried', 'errored')",
            name="ck_proposals_status",
        ),
        sa.CheckConstraint(
            "mode IN ('plan', 'act', 'research', 'draft')",
            name="ck_proposals_mode",
        ),
    )

    # ── Indexes ─────────────────────────────────────────────────────────────
    op.create_index(
        "idx_proposals_session_status",
        "proposals",
        ["session_id", "status"],
    )
    op.create_index(
        "idx_proposals_workspace_target",
        "proposals",
        ["workspace_id", "target_artifact_type", "target_artifact_id"],
    )

    # ── RLS policies ────────────────────────────────────────────────────────
    # ``get_workspace_rls_policy_sql`` emits:
    #   - ENABLE + FORCE ROW LEVEL SECURITY
    #   - workspace_isolation policy (workspace_members lookup)
    #   - service_role bypass policy
    op.execute(text(get_workspace_rls_policy_sql("proposals")))

    # ── Version columns on issues (specs deferred — table does not exist) ───
    op.add_column(
        "issues",
        sa.Column(
            "version_number",
            sa.Integer(),
            server_default=sa.text("1"),
            nullable=False,
        ),
    )
    op.add_column(
        "issues",
        sa.Column(
            "version_history",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    # ── Drop version columns on issues ──────────────────────────────────────
    op.drop_column("issues", "version_history")
    op.drop_column("issues", "version_number")

    # ── Drop RLS policies + disable RLS on proposals ────────────────────────
    op.execute(text('DROP POLICY IF EXISTS "proposals_service_role" ON proposals'))
    op.execute(text('DROP POLICY IF EXISTS "proposals_workspace_isolation" ON proposals'))
    op.execute(text("ALTER TABLE proposals NO FORCE ROW LEVEL SECURITY"))
    op.execute(text("ALTER TABLE proposals DISABLE ROW LEVEL SECURITY"))

    # ── Drop indexes + table ────────────────────────────────────────────────
    op.drop_index("idx_proposals_workspace_target", table_name="proposals")
    op.drop_index("idx_proposals_session_status", table_name="proposals")
    op.drop_table("proposals")
