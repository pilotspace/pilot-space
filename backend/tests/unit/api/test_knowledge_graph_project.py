"""Unit tests for the project-scoped Knowledge Graph endpoint.

Tests cover:
- 404 when project doesn't exist
- Empty response when no graph node exists for project
- Successful subgraph return when graph node exists
- GitHub node synthesis from project issues' integration_links

Feature 016: Knowledge Graph — Project-scoped endpoint
"""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException

from pilot_space.api.v1.routers.knowledge_graph import (
    get_project_knowledge_graph,
)
from pilot_space.api.v1.schemas.knowledge_graph import GraphResponse

pytestmark = pytest.mark.asyncio

# ---------------------------------------------------------------------------
# Fixed test identifiers
# ---------------------------------------------------------------------------

TEST_USER_ID = UUID("aaaaaaaa-0000-0000-0000-000000000001")
TEST_WORKSPACE_ID = UUID("bbbbbbbb-0000-0000-0000-000000000002")
TEST_NODE_ID = UUID("cccccccc-0000-0000-0000-000000000003")
TEST_PROJECT_ID = UUID("eeeeeeee-0000-0000-0000-000000000005")

# ---------------------------------------------------------------------------
# Helper factories
# ---------------------------------------------------------------------------


def _make_graph_node(
    node_id: UUID | None = None,
    node_type: str = "project",
    label: str = "Test Project",
) -> MagicMock:
    """Build a mock GraphNode domain object."""
    from pilot_space.domain.graph_node import NodeType

    node = MagicMock()
    node.id = node_id or uuid4()
    node.node_type = NodeType(node_type)
    node.label = label
    node.summary = f"Summary for {label}"
    node.properties = {}
    node.created_at = datetime.now(tz=UTC)
    node.updated_at = datetime.now(tz=UTC)
    return node


def _make_graph_edge(
    source_id: UUID | None = None,
    target_id: UUID | None = None,
    edge_type: str = "relates_to",
) -> MagicMock:
    """Build a mock GraphEdge domain object."""
    from pilot_space.domain.graph_edge import EdgeType

    edge = MagicMock()
    edge.id = uuid4()
    edge.source_id = source_id or uuid4()
    edge.target_id = target_id or uuid4()
    edge.edge_type = EdgeType(edge_type)
    edge.weight = 0.8
    edge.properties = {}
    return edge


def _make_integration_link_mock(
    link_type: str = "pull_request",
    title: str = "feat: add something",
    external_id: str = "123",
) -> MagicMock:
    """Build a mock IntegrationLink model."""
    from pilot_space.infrastructure.database.models.integration import IntegrationLinkType

    link = MagicMock()
    link.workspace_id = TEST_WORKSPACE_ID
    link.link_type = IntegrationLinkType(link_type)
    link.title = title
    link.external_id = external_id
    link.external_url = f"https://github.com/repo/pull/{external_id}"
    link.author_name = "dev"
    link.is_deleted = False
    return link


def _make_repo(**kwargs: object) -> AsyncMock:
    """Build a mock KnowledgeGraphRepository."""
    repo = AsyncMock()
    repo.get_subgraph = AsyncMock(return_value=([], []))
    for key, value in kwargs.items():
        setattr(repo, key, value)
    return repo


def _make_sequential_session(*responses: dict[str, object]) -> AsyncMock:
    """Build a mock AsyncSession returning different results on successive execute calls."""
    call_index = 0

    async def _execute(stmt: object, *args: object, **kwargs: object) -> object:
        nonlocal call_index
        idx = min(call_index, len(responses) - 1)
        call_index += 1
        spec = responses[idx]
        result = MagicMock()
        result.scalar_one_or_none = MagicMock(return_value=spec.get("scalar"))
        scalars_mock = MagicMock()
        scalars_mock.all = MagicMock(return_value=spec.get("scalars_all") or [])
        result.scalars = MagicMock(return_value=scalars_mock)
        return result

    session = AsyncMock()
    session.execute = AsyncMock(side_effect=_execute)
    return session


# Shared patch targets
_RLS_PATCH = "pilot_space.api.v1.routers.knowledge_graph.set_rls_context"
_REPO_PATCH = "pilot_space.api.v1.routers.knowledge_graph.KnowledgeGraphRepository"


