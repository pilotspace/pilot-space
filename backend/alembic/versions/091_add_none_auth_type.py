"""Add 'none' value to mcp_auth_type enum.

Revision ID: 091_add_none_auth_type
Revises: 090_mcp_settings_redevelopment
Create Date: 2026-03-19

Adds 'none' as a valid auth_type for MCP servers that require no authentication.
Existing rows are unchanged (they keep 'bearer' or 'oauth2').

Note: PostgreSQL ALTER TYPE ... ADD VALUE cannot run inside a transaction.
Alembic must be configured with transaction_per_migration=False or this
migration uses op.execute with autocommit.
"""

from __future__ import annotations

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision: str = "091_add_none_auth_type"
down_revision: str = "090_mcp_settings_redevelopment"
branch_labels: None = None
depends_on: None = None


def upgrade() -> None:
    """Add 'none' value to mcp_auth_type enum."""
    # ADD VALUE is a non-transactional DDL in PostgreSQL.
    # Using IF NOT EXISTS for idempotency.
    op.execute(
        text("ALTER TYPE mcp_auth_type ADD VALUE IF NOT EXISTS 'none' BEFORE 'bearer'")
    )


def downgrade() -> None:
    """No-op: PostgreSQL does not support removing enum values."""
    pass
