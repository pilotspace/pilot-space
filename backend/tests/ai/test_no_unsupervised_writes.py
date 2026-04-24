"""Audit gate: no unsupervised DB writes in AI tool modules.

ACTIVE — Phase 89 Plan 03 Task 6 (REV-89-03-B).

This gate runs unconditionally in CI. Any direct ORM mutation
(``session.add``, ``session.commit``, ``session.flush``,
``session.execute(insert/update/delete(...))``) or any
``<repo>.<create|update|delete|save|upsert|insert|remove>(...)`` call found
in ``pilot_space.ai.tools`` or ``pilot_space.ai.mcp`` is a violation.

Real mutations belong in ``pilot_space.ai.proposals.intent_handlers``
and are reached only after a user accepts a proposal via
``POST /api/v1/proposals/{id}/accept``. That directory is allow-listed
via ``ALLOWED_PATH_FRAGMENTS``.

## Adding a new AI write tool

1. Build the intent payload (JSON-safe kwargs) + diff payload in the tool.
2. Call ``ProposalBus.create_proposal(...)`` with ``intent_tool=<your-tool>``.
3. Register a handler in ``pilot_space/ai/proposals/intent_handlers/<artifact>.py``
   via ``@register_intent("<your-tool>")``.
4. The tool returns ``{proposal_id, status: "pending", preview}`` — NOT
   the mutated entity.

If you have a legitimate internal bookkeeping write that should never be
user-visible (e.g. block-owner attribution), extend
``ALLOWED_PATH_FRAGMENTS`` and document the decision in a SUMMARY.md.
"""

from __future__ import annotations

import ast
import pathlib

import pytest

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

FORBIDDEN_REPO_METHODS = {
    "create",
    "update",
    "delete",
    "save",
    "upsert",
    "insert",
    "remove",
}

# Fragments that, when present in a node's unparsed args, indicate an
# ORM-level mutation run through `session.execute(...)`.
EXECUTE_MUTATION_KEYWORDS = ("insert(", "update(", "delete(")

# Relative path fragments that are ALLOWED to contain direct writes.
# Plan 03 creates ``pilot_space/ai/proposals/intent_handlers/`` — that seam
# is exactly where mutations SHOULD live, so it's allow-listed here.
#
# REV-89-03-C: ``ai/mcp/ownership_server.py`` is allow-listed because
# ``set_block_owner`` is internal block-attribution bookkeeping (writes
# ``{"owner": "ai:..."}`` into a note's TipTap content attrs). It's not a
# user-visible content edit; routing it through a human-review proposal
# would produce zero signal and significant UX noise. Documented in
# 89-03-SUMMARY.md.
ALLOWED_PATH_FRAGMENTS = (
    "ai/proposals/intent_handlers",
    "ai/proposals\\intent_handlers",  # windows path form (defensive)
    "ai/mcp/ownership_server.py",
    "ai\\mcp\\ownership_server.py",  # windows path form (defensive)
)

_BACKEND_SRC = pathlib.Path(__file__).resolve().parents[2] / "src"
AI_TOOL_ROOTS = (
    _BACKEND_SRC / "pilot_space" / "ai" / "tools",
    _BACKEND_SRC / "pilot_space" / "ai" / "mcp",
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _is_in_allowlist(path: pathlib.Path) -> bool:
    s = str(path)
    return any(frag in s for frag in ALLOWED_PATH_FRAGMENTS)


def _unparse(node: ast.AST) -> str:
    try:
        return ast.unparse(node)
    except Exception:
        return ""


def _scan(path: pathlib.Path) -> list[tuple[int, str]]:
    """Return ``(lineno, snippet)`` pairs for each forbidden write in *path*."""
    violations: list[tuple[int, str]] = []
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except SyntaxError:
        # Syntax errors are not our problem — pre-existing broken file.
        return violations

    for node in ast.walk(tree):
        if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)):
            continue

        attr = node.func.attr
        receiver = _unparse(node.func.value)
        receiver_lower = receiver.lower()

        # session.add / session.commit / session.flush
        if "session" in receiver_lower and attr in {"add", "commit", "flush"}:
            violations.append((node.lineno, f"{receiver}.{attr}(...)"))
            continue

        # session.execute(insert(...)|update(...)|delete(...))
        if "session" in receiver_lower and attr == "execute" and node.args:
            arg_src = _unparse(node.args[0])
            if any(kw in arg_src.lower() for kw in EXECUTE_MUTATION_KEYWORDS):
                snippet = arg_src if len(arg_src) <= 60 else arg_src[:60] + "..."
                violations.append(
                    (node.lineno, f"{receiver}.execute({snippet})")
                )
                continue

        # <repo>|<repository>.<FORBIDDEN_REPO_METHODS>
        if (
            receiver_lower.endswith("repo") or "repository" in receiver_lower
        ) and attr in FORBIDDEN_REPO_METHODS:
            violations.append((node.lineno, f"{receiver}.{attr}(...)"))

    return violations


def _collect_violations() -> dict[str, list[tuple[int, str]]]:
    all_violations: dict[str, list[tuple[int, str]]] = {}
    for root in AI_TOOL_ROOTS:
        if not root.exists():
            continue
        for py in root.rglob("*.py"):
            if _is_in_allowlist(py):
                continue
            if py.name.startswith("_"):
                # skip private helpers that are presumably internal glue
                # (still scanned — uncomment to relax)
                pass
            violations = _scan(py)
            if violations:
                all_violations[str(py.relative_to(_BACKEND_SRC))] = violations
    return all_violations


# ---------------------------------------------------------------------------
# The gate
# ---------------------------------------------------------------------------


@pytest.mark.audit_gate
def test_no_unsupervised_writes_in_ai_tools() -> None:
    """Fail if any AI tool / MCP server mutates the DB directly.

    All AI mutations MUST route through ``ProposalBus.create_proposal``;
    the real mutation logic lives in
    ``pilot_space.ai.proposals.intent_handlers`` and runs only after the
    user accepts a proposal.
    """
    all_violations = _collect_violations()
    if not all_violations:
        return

    report_lines: list[str] = []
    for file_path, violations in sorted(all_violations.items()):
        report_lines.append(f"  {file_path}:")
        for lineno, snippet in violations:
            report_lines.append(f"    L{lineno}: {snippet}")
    report = "\n".join(report_lines)

    pytest.fail(
        "Unsupervised write detected in AI tool modules. All AI mutations "
        "must route through ProposalBus.create_proposal — actual mutation "
        "logic lives in pilot_space.ai.proposals.intent_handlers (Plan 03).\n\n"
        f"Violations:\n{report}",
        pytrace=False,
    )
