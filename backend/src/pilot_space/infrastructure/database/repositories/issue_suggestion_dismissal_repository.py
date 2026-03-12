"""IssueSuggestionDismissalRepository — CRUD for per-user suggestion dismissals.

Provides:
- get_dismissed_target_ids: fast set lookup to filter suggestions
- create_dismissal: idempotent insert (UNIQUE constraint is the guard)
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pilot_space.infrastructure.database.models.issue_suggestion_dismissal import (
    IssueSuggestionDismissal,
)


class IssueSuggestionDismissalRepository:
    """Repository for IssueSuggestionDismissal persistence operations.

    Designed for direct instantiation with a session (SCIM/KG pattern) rather
    than DI container registration, since it is a lightweight per-request helper
    with no external client dependencies.
    """

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_dismissed_target_ids(
        self, user_id: uuid.UUID, source_issue_id: uuid.UUID
    ) -> set[uuid.UUID]:
        """Return the set of target_issue_ids dismissed by user for source_issue.

        Used to filter out dismissed suggestions before returning the suggestions
        list to the client. Set semantics allow O(1) membership checks.

        Args:
            user_id: Authenticated user requesting suggestions.
            source_issue_id: Issue for which suggestions were requested.

        Returns:
            Set of UUID target_issue_ids already dismissed by this user.
        """
        result = await self._session.execute(
            select(IssueSuggestionDismissal.target_issue_id).where(
                IssueSuggestionDismissal.user_id == user_id,
                IssueSuggestionDismissal.source_issue_id == source_issue_id,
            )
        )
        return {row[0] for row in result.all()}

    async def create_dismissal(
        self,
        workspace_id: uuid.UUID,
        user_id: uuid.UUID,
        source_issue_id: uuid.UUID,
        target_issue_id: uuid.UUID,
    ) -> IssueSuggestionDismissal:
        """Persist a suggestion dismissal.

        The UNIQUE constraint on (user_id, source_issue_id, target_issue_id)
        acts as the idempotency guard. Callers should catch IntegrityError and
        treat it as a no-op (already dismissed).

        Args:
            workspace_id: Workspace scope for RLS.
            user_id: User dismissing the suggestion.
            source_issue_id: Issue for which the suggestion was shown.
            target_issue_id: Suggested issue being dismissed.

        Returns:
            Newly created IssueSuggestionDismissal with server-assigned dismissed_at.
        """
        dismissal = IssueSuggestionDismissal(
            workspace_id=workspace_id,
            user_id=user_id,
            source_issue_id=source_issue_id,
            target_issue_id=target_issue_id,
        )
        self._session.add(dismissal)
        await self._session.flush()
        return dismissal
