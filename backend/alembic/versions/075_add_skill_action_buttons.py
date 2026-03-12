"""Add skill_action_buttons table with RLS.

Revision ID: 075_add_skill_action_buttons
Revises: 074_add_workspace_plugins
Create Date: 2026-03-11

Phase 17 -- Skill Action Buttons (SKBTN-01..04):

1. Creates binding_type PostgreSQL enum type (skill, mcp_tool).
2. Creates skill_action_buttons table with:
   - Standard WorkspaceScopedModel columns (id, workspace_id, created_at,
     updated_at, is_deleted, deleted_at)
   - name VARCHAR(100) NOT NULL -- display name
   - icon VARCHAR(50) NULL -- optional icon identifier
   - binding_type binding_type NOT NULL -- SKILL or MCP_TOOL
   - binding_id UUID NULL -- optional bound skill/tool UUID
   - binding_metadata JSONB NOT NULL DEFAULT '{}'::jsonb
   - sort_order INTEGER NOT NULL DEFAULT 0
   - is_active BOOLEAN NOT NULL DEFAULT true
3. Adds partial unique index on (workspace_id, name) WHERE is_deleted = false.
4. Adds composite index on (workspace_id, is_active) for hot-path queries.
5. Enables RLS with workspace isolation policy and service_role bypass.

Downgrade reverses all changes: drops policies, indexes, table, and enum.
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy import text
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "075_add_skill_action_buttons"
down_revision: str = "074_add_workspace_plugins"
branch_labels: None = None
depends_on: None = None


def upgrade() -> None:
    """Create binding_type enum and skill_action_buttons table."""

    # ---- Create binding_type enum ----
    op.execute(text("CREATE TYPE binding_type AS ENUM ('skill', 'mcp_tool')"))

    # ---- skill_action_buttons ----
    op.create_table(
        "skill_action_buttons",
        # Primary key
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=text("gen_random_uuid()"),
            nullable=False,
        ),
        # Workspace scoping (FK with cascade delete)
        sa.Column(
            "workspace_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # Button identity
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("icon", sa.String(50), nullable=True),
        # Binding
        sa.Column(
            "binding_type",
            postgresql.ENUM("skill", "mcp_tool", name="binding_type", create_type=False),
            nullable=False,
        ),
        sa.Column(
            "binding_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
        sa.Column(
            "binding_metadata",
            postgresql.JSONB(),
            server_default=text("'{}'::jsonb"),
            nullable=False,
        ),
        # Display
        sa.Column(
            "sort_order",
            sa.Integer(),
            server_default=text("0"),
            nullable=False,
        ),
        sa.Column(
            "is_active",
            sa.Boolean(),
            server_default=text("true"),
            nullable=False,
        ),
        # Timestamps
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
            nullable=False,
        ),
        # Soft delete
        sa.Column(
            "is_deleted",
            sa.Boolean(),
            server_default=text("false"),
            nullable=False,
        ),
        sa.Column(
            "deleted_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )

    # Partial unique index: one button name per workspace (non-deleted only)
    op.execute(
        text(
            "CREATE UNIQUE INDEX uq_skill_action_buttons_workspace_name "
            "ON skill_action_buttons (workspace_id, name) "
            "WHERE is_deleted = false"
        )
    )

    # Hot-path composite index: get active buttons for workspace
    op.create_index(
        "ix_skill_action_buttons_workspace_active",
        "skill_action_buttons",
        ["workspace_id", "is_active"],
    )

    # workspace_id column index
    op.create_index(
        "ix_skill_action_buttons_workspace_id",
        "skill_action_buttons",
        ["workspace_id"],
    )

    # Enable RLS
    op.execute(text("ALTER TABLE skill_action_buttons ENABLE ROW LEVEL SECURITY"))
    op.execute(text("ALTER TABLE skill_action_buttons FORCE ROW LEVEL SECURITY"))

    # Workspace isolation policy
    op.execute(
        text(
            """
            CREATE POLICY "skill_action_buttons_workspace_isolation"
            ON skill_action_buttons
            FOR ALL
            TO authenticated
            USING (
                workspace_id IN (
                    SELECT wm.workspace_id
                    FROM workspace_members wm
                    WHERE wm.user_id = current_setting('app.current_user_id', true)::uuid
                    AND wm.is_deleted = false
                    AND wm.role IN ('OWNER', 'ADMIN', 'MEMBER', 'GUEST')
                )
            )
            """
        )
    )

    # Service-role bypass policy
    op.execute(
        text(
            """
            CREATE POLICY "skill_action_buttons_service_role"
            ON skill_action_buttons
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true)
            """
        )
    )


def downgrade() -> None:
    """Drop RLS policies, indexes, table, and enum type."""

    # Drop policies
    op.execute(
        text('DROP POLICY IF EXISTS "skill_action_buttons_service_role" ON skill_action_buttons')
    )
    op.execute(
        text(
            'DROP POLICY IF EXISTS "skill_action_buttons_workspace_isolation" '
            "ON skill_action_buttons"
        )
    )

    # Drop indexes
    op.drop_index(
        "ix_skill_action_buttons_workspace_id",
        table_name="skill_action_buttons",
    )
    op.drop_index(
        "ix_skill_action_buttons_workspace_active",
        table_name="skill_action_buttons",
    )
    op.execute(text("DROP INDEX IF EXISTS uq_skill_action_buttons_workspace_name"))

    # Drop table
    op.drop_table("skill_action_buttons")

    # Drop enum type
    op.execute(text("DROP TYPE IF EXISTS binding_type"))
