"""Service layer for skill graph CRUD operations.

Delegates persistence to SkillGraphRepository and owns transaction-level
business logic (upsert-by-template semantics).

Source: Phase 52, P52-03
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from pilot_space.domain.exceptions import NotFoundError
from pilot_space.infrastructure.logging import get_logger

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from pilot_space.api.v1.schemas.skill_graph import SkillGraphCreate, SkillGraphUpdate
    from pilot_space.infrastructure.database.models.skill_graph import SkillGraph
    from pilot_space.infrastructure.database.repositories.skill_graph_repository import (
        SkillGraphRepository,
    )

logger = get_logger(__name__)


class SkillGraphService:
    """CRUD service for skill graphs.

    Args:
        session: Request-scoped async database session.
        repo: Skill graph repository instance.
    """

    def __init__(
        self,
        session: AsyncSession,
        repo: SkillGraphRepository,
    ) -> None:
        self._session = session
        self._repo = repo

    async def create(
        self,
        workspace_id: UUID,
        payload: SkillGraphCreate,
    ) -> SkillGraph:
        """Create a new skill graph.

        Args:
            workspace_id: Owning workspace UUID.
            payload: Creation payload with template ID and graph data.

        Returns:
            Newly created SkillGraph.
        """
        graph = await self._repo.create(
            workspace_id=workspace_id,
            skill_template_id=payload.skill_template_id,
            graph_json=payload.graph_json,
            node_count=payload.node_count,
            edge_count=payload.edge_count,
        )
        logger.info(
            "[SkillGraph] Created graph=%s workspace=%s template=%s",
            graph.id,
            workspace_id,
            payload.skill_template_id,
        )
        return graph

    async def get(self, graph_id: UUID) -> SkillGraph:
        """Get a skill graph by ID.

        Args:
            graph_id: The skill graph UUID.

        Returns:
            The requested SkillGraph.

        Raises:
            NotFoundError: If graph does not exist.
        """
        graph = await self._repo.get_by_id(graph_id)
        if graph is None:
            raise NotFoundError("Skill graph not found")
        return graph

    async def update(
        self,
        graph_id: UUID,
        payload: SkillGraphUpdate,
    ) -> SkillGraph:
        """Update an existing skill graph.

        Args:
            graph_id: The skill graph UUID.
            payload: Update payload with graph JSON and counts.

        Returns:
            Updated SkillGraph.

        Raises:
            NotFoundError: If graph does not exist.
        """
        graph = await self._repo.get_by_id(graph_id)
        if graph is None:
            raise NotFoundError("Skill graph not found")

        graph.graph_json = payload.graph_json
        graph.node_count = payload.node_count
        graph.edge_count = payload.edge_count

        updated = await self._repo.update(graph)
        logger.info("[SkillGraph] Updated graph=%s", graph_id)
        return updated

    async def upsert_by_template(
        self,
        workspace_id: UUID,
        skill_template_id: UUID,
        payload: SkillGraphUpdate,
    ) -> SkillGraph:
        """Upsert a skill graph by template ID.

        If a graph exists for the given template, update it.
        Otherwise, create a new one.

        Args:
            workspace_id: Owning workspace UUID.
            skill_template_id: Parent skill template UUID.
            payload: Graph data to set.

        Returns:
            Created or updated SkillGraph.
        """
        existing = await self._repo.get_by_template(skill_template_id)
        if existing is not None:
            existing.graph_json = payload.graph_json
            existing.node_count = payload.node_count
            existing.edge_count = payload.edge_count
            updated = await self._repo.update(existing)
            logger.info(
                "[SkillGraph] Upsert (update) graph=%s template=%s",
                updated.id,
                skill_template_id,
            )
            return updated

        graph = await self._repo.create(
            workspace_id=workspace_id,
            skill_template_id=skill_template_id,
            graph_json=payload.graph_json,
            node_count=payload.node_count,
            edge_count=payload.edge_count,
        )
        logger.info(
            "[SkillGraph] Upsert (create) graph=%s template=%s",
            graph.id,
            skill_template_id,
        )
        return graph


__all__ = ["SkillGraphService"]
