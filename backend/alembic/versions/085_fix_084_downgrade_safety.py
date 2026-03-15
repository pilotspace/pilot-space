"""Fix migration 084 downgrade to be rollback-safe.

Revision ID: 085_fix_084_downgrade_safety
Revises: 084_add_service_type_to_api_keys
Create Date: 2026-03-15

This is a no-op upgrade. The downgrade replaces 084's unsafe downgrade
with pre-checks: delete Ollama rows (NULL encrypted_key) and deduplicate
rows per (workspace_id, provider) keeping the newest before restoring the
old unique constraint.
"""

import sqlalchemy as sa
from sqlalchemy import text

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "085_fix_084_downgrade_safety"
down_revision: str | None = "084_add_service_type_to_api_keys"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    """No-op — migration 084 schema is already correct."""


def downgrade() -> None:
    """Undo migration 084 safely: pre-checks before restoring old constraint.

    1. Delete Ollama rows with NULL encrypted_key (can't satisfy NOT NULL restore).
    2. Deduplicate rows per (workspace_id, provider) keeping the newest.
    3. Reverse all 084 schema changes.
    """
    # 1. Delete rows with NULL encrypted_key (Ollama keyless rows)
    op.execute(text("DELETE FROM workspace_api_keys WHERE encrypted_key IS NULL"))

    # 2. Deduplicate: keep newest row per (workspace_id, provider), delete the rest
    op.execute(
        text("""
            DELETE FROM workspace_api_keys
            WHERE id NOT IN (
                SELECT DISTINCT ON (workspace_id, provider) id
                FROM workspace_api_keys
                ORDER BY workspace_id, provider, updated_at DESC
            )
        """)
    )

    # 3. Reverse 084 schema changes
    # Drop new index
    op.drop_index("ix_workspace_api_keys_service_type", table_name="workspace_api_keys")

    # Drop new unique constraint
    op.drop_constraint(
        "uq_workspace_api_keys_workspace_provider_service",
        "workspace_api_keys",
        type_="unique",
    )

    # Restore old unique constraint
    op.create_unique_constraint(
        "uq_workspace_api_keys_workspace_provider",
        "workspace_api_keys",
        ["workspace_id", "provider"],
    )

    # Restore encrypted_key NOT NULL
    op.alter_column(
        "workspace_api_keys",
        "encrypted_key",
        existing_type=sa.Text(),
        nullable=False,
    )

    # Drop service_type column
    op.drop_column("workspace_api_keys", "service_type")
