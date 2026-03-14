"""Unit tests for project RAG helper functions."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID, uuid4

from pilot_space.ai.mcp.project_rag_helpers import (
    filter_nodes_by_project,
    format_knowledge_summary,
    format_search_results,
)


@dataclass
class _FakeNode:
    node_type: str = "issue"
    label: str = "Test Issue"
    content: str = "Some content here"
    external_id: UUID | None = None
    properties: dict[str, Any] | None = None


@dataclass
class _FakeScoredNode:
    node: _FakeNode
    score: float = 0.85


@dataclass
class _FakeProject:
    id: UUID
    identifier: str = "PROJ"


@dataclass
class _FakeSearchResult:
    nodes: list[_FakeScoredNode]
    edges: list[Any]
    query: str = "test query"
    embedding_used: bool = True


class TestFilterNodesByProject:
    """Test filter_nodes_by_project."""

    def test_filters_by_project_id(self) -> None:
        project_id = uuid4()
        project = _FakeProject(id=project_id)

        matching = _FakeScoredNode(
            node=_FakeNode(properties={"project_id": str(project_id)}),
        )
        non_matching = _FakeScoredNode(
            node=_FakeNode(properties={"project_id": str(uuid4())}),
        )
        result = _FakeSearchResult(nodes=[matching, non_matching], edges=[])

        filtered = filter_nodes_by_project(result, project)  # type: ignore[arg-type]
        assert len(filtered) == 1
        assert filtered[0] is matching

    def test_filters_by_project_identifier(self) -> None:
        project = _FakeProject(id=uuid4(), identifier="AUTH")

        matching = _FakeScoredNode(
            node=_FakeNode(properties={"project_identifier": "AUTH"}),
        )
        non_matching = _FakeScoredNode(
            node=_FakeNode(properties={"project_identifier": "OTHER"}),
        )
        result = _FakeSearchResult(nodes=[matching, non_matching], edges=[])

        filtered = filter_nodes_by_project(result, project)  # type: ignore[arg-type]
        assert len(filtered) == 1

    def test_empty_results(self) -> None:
        project = _FakeProject(id=uuid4())
        result = _FakeSearchResult(nodes=[], edges=[])
        filtered = filter_nodes_by_project(result, project)  # type: ignore[arg-type]
        assert filtered == []

    def test_no_properties_skipped(self) -> None:
        project = _FakeProject(id=uuid4())
        node_no_props = _FakeScoredNode(node=_FakeNode(properties=None))
        result = _FakeSearchResult(nodes=[node_no_props], edges=[])
        filtered = filter_nodes_by_project(result, project)  # type: ignore[arg-type]
        assert filtered == []


class TestFormatSearchResults:
    """Test format_search_results."""

    def test_formats_correctly(self) -> None:
        ext_id = uuid4()
        node = _FakeNode(
            node_type="issue",
            label="Bug Fix",
            content="Fix the login bug",
            external_id=ext_id,
            properties={"priority": "high", "state": "open", "internal_note": "hidden"},
        )
        scored = _FakeScoredNode(node=node, score=0.9123)

        results = format_search_results([scored])
        assert len(results) == 1
        r = results[0]
        assert r["node_type"] == "issue"
        assert r["label"] == "Bug Fix"
        assert r["score"] == 0.9123
        assert r["external_id"] == str(ext_id)
        assert r["properties"]["priority"] == "high"
        assert "internal_note" not in r["properties"]

    def test_truncates_content(self) -> None:
        node = _FakeNode(content="x" * 1000)
        scored = _FakeScoredNode(node=node)
        results = format_search_results([scored], max_content=100)
        assert len(results[0]["content"]) == 100

    def test_handles_none_external_id(self) -> None:
        node = _FakeNode(external_id=None)
        scored = _FakeScoredNode(node=node)
        results = format_search_results([scored])
        assert results[0]["external_id"] is None


class TestFormatKnowledgeSummary:
    """Test format_knowledge_summary."""

    def test_summary_structure(self) -> None:
        all_nodes = [_FakeScoredNode(node=_FakeNode()) for _ in range(5)]
        project_nodes = all_nodes[:3]
        result = _FakeSearchResult(nodes=all_nodes, edges=[])

        summary = format_knowledge_summary(result, project_nodes)  # type: ignore[arg-type]
        assert summary["total_nodes_found"] == 5
        assert summary["project_relevant"] == 3
        assert summary["embedding_used"] is True
        assert len(summary["nodes"]) == 3

    def test_limits_nodes(self) -> None:
        nodes = [_FakeScoredNode(node=_FakeNode()) for _ in range(20)]
        result = _FakeSearchResult(nodes=nodes, edges=[])

        summary = format_knowledge_summary(result, nodes, max_nodes=5)  # type: ignore[arg-type]
        assert len(summary["nodes"]) == 5
