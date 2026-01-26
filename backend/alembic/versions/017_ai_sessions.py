"""Add ai_sessions table for multi-turn conversations.

Revision ID: 017_ai_sessions
Revises: 016_ai_cost_records
Create Date: 2026-01-26

Creates table for:
- ai_sessions: Multi-turn conversation state for AIContextAgent and ConversationAgent
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "017_ai_sessions"
down_revision: str | None = "016_ai_cost_records"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    """Create ai_sessions table with RLS policies."""
    op.create_table(
        "ai_sessions",
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
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
        # Workspace scoped
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        # User who owns the session
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        # Agent type (ai_context, conversation)
        sa.Column("agent_name", sa.String(100), nullable=False),
        # Optional context reference (issue_id, note_id, etc.)
        sa.Column("context_id", postgresql.UUID(as_uuid=True), nullable=True),
        # Conversation history and state
        sa.Column("session_data", postgresql.JSONB(), nullable=False),
        # Accumulated cost for this session
        sa.Column(
            "total_cost_usd",
            sa.Numeric(10, 6),
            server_default=sa.text("0"),
            nullable=False,
        ),
        # Turn count for session limits
        sa.Column(
            "turn_count",
            sa.Integer(),
            server_default=sa.text("0"),
            nullable=False,
        ),
        # Session expiration (30 minutes by default)
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        # Foreign keys
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        # Constraints
        sa.PrimaryKeyConstraint("id"),
        # Unique active session per user/agent/context
        sa.UniqueConstraint(
            "user_id", "agent_name", "context_id", name="uq_ai_sessions_user_agent_context"
        ),
    )

    # Create indexes
    op.create_index("ix_ai_sessions_expires_at", "ai_sessions", ["expires_at"])
    op.create_index(
        "ix_ai_sessions_user_agent", "ai_sessions", ["user_id", "agent_name"]
    )
    op.create_index(
        "ix_ai_sessions_workspace_id", "ai_sessions", ["workspace_id"]
    )

    # Create RLS policies
    _create_rls_policies()


def _create_rls_policies() -> None:
    """Create RLS policies for ai_sessions entity."""
    op.execute("ALTER TABLE ai_sessions ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE ai_sessions FORCE ROW LEVEL SECURITY")

    # Users can only access their own sessions
    op.execute("""
        CREATE POLICY "ai_sessions_own_access"
        ON ai_sessions
        FOR ALL
        USING (
            user_id = current_setting('app.current_user_id', true)::uuid
        )
        WITH CHECK (
            user_id = current_setting('app.current_user_id', true)::uuid
        )
    """)

    # Admins can view all sessions in workspace (for debugging)
    op.execute("""
        CREATE POLICY "ai_sessions_admin_select"
        ON ai_sessions
        FOR SELECT
        USING (
            workspace_id IN (
                SELECT wm.workspace_id
                FROM workspace_members wm
                WHERE wm.user_id = current_setting('app.current_user_id', true)::uuid
                AND wm.role IN ('OWNER', 'ADMIN')
                AND wm.is_deleted = false
            )
        )
    """)


def downgrade() -> None:
    """Drop ai_sessions table and RLS policies."""
    # Drop RLS policies
    op.execute('DROP POLICY IF EXISTS "ai_sessions_admin_select" ON ai_sessions')
    op.execute('DROP POLICY IF EXISTS "ai_sessions_own_access" ON ai_sessions')
    op.execute("ALTER TABLE ai_sessions DISABLE ROW LEVEL SECURITY")

    # Drop table
    op.drop_table("ai_sessions")
