"""Add editor_plugins table with RLS policies.

Stores workspace-installed editor plugins (JS bundles with manifest).
Distinct from workspace_plugins (Phase 19 -- GitHub-sourced skill plugins).

Revision ID: 098_add_editor_plugins
Revises: 097_add_artifact_annotations
Create Date: 2026-03-24
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import text
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "098_add_editor_plugins"
down_revision: str = "097_add_artifact_annotations"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create editor_plugins table and enable RLS."""
    op.create_table(
        "editor_plugins",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "workspace_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("version", sa.String(32), nullable=False),
        sa.Column("display_name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=False, server_default=sa.text("''")),
        sa.Column("author", sa.String(200), nullable=False),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default=sa.text("'enabled'"),
        ),
        sa.Column("manifest", postgresql.JSONB, nullable=False),
        sa.Column("storage_path", sa.String(512), nullable=False),
        # Inherited soft-delete columns (unused -- hard delete only)
        sa.Column(
            "is_deleted",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    # Partial unique index: one plugin name per workspace (non-deleted rows).
    op.create_index(
        "uq_editor_plugins_workspace_name",
        "editor_plugins",
        ["workspace_id", "name"],
        unique=True,
        postgresql_where=sa.text("is_deleted = false"),
    )

    # RLS: workspace isolation
    op.execute(text("ALTER TABLE editor_plugins ENABLE ROW LEVEL SECURITY"))
    op.execute(text("ALTER TABLE editor_plugins FORCE ROW LEVEL SECURITY"))

    # SELECT policy: any workspace member can read plugins
    op.execute(
        text("""
        CREATE POLICY "editor_plugins_select_member"
        ON editor_plugins
        FOR SELECT
        USING (
            workspace_id IN (
                SELECT wm.workspace_id
                FROM workspace_members wm
                WHERE wm.user_id = current_setting('app.current_user_id', true)::uuid
                AND wm.is_deleted = false
            )
        )
    """)
    )

    # INSERT/UPDATE/DELETE policy: only admins and owners
    op.execute(
        text("""
        CREATE POLICY "editor_plugins_modify_admin"
        ON editor_plugins
        FOR ALL
        USING (
            workspace_id IN (
                SELECT wm.workspace_id
                FROM workspace_members wm
                WHERE wm.user_id = current_setting('app.current_user_id', true)::uuid
                AND wm.is_deleted = false
                AND wm.role IN ('OWNER', 'ADMIN')
            )
        )
    """)
    )

    # Service role bypass
    op.execute(
        text("""
        CREATE POLICY "editor_plugins_service_role"
        ON editor_plugins
        FOR ALL
        TO service_role
        USING (true)
    """)
    )


def downgrade() -> None:
    """Drop editor_plugins table and policies."""
    op.execute(text('DROP POLICY IF EXISTS "editor_plugins_service_role" ON editor_plugins'))
    op.execute(text('DROP POLICY IF EXISTS "editor_plugins_modify_admin" ON editor_plugins'))
    op.execute(text('DROP POLICY IF EXISTS "editor_plugins_select_member" ON editor_plugins'))
    op.execute(text("ALTER TABLE editor_plugins DISABLE ROW LEVEL SECURITY"))
    op.drop_index("uq_editor_plugins_workspace_name", table_name="editor_plugins")
    op.drop_table("editor_plugins")
