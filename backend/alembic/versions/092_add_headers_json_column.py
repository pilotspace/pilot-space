"""Add headers_json plaintext column to workspace_mcp_servers.

Revision ID: 092_add_headers_json
Revises: 091_add_none_auth_type
Create Date: 2026-03-19

Phase 25 — Headers are not sensitive and should be stored as plaintext
so the API can return them for editing. Existing encrypted headers are
migrated to the new column.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "092_add_headers_json"
down_revision: str = "091_add_none_auth_type"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    op.add_column(
        "workspace_mcp_servers",
        sa.Column("headers_json", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("workspace_mcp_servers", "headers_json")
