"""Add 'revoked' value to invitation_status enum.

Extends the invitation_status PostgreSQL enum with a 'revoked' value
to replace the semantically-ambiguous 'cancelled' for admin-initiated
revocations (CL-003, research.md RES-004).

This is an additive, non-destructive change — existing 'cancelled' records
remain valid. New code uses REVOKED; old CANCELLED kept for backward compat.

Revision ID: 104_invitation_status_revoked
Revises: 103_project_members_add_deleted_at
Create Date: 2026-03-27
"""

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "104_invitation_status_revoked"
down_revision: str | None = "103_project_members_add_deleted_at"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    """Add 'revoked' value to invitation_status enum (additive, safe)."""
    op.execute("ALTER TYPE invitation_status ADD VALUE IF NOT EXISTS 'revoked'")


def downgrade() -> None:
    """Remove 'revoked' from invitation_status enum.

    PostgreSQL does not support DROP VALUE on enums directly.
    We rename the value to mark it as deleted rather than breaking existing data.
    To fully remove, a full enum recreation would be needed in a separate DBA operation.
    """
    op.execute(
        "UPDATE workspace_invitations SET status = 'cancelled' WHERE status = 'revoked'"
    )
    # Note: PostgreSQL cannot DROP an enum value after it is used.
    # The enum value remains in the type but data is migrated away from it.
