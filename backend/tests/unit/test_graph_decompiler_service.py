"""Tests for GraphDecompilerService heuristic decompilation.

Phase 053: Graph-to-Skill Compiler
"""

from __future__ import annotations

import pytest

from pilot_space.application.services.skill.graph_decompiler_service import (
    GraphDecompilerService,
)


class TestHeuristicDecompile:
    """Test the static _heuristic_decompile fallback."""

    def test_simple_three_section_skill(self) -> None:
        """Three-section skill produces input + 3 step nodes + output."""
        content = """\
## Gather Context
Collect relevant code files and documentation.

## Analyze Code
Review the code for potential issues and improvements.

## Generate Report
Create a structured report of findings.
"""
        result = GraphDecompilerService._heuristic_decompile(content)

        nodes = result["nodes"]
        edges = result["edges"]

        # input + 3 sections + output = 5 nodes
        assert len(nodes) == 5
        # Sequential edges: 4 (input->1, 1->2, 2->3, 3->output)
        assert len(edges) == 4

        # First node is input, last is output
        assert nodes[0]["data"]["nodeType"] == "input"
        assert nodes[-1]["data"]["nodeType"] == "output"

        # Middle nodes are prompt type (no condition keywords)
        for node in nodes[1:4]:
            assert node["data"]["nodeType"] == "prompt"

        # Check labels
        assert nodes[1]["data"]["label"] == "Gather Context"
        assert nodes[2]["data"]["label"] == "Analyze Code"
        assert nodes[3]["data"]["label"] == "Generate Report"

    def test_condition_section_detected(self) -> None:
        """Section mentioning 'if' or 'condition' becomes a condition node."""
        content = """\
## Check Input
Validate the user input.

## If Valid Input
If the input is valid, proceed with processing.
Otherwise, return an error.

## Process Data
Transform the validated data.
"""
        result = GraphDecompilerService._heuristic_decompile(content)

        nodes = result["nodes"]
        node_types = [n["data"]["nodeType"] for n in nodes]

        # Should detect condition node
        assert "condition" in node_types

    def test_empty_content_returns_minimal_graph(self) -> None:
        """Empty skill content returns input -> output minimal graph."""
        result = GraphDecompilerService._heuristic_decompile("")

        nodes = result["nodes"]
        edges = result["edges"]

        assert len(nodes) == 2
        assert len(edges) == 1
        assert nodes[0]["data"]["nodeType"] == "input"
        assert nodes[1]["data"]["nodeType"] == "output"

    def test_graph_json_structure_validation(self) -> None:
        """Each node has required fields: id, type, position, data.nodeType."""
        content = """\
## Step One
Do something.

## Step Two
Do something else.
"""
        result = GraphDecompilerService._heuristic_decompile(content)

        for node in result["nodes"]:
            assert "id" in node, f"Node missing 'id': {node}"
            assert "type" in node, f"Node missing 'type': {node}"
            assert "position" in node, f"Node missing 'position': {node}"
            assert "x" in node["position"] and "y" in node["position"]
            assert "data" in node, f"Node missing 'data': {node}"
            assert "nodeType" in node["data"], f"Node data missing 'nodeType': {node}"
            assert "label" in node["data"], f"Node data missing 'label': {node}"

        for edge in result["edges"]:
            assert "id" in edge
            assert "source" in edge
            assert "target" in edge
            assert "type" in edge

    def test_frontmatter_stripped(self) -> None:
        """YAML frontmatter is stripped before section parsing."""
        content = """\
---
description: Test skill
node_count: 2
---

## Parse Input
Parse the incoming data.

## Generate Output
Produce the final result.
"""
        result = GraphDecompilerService._heuristic_decompile(content)

        nodes = result["nodes"]
        # input + 2 sections + output = 4
        assert len(nodes) == 4
        # Frontmatter text should not appear as a node label
        labels = [n["data"]["label"] for n in nodes]
        assert "description: Test skill" not in labels

    def test_transform_section_detected(self) -> None:
        """Section mentioning 'transform' or 'format' becomes a transform node."""
        content = """\
## Gather Data
Collect the raw data.

## Format Output
Transform and format the data into JSON.
"""
        result = GraphDecompilerService._heuristic_decompile(content)

        nodes = result["nodes"]
        node_types = [n["data"]["nodeType"] for n in nodes]

        assert "transform" in node_types

    def test_vertical_layout_positions(self) -> None:
        """Nodes are positioned 150px apart vertically starting at y=0."""
        content = """\
## A
Step A.

## B
Step B.

## C
Step C.
"""
        result = GraphDecompilerService._heuristic_decompile(content)

        nodes = result["nodes"]
        for i, node in enumerate(nodes):
            assert node["position"]["y"] == i * 150
            assert node["position"]["x"] == 250


class TestValidateGraphJson:
    """Test the _validate_graph_json static method."""

    def test_valid_graph_passes(self) -> None:
        """A well-formed graph passes validation."""
        graph = {
            "nodes": [
                {"id": "1", "data": {"nodeType": "input"}},
                {"id": "2", "data": {"nodeType": "output"}},
            ],
            "edges": [],
        }
        # Should not raise
        GraphDecompilerService._validate_graph_json(graph)

    def test_missing_nodes_key_raises(self) -> None:
        """Graph without 'nodes' raises GraphDecompilerError."""
        from pilot_space.application.services.skill.graph_decompiler_service import (
            GraphDecompilerError,
        )

        with pytest.raises(GraphDecompilerError, match="nodes"):
            GraphDecompilerService._validate_graph_json({"edges": []})

    def test_node_missing_id_raises(self) -> None:
        """Node without 'id' raises GraphDecompilerError."""
        from pilot_space.application.services.skill.graph_decompiler_service import (
            GraphDecompilerError,
        )

        graph = {"nodes": [{"data": {"nodeType": "input"}}]}
        with pytest.raises(GraphDecompilerError, match="missing 'id'"):
            GraphDecompilerService._validate_graph_json(graph)

    def test_node_missing_node_type_raises(self) -> None:
        """Node without 'data.nodeType' raises GraphDecompilerError."""
        from pilot_space.application.services.skill.graph_decompiler_service import (
            GraphDecompilerError,
        )

        graph = {"nodes": [{"id": "1", "data": {"label": "test"}}]}
        with pytest.raises(GraphDecompilerError, match="nodeType"):
            GraphDecompilerService._validate_graph_json(graph)
