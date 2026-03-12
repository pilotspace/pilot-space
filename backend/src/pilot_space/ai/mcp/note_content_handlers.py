"""Utility helpers and constants for note_content_server.py.

Extracted to keep note_content_server.py under 700 lines.
Contains: shared constants, regex patterns, and pure helper functions
used by the tool handlers in create_note_content_server().
"""

from __future__ import annotations

import re
from typing import Any

# Valid PM block type identifiers
VALID_PM_BLOCK_TYPES = frozenset(
    {
        "decision",
        "form",
        "raci",
        "risk",
        "timeline",
        "dashboard",
        "sprint-board",
        "dependency-map",
        "capacity-plan",
        "release-notes",
    }
)

# Regex to detect a JSON code fence wrapping TipTap JSON (e.g. taskList)
JSON_FENCE_RE = re.compile(
    r"^```(?:json)?\s*\n(.*?)\n```\s*$",
    re.DOTALL,
)

# ReDoS prevention: detect nested quantifiers in user-supplied regex patterns
NESTED_QUANTIFIER_RE = re.compile(r"([+*]|\{\d+,?\d*\})\)?[+*]|\(\?[^)]*\)\+")


def text_result(text: str) -> dict[str, Any]:
    """Create a standard MCP tool text result.

    Args:
        text: The text content to return.

    Returns:
        MCP-compatible text result dict.
    """
    return {"content": [{"type": "text", "text": text}]}


def compile_search_regex(pattern: str, *, case_sensitive: bool) -> re.Pattern[str]:
    """Compile a regex pattern with ReDoS prevention.

    Args:
        pattern: The regex pattern string.
        case_sensitive: Whether matching should be case-sensitive.

    Returns:
        Compiled regex pattern.

    Raises:
        re.error: If pattern is invalid, too long, or contains nested quantifiers.
    """
    if len(pattern) > 500:
        raise re.error("pattern exceeds maximum length of 500 characters")
    if NESTED_QUANTIFIER_RE.search(pattern):
        raise re.error("pattern contains nested quantifiers (potential ReDoS)")
    flags = 0 if case_sensitive else re.IGNORECASE
    return re.compile(pattern, flags)


def extract_block_text(block: dict[str, Any]) -> str:
    """Extract plain text from a TipTap block node.

    Recursively traverses the node's content tree and concatenates
    all text node values.

    Args:
        block: TipTap block node dict with optional 'content' list.

    Returns:
        Concatenated plain text string.
    """
    text_parts: list[str] = []
    content = block.get("content", [])
    for node in content:
        if node.get("type") == "text":
            text_parts.append(node.get("text", ""))
        elif "content" in node:
            text_parts.append(extract_block_text(node))
    return "".join(text_parts)


__all__ = [
    "JSON_FENCE_RE",
    "NESTED_QUANTIFIER_RE",
    "VALID_PM_BLOCK_TYPES",
    "compile_search_regex",
    "extract_block_text",
    "text_result",
]
