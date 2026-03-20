"""Add catalog_entry_id and installed_catalog_version to workspace_mcp_servers.

Revision ID: 096_add_catalog_fk
Revises: 095_add_mcp_catalog_entries
Create Date: 2026-03-20

Phase 35 — MCPC-02, MCPC-03:
Adds two nullable columns to workspace_mcp_servers to track which catalog
entry a registered server was installed from and at what version.

- catalog_entry_id: UUID FK nullable → mcp_catalog_entries(id) ON DELETE SET NULL
- installed_catalog_version: VARCHAR(32) nullable — version string at install time

These columns enable version drift detection: when catalog_version !=
installed_catalog_version, the UI shows an update badge (MCPC-03).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "096_add_catalog_fk"
down_revision: str = "095_add_mcp_catalog_entries"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add catalog FK columns to workspace_mcp_servers."""
    op.add_column(
        "workspace_mcp_servers",
        sa.Column(
            "catalog_entry_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.add_column(
        "workspace_mcp_servers",
        sa.Column(
            "installed_catalog_version",
            sa.String(32),
            nullable=True,
        ),
    )
    op.create_foreign_key(
        "fk_workspace_mcp_servers_catalog_entry_id",
        "workspace_mcp_servers",
        "mcp_catalog_entries",
        ["catalog_entry_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    """Drop catalog FK columns from workspace_mcp_servers."""
    op.drop_constraint(
        "fk_workspace_mcp_servers_catalog_entry_id",
        "workspace_mcp_servers",
        type_="foreignkey",
    )
    op.drop_column("workspace_mcp_servers", "installed_catalog_version")
    op.drop_column("workspace_mcp_servers", "catalog_entry_id")
