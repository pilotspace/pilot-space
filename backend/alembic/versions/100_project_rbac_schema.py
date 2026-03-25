"""Add project RBAC schema.

Creates project_members table; adds is_archived/archived_at to projects;
adds last_active_project_id to workspace_members;
adds project_assignments JSONB to workspace_invitations.

Revision ID: 100_project_rbac_schema
Revises: 099_tighten_mcp_rls_to_admin
Create Date: 2026-03-25
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "100_project_rbac_schema"
down_revision: str | None = "100_add_pgmq_set_vt_wrapper"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    """Create project_members table and add RBAC columns to existing tables."""

    # ── 1. Create project_members table ──────────────────────────────────────
    op.create_table(
        "project_members",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "assigned_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "assigned_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "is_active",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
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
        sa.Column(
            "is_deleted",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "project_id",
            "user_id",
            name="uq_project_members_project_user",
        ),
    )
    op.create_index("ix_project_members_project_id", "project_members", ["project_id"])
    op.create_index("ix_project_members_user_id", "project_members", ["user_id"])
    op.create_index("ix_project_members_is_active", "project_members", ["is_active"])

    # ── 2. projects: add is_archived / archived_at ────────────────────────────
    op.add_column(
        "projects",
        sa.Column(
            "is_archived",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )
    op.add_column(
        "projects",
        sa.Column(
            "archived_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.create_index("ix_projects_is_archived", "projects", ["is_archived"])

    # ── 3. workspace_members: add last_active_project_id ─────────────────────
    op.add_column(
        "workspace_members",
        sa.Column(
            "last_active_project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_workspace_members_last_active_project_id",
        "workspace_members",
        ["last_active_project_id"],
    )

    # ── 4. workspace_invitations: add project_assignments JSONB ───────────────
    op.add_column(
        "workspace_invitations",
        sa.Column(
            "project_assignments",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )


def downgrade() -> None:
    """Reverse all RBAC schema additions."""
    # Remove added columns first
    op.drop_column("workspace_invitations", "project_assignments")

    op.drop_index(
        "ix_workspace_members_last_active_project_id",
        table_name="workspace_members",
    )
    op.drop_column("workspace_members", "last_active_project_id")

    op.drop_index("ix_projects_is_archived", table_name="projects")
    op.drop_column("projects", "archived_at")
    op.drop_column("projects", "is_archived")

    # Drop project_members table
    op.drop_index("ix_project_members_is_active", table_name="project_members")
    op.drop_index("ix_project_members_user_id", table_name="project_members")
    op.drop_index("ix_project_members_project_id", table_name="project_members")
    op.drop_table("project_members")