def _default_kwargs(**overrides: object) -> dict[str, object]:
    """Build default kwargs for get_project_knowledge_graph."""
    defaults: dict[str, object] = {
        "workspace_id": TEST_WORKSPACE_ID,
        "project_id": TEST_PROJECT_ID,
        "current_user_id": TEST_USER_ID,
        "depth": 2,
        "node_types": None,
        "max_nodes": 50,
        "include_github": False,
    }
    defaults.update(overrides)
    return defaults


# ---------------------------------------------------------------------------
# Test: 404 path
# ---------------------------------------------------------------------------


class TestProjectKnowledgeGraph404:
    """GET /workspaces/{wid}/projects/{pid}/knowledge-graph — not found."""

    async def test_returns_404_with_correct_detail(self) -> None:
        """Non-existent project raises 404 with 'Project not found' detail."""
        session = _make_sequential_session({"scalar": None})
        repo = _make_repo()

        with (
            patch(_RLS_PATCH, new_callable=AsyncMock),
            patch(_REPO_PATCH, return_value=repo),
            pytest.raises(HTTPException) as exc_info,
        ):
            await get_project_knowledge_graph(session=session, **_default_kwargs())  # type: ignore[arg-type]

        assert exc_info.value.status_code == 404
        assert exc_info.value.detail == "Project not found"
        repo.get_subgraph.assert_not_awaited()


# ---------------------------------------------------------------------------
# Test: empty graph path
# ---------------------------------------------------------------------------


class TestProjectKnowledgeGraphEmpty:
    """Returns empty GraphResponse when project has no graph node."""

    async def test_returns_empty_without_calling_subgraph(self) -> None:
        """Project exists but has no graph node → empty GraphResponse, no subgraph call."""
        session = _make_sequential_session(
            {"scalar": TEST_PROJECT_ID},
            {"scalar": None},
        )
        repo = _make_repo()

        with (
            patch(_RLS_PATCH, new_callable=AsyncMock),
            patch(_REPO_PATCH, return_value=repo),
        ):
            result = await get_project_knowledge_graph(session=session, **_default_kwargs())  # type: ignore[arg-type]

        assert isinstance(result, GraphResponse)
        assert result.nodes == []
        assert result.edges == []
        assert result.center_node_id == TEST_PROJECT_ID
        repo.get_subgraph.assert_not_awaited()


# ---------------------------------------------------------------------------
# Test: success path
# ---------------------------------------------------------------------------


def _make_gn_model() -> MagicMock:
    """Build a mock graph node model for the project."""
    gn = MagicMock()
    gn.id = TEST_NODE_ID
    gn.workspace_id = TEST_WORKSPACE_ID
    gn.is_deleted = False
    return gn


