"""McpCatalogEntry SQLAlchemy model (Phase 35 — MCPC-01, MCPC-04).

Global (non-workspace-scoped) catalog of known MCP servers.
Catalog entries are shared across all workspaces — no workspace_id FK.
"""

from __future__ import annotations

from sqlalchemy import Boolean, Enum, Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from pilot_space.infrastructure.database.base import BaseModel
from pilot_space.infrastructure.database.models.workspace_mcp_server import (
    McpAuthType,
    McpTransportType,
)


class McpCatalogEntry(BaseModel):
    """Global MCP server catalog entry.

    Represents a known MCP server that can be installed into any workspace.
    Not workspace-scoped — the same catalog is visible to all authenticated users.

    Attributes:
        name: Unique human-readable server name.
        description: Short description shown in catalog UI.
        url_template: Default endpoint URL (may be customized at install time).
        transport_type: MCP transport protocol ('sse' or 'http').
        auth_type: Authentication mechanism ('bearer' or 'oauth2').
        catalog_version: Semver string for version drift detection.
        is_official: True for first-party/officially vetted entries.
        icon_url: Optional icon URL for catalog card.
        setup_instructions: Optional markdown install guide.
        sort_order: Display ordering in catalog UI (lower = first).
        oauth_auth_url: Pre-filled OAuth2 authorization URL (oauth2 entries only).
        oauth_token_url: Pre-filled OAuth2 token exchange URL (oauth2 entries only).
        oauth_scopes: Pre-filled OAuth2 scope list (oauth2 entries only).
    """

    __tablename__ = "mcp_catalog_entries"  # type: ignore[assignment]

    name: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
        unique=True,
        doc="Unique human-readable server name",
    )
    description: Mapped[str] = mapped_column(
        Text(),
        nullable=False,
        doc="Short description shown in catalog UI",
    )
    url_template: Mapped[str] = mapped_column(
        String(512),
        nullable=False,
        doc="Default endpoint URL (may be customized at install time)",
    )
    transport_type: Mapped[McpTransportType] = mapped_column(
        Enum(
            McpTransportType,
            name="mcp_transport_type",
            create_type=False,
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
        doc="MCP transport protocol: 'sse' or 'http'",
    )
    auth_type: Mapped[McpAuthType] = mapped_column(
        Enum(
            McpAuthType,
            name="mcp_auth_type",
            create_type=False,
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
        doc="Authentication mechanism: 'bearer' or 'oauth2'",
    )
    catalog_version: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        server_default="1.0.0",
        doc="Semver version string for update drift detection",
    )
    is_official: Mapped[bool] = mapped_column(
        Boolean(),
        nullable=False,
        server_default=text("false"),
        doc="True for first-party/officially vetted entries",
    )
    icon_url: Mapped[str | None] = mapped_column(
        String(512),
        nullable=True,
        doc="Optional icon URL for catalog card",
    )
    setup_instructions: Mapped[str | None] = mapped_column(
        Text(),
        nullable=True,
        doc="Optional markdown install guide",
    )
    sort_order: Mapped[int] = mapped_column(
        Integer(),
        nullable=False,
        server_default=text("0"),
        doc="Display ordering in catalog UI (lower = first)",
    )
    oauth_auth_url: Mapped[str | None] = mapped_column(
        String(512),
        nullable=True,
        doc="Pre-filled OAuth2 authorization URL (oauth2 entries only)",
    )
    oauth_token_url: Mapped[str | None] = mapped_column(
        String(512),
        nullable=True,
        doc="Pre-filled OAuth2 token exchange URL (oauth2 entries only)",
    )
    oauth_scopes: Mapped[str | None] = mapped_column(
        String(512),
        nullable=True,
        doc="Pre-filled OAuth2 scope list (oauth2 entries only)",
    )

    def __repr__(self) -> str:
        """Return string representation."""
        return (
            f"<McpCatalogEntry(id={self.id}, name={self.name!r}, is_official={self.is_official})>"
        )


__all__ = ["McpCatalogEntry"]
