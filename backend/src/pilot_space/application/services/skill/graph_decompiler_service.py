"""GraphDecompilerService: reverse-engineer SKILL.md into graph JSON.

Analyzes SKILL.md content (via AI or heuristic fallback) and produces a
React Flow-compatible graph representation with nodes and edges.

Phase 053: Graph-to-Skill Compiler
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any
from uuid import UUID

from pilot_space.ai.prompts.graph_decompiler import get_graph_decompile_system_prompt
from pilot_space.domain.exceptions import AppError, ValidationError
from pilot_space.infrastructure.logging import get_logger

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from pilot_space.ai.proxy.llm_gateway import LLMGateway

logger = get_logger(__name__)


class GraphDecompilerError(AppError):
    """Raised when graph decompilation fails."""

    http_status = 422
    error_code = "graph_decompile_error"

    def __init__(self, message: str = "Graph decompilation failed") -> None:
        super().__init__(message)


@dataclass(frozen=True, slots=True)
class GraphDecompilePayload:
    """Input for graph decompilation."""

    skill_content: str
    workspace_id: UUID
    user_id: UUID


@dataclass(frozen=True, slots=True)
class GraphDecompileResult:
    """Output of graph decompilation."""

    graph_json: dict[str, Any]
    node_count: int
    edge_count: int
    confidence: str  # "high", "medium", "low"


class GraphDecompilerService:
    """Decompiles SKILL.md content into a React Flow-compatible graph.

    Uses AI (LLMGateway) for intelligent analysis with a heuristic fallback
    when the AI provider is unavailable.

    Args:
        session: Request-scoped async database session.
        llm_gateway: Optional LLM gateway for AI-powered decompilation.
    """

    def __init__(
        self,
        session: AsyncSession,
        llm_gateway: LLMGateway | None = None,
    ) -> None:
        self._session = session
        self._llm_gateway = llm_gateway

    async def decompile(self, payload: GraphDecompilePayload) -> GraphDecompileResult:
        """Decompile SKILL.md content into graph JSON.

        Attempts AI-powered decompilation first, falling back to
        heuristic section-based decompilation if LLM unavailable.

        Args:
            payload: Decompilation input with skill_content, workspace_id, user_id.

        Returns:
            GraphDecompileResult with graph JSON and metadata.

        Raises:
            ValidationError: If skill_content is empty.
            GraphDecompilerError: If decompilation fails.
        """
        if not payload.skill_content.strip():
            raise ValidationError("Skill content cannot be empty")

        if self._llm_gateway is not None:
            try:
                return await self._ai_decompile(payload)
            except Exception:
                logger.warning(
                    "[GraphDecompiler] AI decompile failed, falling back to heuristic",
                    exc_info=True,
                )

        # Fallback to heuristic
        graph_json = self._heuristic_decompile(payload.skill_content)
        nodes = graph_json.get("nodes", [])
        edges = graph_json.get("edges", [])

        return GraphDecompileResult(
            graph_json=graph_json,
            node_count=len(nodes),
            edge_count=len(edges),
            confidence="low",
        )

    async def _ai_decompile(self, payload: GraphDecompilePayload) -> GraphDecompileResult:
        """Use LLM to decompile skill content into graph JSON."""
        from pilot_space.ai.providers.provider_selector import TaskType

        assert self._llm_gateway is not None

        system_prompt = get_graph_decompile_system_prompt()
        response = await self._llm_gateway.complete(
            workspace_id=payload.workspace_id,
            user_id=payload.user_id,
            task_type=TaskType.ROLE_SKILL_GENERATION,
            messages=[{"role": "user", "content": payload.skill_content}],
            system=system_prompt,
            temperature=0.3,
            max_tokens=4096,
        )

        # Parse JSON response
        try:
            graph_json = json.loads(response.text)
        except json.JSONDecodeError as exc:
            raise GraphDecompilerError(
                f"AI returned invalid JSON: {exc}"
            ) from exc

        # Validate structure
        self._validate_graph_json(graph_json)

        nodes = graph_json.get("nodes", [])
        edges = graph_json.get("edges", [])

        # Assess confidence based on complexity
        confidence = self._assess_confidence(payload.skill_content, nodes)

        logger.info(
            "[GraphDecompiler] AI decompile: nodes=%d edges=%d confidence=%s",
            len(nodes),
            len(edges),
            confidence,
        )

        return GraphDecompileResult(
            graph_json=graph_json,
            node_count=len(nodes),
            edge_count=len(edges),
            confidence=confidence,
        )

    @staticmethod
    def _validate_graph_json(graph_json: dict[str, Any]) -> None:
        """Validate that graph JSON has required structure.

        Args:
            graph_json: The parsed graph JSON to validate.

        Raises:
            GraphDecompilerError: If structure is invalid.
        """
        nodes = graph_json.get("nodes")
        if not isinstance(nodes, list):
            raise GraphDecompilerError("Graph JSON must contain 'nodes' array")

        for i, node in enumerate(nodes):
            if not isinstance(node, dict):
                raise GraphDecompilerError(f"Node {i} must be a dictionary")
            if "id" not in node:
                raise GraphDecompilerError(f"Node {i} missing 'id'")
            data = node.get("data", {})
            if not isinstance(data, dict) or "nodeType" not in data:
                raise GraphDecompilerError(f"Node {i} missing 'data.nodeType'")

    @staticmethod
    def _assess_confidence(skill_content: str, nodes: list[dict[str, Any]]) -> str:
        """Assess confidence level based on skill complexity.

        Args:
            skill_content: Original skill text.
            nodes: Decompiled nodes.

        Returns:
            Confidence string: "high", "medium", or "low".
        """
        section_count = skill_content.count("## ")
        node_count = len(nodes)

        # High confidence: simple skills with few sections
        if section_count <= 4 and node_count <= 6:
            return "high"
        # Medium: moderate complexity
        if section_count <= 8 and node_count <= 12:
            return "medium"
        # Low: complex skills
        return "low"

    @staticmethod
    def _heuristic_decompile(skill_content: str) -> dict[str, Any]:
        """Heuristic fallback: split by headings, create nodes per section.

        Args:
            skill_content: SKILL.md content to decompile.

        Returns:
            Graph JSON with nodes and edges.
        """
        # Strip frontmatter
        content = skill_content.strip()
        if content.startswith("---"):
            end = content.find("---", 3)
            if end != -1:
                content = content[end + 3 :].strip()

        # Split by ## headings
        sections = re.split(r"^## ", content, flags=re.MULTILINE)
        # First item is content before first heading (ignored if empty)
        sections = [s.strip() for s in sections if s.strip()]

        if not sections:
            # No sections — create minimal input->output graph
            return _make_minimal_graph()

        nodes: list[dict[str, Any]] = []
        edges: list[dict[str, Any]] = []
        y_offset = 0

        # Add input node
        input_node = _make_node("node-input", "input", "Input", y_offset, {})
        nodes.append(input_node)
        y_offset += 150
        prev_id = "node-input"

        for i, section in enumerate(sections):
            lines = section.split("\n")
            heading = lines[0].strip().rstrip(":")
            body = "\n".join(lines[1:]).strip()
            node_id = f"node-{i + 1}"

            # Determine node type from content
            lower_body = body.lower()
            lower_heading = heading.lower()

            if _is_condition_content(lower_heading, lower_body):
                node_type = "condition"
                config: dict[str, Any] = {
                    "conditionExpression": heading,
                }
            elif _is_transform_content(lower_heading, lower_body):
                node_type = "transform"
                config = {"transformTemplate": body[:200] if body else ""}
            elif _is_skill_content(lower_heading, lower_body):
                node_type = "skill"
                config = {"skillName": heading}
            else:
                node_type = "prompt"
                config = {"promptText": body[:500] if body else ""}

            node = _make_node(node_id, node_type, heading, y_offset, config)
            nodes.append(node)

            edge = _make_edge(prev_id, node_id)
            edges.append(edge)

            prev_id = node_id
            y_offset += 150

        # Add output node
        output_id = "node-output"
        output_node = _make_node(output_id, "output", "Output", y_offset, {})
        nodes.append(output_node)
        edges.append(_make_edge(prev_id, output_id))

        return {"nodes": nodes, "edges": edges}


# ── Heuristic Helpers ──────────────────────────────────────────────────────────


def _make_node(
    node_id: str,
    node_type: str,
    label: str,
    y: int,
    config: dict[str, Any],
) -> dict[str, Any]:
    """Create a graph node dict."""
    return {
        "id": node_id,
        "type": node_type,
        "position": {"x": 250, "y": y},
        "data": {
            "nodeType": node_type,
            "label": label,
            "config": config,
        },
    }


def _make_edge(source: str, target: str) -> dict[str, Any]:
    """Create a sequential edge dict."""
    return {
        "id": f"edge-{source}-{target}",
        "source": source,
        "target": target,
        "type": "sequential",
    }


def _make_minimal_graph() -> dict[str, Any]:
    """Create a minimal input -> output graph."""
    return {
        "nodes": [
            _make_node("node-input", "input", "Input", 0, {}),
            _make_node("node-output", "output", "Output", 150, {}),
        ],
        "edges": [_make_edge("node-input", "node-output")],
    }


def _is_condition_content(heading: str, body: str) -> bool:
    """Check if section content suggests a condition node."""
    keywords = ["if ", "else", "otherwise", "condition", "branch", "when ", "unless "]
    return any(kw in heading or kw in body for kw in keywords)


def _is_transform_content(heading: str, body: str) -> bool:
    """Check if section content suggests a transform node."""
    keywords = ["transform", "format", "parse", "convert", "map", "extract"]
    return any(kw in heading or kw in body for kw in keywords)


def _is_skill_content(heading: str, body: str) -> bool:
    """Check if section content suggests a skill invocation node."""
    keywords = ["invoke", "execute skill", "run skill", "call skill", "use skill"]
    return any(kw in heading or kw in body for kw in keywords)


__all__ = [
    "GraphDecompilePayload",
    "GraphDecompileResult",
    "GraphDecompilerError",
    "GraphDecompilerService",
]
