"""PilotAPIKeyRepository — data access for CLI authentication keys.

All lookup operations work on key_hash (SHA-256 hex); plaintext keys are
never handled at this layer. Inherits soft-delete, pagination, and CRUD
from BaseRepository.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import select, update

from pilot_space.infrastructure.database.models.pilot_api_key import PilotAPIKey
from pilot_space.infrastructure.database.repositories.base import BaseRepository

if TYPE_CHECKING:
    from collections.abc import Sequence

    from sqlalchemy.ext.asyncio import AsyncSession


class PilotAPIKeyRepository(BaseRepository[PilotAPIKey]):
    """Repository for CLI API key CRUD and authentication lookups.

    All write operations use flush() so the caller's Unit of Work controls
    transaction commit/rollback. Read operations are side-effect free.
    """

    def __init__(self, session: AsyncSession) -> None:
        """Initialize with async session and bind model class.

        Args:
            session: The active async database session.
        """
        super().__init__(session=session, model_class=PilotAPIKey)

    async def get_by_key_hash(self, key_hash: str) -> PilotAPIKey | None:
        """Look up an active (non-deleted, non-expired) API key by SHA-256 hash.

        Used in the CLI authentication middleware. The caller must hash the raw
        bearer token with SHA-256 before calling this method.

        Args:
            key_hash: 64-char SHA-256 hex digest of the raw API key.

        Returns:
            The matching PilotAPIKey if it exists, is not soft-deleted,
            and has not expired. Returns None otherwise.
        """
        now = datetime.now(UTC)
        query = (
            select(PilotAPIKey)
            .where(
                PilotAPIKey.key_hash == key_hash,
                PilotAPIKey.is_deleted == False,  # noqa: E712
            )
            .where(
                # Accept keys with no expiry OR keys that haven't expired yet
                (PilotAPIKey.expires_at == None)  # noqa: E711
                | (PilotAPIKey.expires_at > now)
            )
        )
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def mark_last_used(self, key_id: UUID) -> None:
        """Update last_used_at to the current UTC time for a single key.

        Executed as a targeted UPDATE — avoids loading the full model into
        memory for a pure timestamp update on the hot authentication path.

        Args:
            key_id: UUID of the PilotAPIKey row to update.
        """
        await self.session.execute(
            update(PilotAPIKey)
            .where(PilotAPIKey.id == key_id)
            .values(last_used_at=datetime.now(UTC))
        )
        await self.session.flush()

    async def get_by_workspace(
        self,
        workspace_id: UUID,
        *,
        include_deleted: bool = False,
    ) -> Sequence[PilotAPIKey]:
        """List all API keys belonging to a workspace.

        Returns keys ordered by created_at descending (newest first) so the
        workspace settings UI can display recently created keys at the top.

        Args:
            workspace_id: UUID of the workspace whose keys to list.
            include_deleted: When True, soft-deleted keys are included.

        Returns:
            Sequence of PilotAPIKey rows ordered by created_at DESC.
        """
        query = select(PilotAPIKey).where(PilotAPIKey.workspace_id == workspace_id)
        if not include_deleted:
            query = query.where(PilotAPIKey.is_deleted == False)  # noqa: E712
        query = query.order_by(PilotAPIKey.created_at.desc())
        result = await self.session.execute(query)
        return result.scalars().all()

    async def get_by_user_and_workspace(
        self,
        user_id: UUID,
        workspace_id: UUID,
        *,
        include_deleted: bool = False,
    ) -> Sequence[PilotAPIKey]:
        """List all API keys for a specific user within a workspace.

        Useful for the "Manage CLI tokens" section in user settings where
        a user can see and revoke only their own keys.

        Args:
            user_id: UUID of the user whose keys to list.
            workspace_id: UUID of the workspace scope.
            include_deleted: When True, soft-deleted keys are included.

        Returns:
            Sequence of PilotAPIKey rows ordered by created_at DESC.
        """
        query = select(PilotAPIKey).where(
            PilotAPIKey.user_id == user_id,
            PilotAPIKey.workspace_id == workspace_id,
        )
        if not include_deleted:
            query = query.where(PilotAPIKey.is_deleted == False)  # noqa: E712
        query = query.order_by(PilotAPIKey.created_at.desc())
        result = await self.session.execute(query)
        return result.scalars().all()


__all__ = ["PilotAPIKeyRepository"]
