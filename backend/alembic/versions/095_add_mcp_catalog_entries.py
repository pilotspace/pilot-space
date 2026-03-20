"""Add mcp_catalog_entries table with seeded official entries.

Revision ID: 095_add_mcp_catalog_entries
Revises: 094_add_mcp_audit_index
Create Date: 2026-03-20

Phase 35 — MCPC-01, MCPC-04:
Creates the global mcp_catalog_entries table and seeds Context7 and GitHub
as official MCP server catalog entries. This table is not workspace-scoped
(no workspace_id FK) — catalog entries are the same for all workspaces.

The transport_type and auth_type columns reuse the existing PostgreSQL ENUM
types from migrations 091/093 (create_type=False).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "095_add_mcp_catalog_entries"
down_revision: str = "094_add_mcp_audit_index"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create mcp_catalog_entries table and seed official entries."""
    op.create_table(
        "mcp_catalog_entries",
        sa.Column(
            "id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("url_template", sa.String(512), nullable=False),
        sa.Column(
            "transport_type",
            sa.VARCHAR(8),
            nullable=False,
        ),
        sa.Column(
            "auth_type",
            sa.VARCHAR(8),
            nullable=False,
        ),
        sa.Column(
            "catalog_version",
            sa.String(32),
            nullable=False,
            server_default="1.0.0",
        ),
        sa.Column(
            "is_official",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("icon_url", sa.String(512), nullable=True),
        sa.Column("setup_instructions", sa.Text(), nullable=True),
        sa.Column(
            "sort_order",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("oauth_auth_url", sa.String(512), nullable=True),
        sa.Column("oauth_token_url", sa.String(512), nullable=True),
        sa.Column("oauth_scopes", sa.String(512), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.Column(
            "is_deleted",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )

    # Seed Context7 and GitHub official entries
    op.execute(
        """
        INSERT INTO mcp_catalog_entries (
            id, name, description, url_template, transport_type, auth_type,
            catalog_version, is_official, sort_order,
            setup_instructions,
            oauth_auth_url, oauth_token_url, oauth_scopes,
            created_at, updated_at, is_deleted
        ) VALUES
        (
            gen_random_uuid(),
            'Context7',
            'Up-to-date documentation for any library. Resolves version-specific API docs on demand.',
            'https://mcp.context7.com/mcp',
            'http',
            'bearer',
            '1.0.0',
            true,
            0,
            'Get your API key at https://context7.com — add it as the bearer token after install.',
            NULL, NULL, NULL,
            NOW(), NOW(), false
        ),
        (
            gen_random_uuid(),
            'GitHub',
            'Interact with GitHub repositories, issues, PRs, and code search via GitHub''s official MCP server.',
            'https://api.githubcopilot.com/mcp/',
            'http',
            'oauth2',
            '1.0.0',
            true,
            1,
            'Register a GitHub OAuth App at https://github.com/settings/developers with your app''s callback URL, then enter your client_id during install.',
            'https://github.com/login/oauth/authorize',
            'https://github.com/login/oauth/access_token',
            'repo read:user',
            NOW(), NOW(), false
        )
        """
    )


def downgrade() -> None:
    """Drop mcp_catalog_entries table."""
    op.drop_table("mcp_catalog_entries")
