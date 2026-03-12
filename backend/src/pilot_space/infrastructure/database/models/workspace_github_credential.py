"""WorkspaceGithubCredential SQLAlchemy model.

Stores one encrypted GitHub PAT per workspace for plugin installation.

Source: Phase 19, SKRG-03
"""

from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from pilot_space.infrastructure.database.base import WorkspaceScopedModel


class WorkspaceGithubCredential(WorkspaceScopedModel):
    """Encrypted GitHub PAT for a workspace.

    One row per workspace — upsert pattern (get existing or create new).
    PAT is Fernet-encrypted via encrypt_api_key() before storage.

    Attributes:
        pat_encrypted: Fernet-encrypted GitHub personal access token.
        created_by: User who configured this credential.
    """

    __tablename__ = "workspace_github_credentials"  # type: ignore[assignment]

    pat_encrypted: Mapped[str] = mapped_column(
        String(1024),
        nullable=False,
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    def __repr__(self) -> str:
        """Return string representation."""
        return (
            f"<WorkspaceGithubCredential(workspace_id={self.workspace_id}, "
            f"created_by={self.created_by})>"
        )


__all__ = ["WorkspaceGithubCredential"]
