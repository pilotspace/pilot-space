"""Add ai_approval_requests table for human-in-the-loop (DD-003).

Revision ID: 015_ai_approval_requests
Revises: 014_workspace_api_keys
Create Date: 2026-01-26

Creates table for:
- ai_approval_requests: Human-in-the-loop approval queue for critical AI actions
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "015_ai_approval_requests"
down_revision: str | None = "014_workspace_api_keys"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    """Create ai_approval_requests table with RLS policies."""
    # Create approval_status enum type
    op.execute(
        "CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected', 'expired')"
    )

    op.create_table(
        "ai_approval_requests",
        # Base model columns
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        # Workspace scoped
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        # User who triggered the action
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        # Agent that requested approval
        sa.Column("agent_name", sa.String(100), nullable=False),
        # Action type (e.g., create_issue, merge_pr, delete_issue)
        sa.Column("action_type", sa.String(100), nullable=False),
        # Action payload (issue data, PR data, etc.)
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        # Optional context for reviewer
        sa.Column("context", postgresql.JSONB(), nullable=True),
        # Approval status
        sa.Column(
            "status",
            postgresql.ENUM(
                "pending",
                "approved",
                "rejected",
                "expired",
                name="approval_status",
                create_type=False,
            ),
            server_default="pending",
            nullable=False,
        ),
        # Expiration time for pending requests
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        # Resolution details
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("resolution_note", sa.Text(), nullable=True),
        # Foreign keys
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["resolved_by"],
            ["users.id"],
            ondelete="SET NULL",
        ),
        # Constraints
        sa.PrimaryKeyConstraint("id"),
    )

    # Create indexes
    op.create_index(
        "ix_ai_approval_requests_workspace_status",
        "ai_approval_requests",
        ["workspace_id", "status"],
    )
    op.create_index(
        "ix_ai_approval_requests_user_id", "ai_approval_requests", ["user_id"]
    )
    # Partial index for pending requests that need expiration check
    op.execute("""
        CREATE INDEX ix_ai_approval_requests_pending_expires
        ON ai_approval_requests (expires_at)
        WHERE status = 'pending'
    """)

    # Create RLS policies
    _create_rls_policies()


def _create_rls_policies() -> None:
    """Create RLS policies for ai_approval_requests entity."""
    op.execute("ALTER TABLE ai_approval_requests ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE ai_approval_requests FORCE ROW LEVEL SECURITY")

    # Workspace members can view approval requests
    op.execute("""
        CREATE POLICY "ai_approval_requests_workspace_member_select"
        ON ai_approval_requests
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

    # Only admins/owners can resolve approval requests
    op.execute("""
        CREATE POLICY "ai_approval_requests_admin_modify"
        ON ai_approval_requests
        FOR UPDATE
        USING (
            workspace_id IN (
                SELECT wm.workspace_id
                FROM workspace_members wm
                WHERE wm.user_id = current_setting('app.current_user_id', true)::uuid
                AND wm.role IN ('OWNER', 'ADMIN')
                AND wm.is_deleted = false
            )
        )
        WITH CHECK (
            workspace_id IN (
                SELECT wm.workspace_id
                FROM workspace_members wm
                WHERE wm.user_id = current_setting('app.current_user_id', true)::uuid
                AND wm.role IN ('OWNER', 'ADMIN')
                AND wm.is_deleted = false
            )
        )
    """)

    # System can insert approval requests (no user context needed for INSERT)
    op.execute("""
        CREATE POLICY "ai_approval_requests_system_insert"
        ON ai_approval_requests
        FOR INSERT
        WITH CHECK (true)
    """)


def downgrade() -> None:
    """Drop ai_approval_requests table and RLS policies."""
    # Drop RLS policies
    op.execute(
        'DROP POLICY IF EXISTS "ai_approval_requests_system_insert" ON ai_approval_requests'
    )
    op.execute(
        'DROP POLICY IF EXISTS "ai_approval_requests_admin_modify" ON ai_approval_requests'
    )
    op.execute(
        'DROP POLICY IF EXISTS "ai_approval_requests_workspace_member_select" ON ai_approval_requests'
    )
    op.execute("ALTER TABLE ai_approval_requests DISABLE ROW LEVEL SECURITY")

    # Drop indexes
    op.execute("DROP INDEX IF EXISTS ix_ai_approval_requests_pending_expires")

    # Drop table
    op.drop_table("ai_approval_requests")

    # Drop enum type
    op.execute("DROP TYPE IF EXISTS approval_status")
