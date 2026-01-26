"""Add ai_cost_records table for usage tracking.

Revision ID: 016_ai_cost_records
Revises: 015_ai_approval_requests
Create Date: 2026-01-26

Creates table for:
- ai_cost_records: Per-operation AI cost tracking with token counts
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "016_ai_cost_records"
down_revision: str | None = "015_ai_approval_requests"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    """Create ai_cost_records table with RLS policies."""
    op.create_table(
        "ai_cost_records",
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
        # User who triggered the AI operation
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        # Agent that made the API call
        sa.Column("agent_name", sa.String(100), nullable=False),
        # Provider (anthropic, openai, google)
        sa.Column("provider", sa.String(50), nullable=False),
        # Model used (claude-opus-4-5, claude-3-5-haiku, etc.)
        sa.Column("model", sa.String(100), nullable=False),
        # Token counts
        sa.Column("input_tokens", sa.Integer(), nullable=False),
        sa.Column("output_tokens", sa.Integer(), nullable=False),
        # Cost in USD (precision for micro-costs)
        sa.Column("cost_usd", sa.Numeric(10, 6), nullable=False),
        # Optional: link to specific operation (issue_id, note_id, etc.)
        sa.Column("operation_id", postgresql.UUID(as_uuid=True), nullable=True),
        # Operation type for aggregation (e.g., ghost_text, pr_review, ai_context)
        sa.Column("operation_type", sa.String(100), nullable=True),
        # Additional context metadata
        sa.Column("metadata", postgresql.JSONB(), nullable=True),
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
        # Constraints
        sa.PrimaryKeyConstraint("id"),
    )

    # Create indexes for aggregation queries
    op.create_index(
        "ix_ai_cost_records_workspace_created",
        "ai_cost_records",
        ["workspace_id", "created_at"],
    )
    op.create_index(
        "ix_ai_cost_records_user_created",
        "ai_cost_records",
        ["user_id", "created_at"],
    )
    op.create_index(
        "ix_ai_cost_records_agent_name", "ai_cost_records", ["agent_name"]
    )

    # Create RLS policies
    _create_rls_policies()


def _create_rls_policies() -> None:
    """Create RLS policies for ai_cost_records entity."""
    op.execute("ALTER TABLE ai_cost_records ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE ai_cost_records FORCE ROW LEVEL SECURITY")

    # Workspace members can view their own cost records
    op.execute("""
        CREATE POLICY "ai_cost_records_own_select"
        ON ai_cost_records
        FOR SELECT
        USING (
            user_id = current_setting('app.current_user_id', true)::uuid
            OR workspace_id IN (
                SELECT wm.workspace_id
                FROM workspace_members wm
                WHERE wm.user_id = current_setting('app.current_user_id', true)::uuid
                AND wm.role IN ('OWNER', 'ADMIN')
                AND wm.is_deleted = false
            )
        )
    """)

    # System can insert cost records (no user context needed for INSERT)
    op.execute("""
        CREATE POLICY "ai_cost_records_system_insert"
        ON ai_cost_records
        FOR INSERT
        WITH CHECK (true)
    """)


def downgrade() -> None:
    """Drop ai_cost_records table and RLS policies."""
    # Drop RLS policies
    op.execute('DROP POLICY IF EXISTS "ai_cost_records_system_insert" ON ai_cost_records')
    op.execute('DROP POLICY IF EXISTS "ai_cost_records_own_select" ON ai_cost_records')
    op.execute("ALTER TABLE ai_cost_records DISABLE ROW LEVEL SECURITY")

    # Drop table
    op.drop_table("ai_cost_records")
