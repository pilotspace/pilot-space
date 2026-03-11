"""Add previous_encrypted_key column for dual-key fallback during rotation.

Revision ID: 076_add_previous_encrypted_key
Revises: 075_add_skill_action_buttons
Create Date: 2026-03-11

Supports online key rotation: stores the old master-encrypted workspace key
so that content encrypted with the previous key can still be decrypted during
the re-encryption window.
"""

import sqlalchemy as sa

from alembic import op

revision = "076_add_previous_encrypted_key"
down_revision = "075_add_skill_action_buttons"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add previous_encrypted_key nullable column to workspace_encryption_keys."""
    op.add_column(
        "workspace_encryption_keys",
        sa.Column(
            "previous_encrypted_key",
            sa.Text(),
            nullable=True,
            comment="Previous master-encrypted key for dual-key fallback during rotation",
        ),
    )


def downgrade() -> None:
    """Remove previous_encrypted_key column."""
    op.drop_column("workspace_encryption_keys", "previous_encrypted_key")
