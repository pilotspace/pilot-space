"""Add workspace_api_keys table for BYOK (DD-002).

Revision ID: 014_workspace_api_keys
Revises: 013_add_module_lead_id
Create Date: 2026-01-26

Creates table for:
- workspace_api_keys: Encrypted API key storage per workspace/provider
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "014_workspace_api_keys"
down_revision: str | None = "013_add_module_lead_id"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    """Create workspace_api_keys table with RLS policies."""
    op.create_table(
        "workspace_api_keys",
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
        # Provider (anthropic, openai, google)
        sa.Column("provider", sa.String(50), nullable=False),
        # Supabase Vault encrypted key
        sa.Column("encrypted_key", sa.Text(), nullable=False),
        # Key validation status
        sa.Column(
            "is_valid",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
        sa.Column("last_validated_at", sa.DateTime(timezone=True), nullable=True),
        # Validation error if any
        sa.Column("validation_error", sa.Text(), nullable=True),
        # Foreign keys
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            ondelete="CASCADE",
        ),
        # Constraints
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "workspace_id", "provider", name="uq_workspace_api_keys_workspace_provider"
        ),
    )

    # Create indexes
    op.create_index(
        "ix_workspace_api_keys_workspace_id", "workspace_api_keys", ["workspace_id"]
    )

    # Create RLS policies
    _create_rls_policies()


def _create_rls_policies() -> None:
    """Create RLS policies for workspace_api_keys entity."""
    op.execute("ALTER TABLE workspace_api_keys ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE workspace_api_keys FORCE ROW LEVEL SECURITY")

    # Only admins/owners can view API keys
    op.execute("""
        CREATE POLICY "workspace_api_keys_admin_select"
        ON workspace_api_keys
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

    # Only admins/owners can modify API keys
    op.execute("""
        CREATE POLICY "workspace_api_keys_admin_modify"
        ON workspace_api_keys
        FOR ALL
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


def downgrade() -> None:
    """Drop workspace_api_keys table and RLS policies."""
    # Drop RLS policies
    op.execute('DROP POLICY IF EXISTS "workspace_api_keys_admin_modify" ON workspace_api_keys')
    op.execute('DROP POLICY IF EXISTS "workspace_api_keys_admin_select" ON workspace_api_keys')
    op.execute("ALTER TABLE workspace_api_keys DISABLE ROW LEVEL SECURITY")

    # Drop table
    op.drop_table("workspace_api_keys")