class TestProjectKnowledgeGraphSuccess:
    """Successful subgraph return when project graph node exists."""

    async def test_returns_subgraph_when_graph_node_exists(self) -> None:
        """Project with graph node returns populated GraphResponse."""
        project_node = _make_graph_node(node_id=TEST_NODE_ID, node_type="project", label="MyApp")
        issue_node = _make_graph_node(node_type="issue", label="PS-1")
        edge = _make_graph_edge(source_id=TEST_NODE_ID, target_id=issue_node.id)

        session = _make_sequential_session(
            {"scalar": TEST_PROJECT_ID},
            {"scalar": _make_gn_model()},
        )
        repo = _make_repo(get_subgraph=AsyncMock(return_value=([project_node, issue_node], [edge])))

        with (
            patch(_RLS_PATCH, new_callable=AsyncMock),
            patch(_REPO_PATCH, return_value=repo),
        ):
            result = await get_project_knowledge_graph(session=session, **_default_kwargs())  # type: ignore[arg-type]

        assert isinstance(result, GraphResponse)
        assert len(result.nodes) == 2
        assert len(result.edges) == 1
        assert result.center_node_id == TEST_NODE_ID

    async def test_depth_and_max_nodes_forwarded_to_subgraph(self) -> None:
        """depth and max_nodes query params are forwarded to get_subgraph."""
        session = _make_sequential_session(
            {"scalar": TEST_PROJECT_ID},
            {"scalar": _make_gn_model()},
        )
        repo = _make_repo()

        with (
            patch(_RLS_PATCH, new_callable=AsyncMock),
            patch(_REPO_PATCH, return_value=repo),
        ):
            await get_project_knowledge_graph(  # type: ignore[arg-type]
                session=session, **_default_kwargs(depth=3, max_nodes=75)
            )

        call_kwargs = repo.get_subgraph.call_args.kwargs
        assert call_kwargs["max_depth"] == 3
        assert call_kwargs["max_nodes"] == 75

    async def test_node_type_filter_applied(self) -> None:
        """node_types param filters out non-matching nodes from subgraph."""
        project_node = _make_graph_node(node_id=TEST_NODE_ID, node_type="project", label="MyApp")
        issue_node = _make_graph_node(node_type="issue", label="PS-1")
        note_node = _make_graph_node(node_type="note", label="Note")

        session = _make_sequential_session(
            {"scalar": TEST_PROJECT_ID},
            {"scalar": _make_gn_model()},
        )
        repo = _make_repo(
            get_subgraph=AsyncMock(return_value=([project_node, issue_node, note_node], []))
        )

        with (
            patch(_RLS_PATCH, new_callable=AsyncMock),
            patch(_REPO_PATCH, return_value=repo),
        ):
            result = await get_project_knowledge_graph(  # type: ignore[arg-type]
                session=session, **_default_kwargs(node_types="issue")
            )

        assert all(n.node_type == "issue" for n in result.nodes)

    async def test_sorts_nodes_by_importance_tier(self) -> None:
        """Nodes are sorted with issues/notes first, then PR/branch, then others."""
        skill_node = _make_graph_node(node_type="skill_outcome", label="Skill")
        issue_node = _make_graph_node(node_type="issue", label="Issue")
        pr_node = _make_graph_node(node_type="pull_request", label="PR")

        session = _make_sequential_session(
            {"scalar": TEST_PROJECT_ID},
            {"scalar": _make_gn_model()},
        )
        repo = _make_repo(
            get_subgraph=AsyncMock(return_value=([skill_node, pr_node, issue_node], []))
        )

        with (
            patch(_RLS_PATCH, new_callable=AsyncMock),
            patch(_REPO_PATCH, return_value=repo),
        ):
            result = await get_project_knowledge_graph(session=session, **_default_kwargs())  # type: ignore[arg-type]

        assert result.nodes[0].node_type == "issue"
        assert result.nodes[-1].node_type == "skill_outcome"

    async def test_synthesizes_github_nodes_from_project_issues(self) -> None:
        """include_github=true with integration links appends ephemeral PR nodes."""
        pr_link = _make_integration_link_mock(link_type="pull_request", title="feat: new feature")
        project_node = _make_graph_node(node_id=TEST_NODE_ID, node_type="project", label="MyApp")

        session = _make_sequential_session(
            {"scalar": TEST_PROJECT_ID},
            {"scalar": _make_gn_model()},
            {"scalars_all": [pr_link]},
        )
        repo = _make_repo(get_subgraph=AsyncMock(return_value=([project_node], [])))

        with (
            patch(_RLS_PATCH, new_callable=AsyncMock),
            patch(_REPO_PATCH, return_value=repo),
        ):
            result = await get_project_knowledge_graph(  # type: ignore[arg-type]
                session=session, **_default_kwargs(include_github=True)
            )

        assert len(result.nodes) >= 2
        gh_nodes = [n for n in result.nodes if n.node_type == "pull_request"]
        assert len(gh_nodes) == 1
        assert gh_nodes[0].properties.get("ephemeral") is True

    async def test_include_github_false_skips_link_query(self) -> None:
        """include_github=False does not query integration_links."""
        project_node = _make_graph_node(node_id=TEST_NODE_ID, node_type="project", label="MyApp")

        session = _make_sequential_session(
            {"scalar": TEST_PROJECT_ID},
            {"scalar": _make_gn_model()},
        )
        repo = _make_repo(get_subgraph=AsyncMock(return_value=([project_node], [])))

        with (
            patch(_RLS_PATCH, new_callable=AsyncMock),
            patch(_REPO_PATCH, return_value=repo),
        ):
            result = await get_project_knowledge_graph(session=session, **_default_kwargs())  # type: ignore[arg-type]

        assert len(result.nodes) == 1
        assert session.execute.await_count == 2

    async def test_rls_context_called_with_correct_args(self) -> None:
        """set_rls_context is called with session, user_id, and workspace_id."""
        session = _make_sequential_session({"scalar": None})

        with (
            patch(_RLS_PATCH, new_callable=AsyncMock) as mock_rls,
            patch(_REPO_PATCH),
            pytest.raises(HTTPException, match="Project not found"),
        ):
            await get_project_knowledge_graph(session=session, **_default_kwargs())  # type: ignore[arg-type]

        mock_rls.assert_awaited_once_with(session, TEST_USER_ID, TEST_WORKSPACE_ID)
