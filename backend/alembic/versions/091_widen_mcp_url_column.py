"""Widen workspace_mcp_servers.url to VARCHAR(1024) NULL.

Revision ID: 091_widen_mcp_url_column
Revises: 090_mcp_settings_redevelopment
Create Date: 2026-03-22

The legacy ``url`` column was VARCHAR(512) NOT NULL, which conflicts with the
authoritative ``url_or_command`` field (VARCHAR(1024), nullable).  Command-type
servers have no URL, and values longer than 512 chars were silently truncated
on mirror-write.  This migration widens the column and drops the NOT NULL
constraint so the two fields are consistent.
"""

from __future__ import annotations

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision: str = "091_widen_mcp_url_column"
down_revision: str = "090_mcp_settings_redevelopment"
branch_labels: None = None
depends_on: None = None


def upgrade() -> None:
    """Widen url to VARCHAR(1024) and allow NULL."""
    op.execute(
        text(
            "ALTER TABLE workspace_mcp_servers "
            "ALTER COLUMN url TYPE VARCHAR(1024), "
            "ALTER COLUMN url DROP NOT NULL"
        )
    )


def downgrade() -> None:
    """Restore url to VARCHAR(512) NOT NULL (backfill NULLs first)."""
    # Backfill NULLs with empty string so NOT NULL can be re-applied.
    op.execute(
        text(
            "UPDATE workspace_mcp_servers SET url = '' WHERE url IS NULL"
        )
    )
    op.execute(
        text(
            "ALTER TABLE workspace_mcp_servers "
            "ALTER COLUMN url TYPE VARCHAR(512), "
            "ALTER COLUMN url SET NOT NULL"
        )
    )
