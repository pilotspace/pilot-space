"""Add deleted_at column to project_members table.

Migration 100_project_rbac_schema created project_members with is_deleted but
omitted the deleted_at column required by BaseModel (SoftDeleteMixin).

Revision ID: 103_project_members_add_deleted_at
Revises: 102_workspace_invitation_supabase
Create Date: 2026-03-25
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "103_project_members_add_deleted_at"
down_revision: str | None = "102_workspace_invitation_supabase"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    """Add missing deleted_at column to project_members."""
    op.add_column(
        "project_members",
        sa.Column(
            "deleted_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    """Remove deleted_at column from project_members."""
    op.drop_column("project_members", "deleted_at")
