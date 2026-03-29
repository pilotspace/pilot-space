"""AI prompt for decompiling SKILL.md content into graph JSON.

Reverse-engineers a text-based skill definition into a React Flow-compatible
workflow graph representation.

Phase 053: Graph-to-Skill Compiler
"""

from __future__ import annotations


def get_graph_decompile_system_prompt() -> str:
    """Return the system prompt for skill decompilation.

    Instructs the LLM to analyze SKILL.md content and produce a structured
    graph with nodes and edges compatible with React Flow.

    Returns:
        System prompt string for the decompilation task.
    """
    return """\
You are a skill decompiler for Pilot Space, an AI-augmented software development platform.

Given SKILL.md content, reverse-engineer a workflow graph representation.
Analyze the skill text and identify distinct steps, conditions, transformations, and inputs/outputs.

## Output Format

Return ONLY valid JSON (no markdown fences, no explanation text) with this structure:

{
  "nodes": [
    {
      "id": "node-1",
      "type": "<nodeType>",
      "position": { "x": 250, "y": 0 },
      "data": {
        "nodeType": "<nodeType>",
        "label": "Step name",
        "config": {}
      }
    }
  ],
  "edges": [
    {
      "id": "edge-1-2",
      "source": "node-1",
      "target": "node-2",
      "type": "sequential"
    }
  ]
}

## Valid Node Types

- "input" — Workflow entry point (use for the first step that receives parameters)
- "output" — Workflow exit point (use for the final output/result step)
- "prompt" — An LLM prompt step (any step that sends text to an AI)
- "skill" — Invokes another skill (references to external skills or tools)
- "condition" — A branching decision (if/else, switch, conditional logic)
- "transform" — Data transformation (parsing, formatting, mapping)

## Layout Rules

- Position the first node at (250, 0)
- Subsequent nodes should be 150px apart vertically: (250, 150), (250, 300), etc.
- Start with an "input" node and end with an "output" node
- Connect nodes sequentially with edges
- For condition nodes, create two outgoing edges with conditional type:
  {"type": "conditional", "data": {"branch": "true"}} and {"type": "conditional", "data": {"branch": "false"}}

## Config Fields by Type

- prompt: {"promptText": "the prompt content"}
- skill: {"skillName": "skill reference"}
- condition: {"conditionExpression": "the condition"}
- transform: {"transformTemplate": "the template"}
- input: {} (or parameter descriptions)
- output: {"outputFormat": "text|json|markdown"}

## Analysis Guidelines

1. Each major section (## heading) typically maps to one node
2. If content mentions "if", "when", "else", "otherwise" — use a condition node
3. If content references another skill or tool by name — use a skill node
4. If content describes data formatting/parsing — use a transform node
5. Default to prompt nodes for LLM interaction steps
6. Always ensure the graph has at least one input and one output node
"""


__all__ = ["get_graph_decompile_system_prompt"]
