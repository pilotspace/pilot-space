"""Unit tests for GraphCompilerService — topological sort and SKILL.md generation.

Tests cover: linear graphs, branching (condition), skill references,
transforms, empty graphs, cycle detection, and deterministic output.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest

from pilot_space.application.services.skill.graph_compiler_service import (
    GraphCompilePayload,
    GraphCompileResult,
    GraphCompilerError,
    GraphCompilerService,
)
from pilot_space.domain.exceptions import ValidationError


# ── Helpers ─────────────────────────────────────────────────────────────────


def _make_node(
    node_id: str,
    node_type: str,
    label: str,
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "id": node_id,
        "type": node_type,
        "position": {"x": 0, "y": 0},
        "data": {
            "nodeType": node_type,
            "label": label,
            "config": config or {},
        },
    }


def _make_edge(
    source: str,
    target: str,
    edge_type: str = "sequential",
) -> dict[str, Any]:
    return {
        "id": f"e{source}-{target}",
        "source": source,
        "target": target,
        "type": edge_type,
    }


def _make_graph(
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "nodes": nodes,
        "edges": edges,
        "viewport": {"x": 0, "y": 0, "zoom": 1},
    }


# ── Topological Sort Tests ─────────────────────────────────────────────────


class TestTopologicalSort:
    """Tests for topological_sort static method."""

    def test_compile_linear_graph(self) -> None:
        """3-node linear graph (Input -> Prompt -> Output) returns correct order."""
        nodes = [
            _make_node("1", "input", "Start"),
            _make_node("2", "prompt", "Ask Question", {"promptText": "What is X?"}),
            _make_node("3", "output", "Result"),
        ]
        edges = [
            _make_edge("1", "2"),
            _make_edge("2", "3"),
        ]

        sorted_nodes = GraphCompilerService.topological_sort(nodes, edges)

        ids = [n["id"] for n in sorted_nodes]
        assert ids == ["1", "2", "3"]

    def test_compile_branching_graph(self) -> None:
        """Condition node with true/false edges produces valid topological order."""
        nodes = [
            _make_node("1", "input", "Start"),
            _make_node("2", "condition", "Check", {"conditionExpression": "x > 0"}),
            _make_node("3", "prompt", "True Path", {"promptText": "Positive"}),
            _make_node("4", "prompt", "False Path", {"promptText": "Negative"}),
            _make_node("5", "output", "End"),
        ]
        edges = [
            _make_edge("1", "2"),
            _make_edge("2", "3", "true"),
            _make_edge("2", "4", "false"),
            _make_edge("3", "5"),
            _make_edge("4", "5"),
        ]

        sorted_nodes = GraphCompilerService.topological_sort(nodes, edges)

        ids = [n["id"] for n in sorted_nodes]
        # Input first, condition second, output last
        assert ids[0] == "1"
        assert ids[1] == "2"
        assert ids[-1] == "5"
        # Both branches before output
        assert "3" in ids and "4" in ids

    def test_compile_cycle_detection(self) -> None:
        """Cyclic graph raises ValidationError."""
        nodes = [
            _make_node("1", "prompt", "A"),
            _make_node("2", "prompt", "B"),
            _make_node("3", "prompt", "C"),
        ]
        edges = [
            _make_edge("1", "2"),
            _make_edge("2", "3"),
            _make_edge("3", "1"),  # cycle
        ]

        with pytest.raises(ValidationError, match="cycle"):
            GraphCompilerService.topological_sort(nodes, edges)

    def test_loop_edges_excluded(self) -> None:
        """Edges with type='loop' are excluded from topological sort."""
        nodes = [
            _make_node("1", "input", "Start"),
            _make_node("2", "prompt", "Loop Body"),
            _make_node("3", "output", "End"),
        ]
        edges = [
            _make_edge("1", "2"),
            _make_edge("2", "3"),
            _make_edge("3", "2", "loop"),  # loop edge — should be excluded
        ]

        sorted_nodes = GraphCompilerService.topological_sort(nodes, edges)
        ids = [n["id"] for n in sorted_nodes]
        assert ids == ["1", "2", "3"]


# ── SKILL.md Generation Tests ──────────────────────────────────────────────


class TestSkillContentGeneration:
    """Tests for _generate_skill_content static method."""

    def test_compile_linear_skill_content(self) -> None:
        """Linear graph produces SKILL.md with frontmatter and step sections."""
        nodes = [
            _make_node("1", "input", "Start"),
            _make_node("2", "prompt", "Ask Question", {"promptText": "What is X?"}),
            _make_node("3", "output", "Result"),
        ]
        edges = [_make_edge("1", "2"), _make_edge("2", "3")]
        sorted_nodes = GraphCompilerService.topological_sort(nodes, edges)
        graph_json = _make_graph(nodes, edges)

        content = GraphCompilerService._generate_skill_content(sorted_nodes, edges, graph_json)

        assert content.startswith("---\n")
        assert "description: Compiled from graph workflow" in content
        assert "## Input: Start" in content
        assert "## Step 1: Ask Question" in content
        assert "What is X?" in content
        assert "## Output: Result" in content

    def test_compile_with_skill_reference(self) -> None:
        """Skill node includes 'Invoke skill' instruction."""
        nodes = [
            _make_node("1", "input", "Start"),
            _make_node("2", "skill", "Summarize", {"skillName": "text-summarizer"}),
            _make_node("3", "output", "End"),
        ]
        edges = [_make_edge("1", "2"), _make_edge("2", "3")]
        sorted_nodes = GraphCompilerService.topological_sort(nodes, edges)
        graph_json = _make_graph(nodes, edges)

        content = GraphCompilerService._generate_skill_content(sorted_nodes, edges, graph_json)

        assert "Execute Skill" in content
        assert "text-summarizer" in content
        assert "Invoke skill" in content

    def test_compile_with_transform(self) -> None:
        """Transform node includes transformation template."""
        nodes = [
            _make_node("1", "input", "Start"),
            _make_node("2", "transform", "Format", {"transformTemplate": "upper(input)"}),
            _make_node("3", "output", "End"),
        ]
        edges = [_make_edge("1", "2"), _make_edge("2", "3")]
        sorted_nodes = GraphCompilerService.topological_sort(nodes, edges)
        graph_json = _make_graph(nodes, edges)

        content = GraphCompilerService._generate_skill_content(sorted_nodes, edges, graph_json)

        assert "Transform" in content
        assert "upper(input)" in content

    def test_compile_with_condition(self) -> None:
        """Condition node includes expression and branch instructions."""
        nodes = [
            _make_node("1", "input", "Start"),
            _make_node("2", "condition", "Check", {"conditionExpression": "x > 0"}),
            _make_node("3", "output", "End"),
        ]
        edges = [_make_edge("1", "2"), _make_edge("2", "3")]
        sorted_nodes = GraphCompilerService.topological_sort(nodes, edges)
        graph_json = _make_graph(nodes, edges)

        content = GraphCompilerService._generate_skill_content(sorted_nodes, edges, graph_json)

        assert "Condition" in content
        assert "x > 0" in content
        assert "true branch" in content
        assert "false branch" in content

    def test_compile_empty_graph(self) -> None:
        """Empty graph (no nodes) raises ValidationError."""
        with pytest.raises(ValidationError, match="no nodes"):
            GraphCompilerService.topological_sort([], [])

    def test_deterministic_output(self) -> None:
        """Same graph JSON always produces byte-identical SKILL.md."""
        nodes = [
            _make_node("1", "input", "Start"),
            _make_node("2", "prompt", "Q1", {"promptText": "Hello"}),
            _make_node("3", "prompt", "Q2", {"promptText": "World"}),
            _make_node("4", "output", "End"),
        ]
        edges = [
            _make_edge("1", "2"),
            _make_edge("1", "3"),
            _make_edge("2", "4"),
            _make_edge("3", "4"),
        ]
        graph_json = _make_graph(nodes, edges)

        results = []
        for _ in range(5):
            sorted_nodes = GraphCompilerService.topological_sort(nodes, edges)
            content = GraphCompilerService._generate_skill_content(sorted_nodes, edges, graph_json)
            results.append(content)

        # All 5 runs produce identical output
        assert all(r == results[0] for r in results)


# ── Error Class Tests ──────────────────────────────────────────────────────


class TestGraphCompilerError:
    """GraphCompilerError extends AppError correctly."""

    def test_error_attributes(self) -> None:
        err = GraphCompilerError("test failure")
        assert err.http_status == 422
        assert err.error_code == "graph_compile_error"
        assert str(err) == "test failure"

    def test_inherits_app_error(self) -> None:
        from pilot_space.domain.exceptions import AppError

        err = GraphCompilerError("x")
        assert isinstance(err, AppError)
