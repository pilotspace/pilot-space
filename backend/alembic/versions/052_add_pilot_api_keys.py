"""Add pilot_api_keys table for CLI authentication.

Revision ID: 052_add_pilot_api_keys
Revises: 051_add_user_bio
Create Date: 2026-03-01

Creates:
- pilot_api_keys table with SHA-256 hashed key storage (never plaintext)
- Unique index on key_hash for O(1) lookup by hash
- Workspace-scoped RLS policy isolating keys per tenant
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "052_add_pilot_api_keys"
down_revision: str | None = "051_add_user_bio"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    """Create pilot_api_keys table with indexes and workspace-scoped RLS."""
    op.create_table(
        "pilot_api_keys",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        # SHA-256 produces 64 hex chars; NEVER store raw key
        sa.Column("key_hash", sa.String(64), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
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
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "is_deleted",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # Unique index on key_hash — authentication lookup must be O(1) and collision-free
    op.create_index(
        "ix_pilot_api_keys_key_hash",
        "pilot_api_keys",
        ["key_hash"],
        unique=True,
    )
    # Index for listing keys by workspace (RLS + list endpoints)
    op.create_index(
        "ix_pilot_api_keys_workspace_id",
        "pilot_api_keys",
        ["workspace_id"],
    )
    # Index for listing keys by user within a workspace
    op.create_index(
        "ix_pilot_api_keys_user_id",
        "pilot_api_keys",
        ["user_id"],
    )

    # Enable RLS — workspace_id isolation via app.current_workspace_id session variable
    op.execute("""
        ALTER TABLE pilot_api_keys ENABLE ROW LEVEL SECURITY;
        ALTER TABLE pilot_api_keys FORCE ROW LEVEL SECURITY;

        CREATE POLICY "pilot_api_keys_workspace_isolation"
        ON pilot_api_keys
        FOR ALL
        USING (
            workspace_id = current_setting('app.current_workspace_id', true)::uuid
        )
        WITH CHECK (
            workspace_id = current_setting('app.current_workspace_id', true)::uuid
        );
    """)


def downgrade() -> None:
    """Drop pilot_api_keys table, indexes, and RLS policy."""
    op.execute("""
        DROP POLICY IF EXISTS "pilot_api_keys_workspace_isolation" ON pilot_api_keys;
        ALTER TABLE pilot_api_keys DISABLE ROW LEVEL SECURITY;
    """)

    op.drop_index("ix_pilot_api_keys_user_id", table_name="pilot_api_keys")
    op.drop_index("ix_pilot_api_keys_workspace_id", table_name="pilot_api_keys")
    op.drop_index("ix_pilot_api_keys_key_hash", table_name="pilot_api_keys")

    op.drop_table("pilot_api_keys")
