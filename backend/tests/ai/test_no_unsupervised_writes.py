"""Audit gate: no unsupervised DB writes in AI tool modules (Phase 89 Plan 02).

This gate intentionally fails until Plan 89-03 rewires every AI write tool
to route through :class:`ProposalBus.create_proposal`. DO NOT skip or
re-implement without reading the plan.

Contract: any direct ORM mutation (``session.add``, ``session.commit``,
``session.flush``, ``session.execute(insert/update/delete(...))``) or any
``<repo>.<create|update|delete|save|upsert|insert|remove>(...)`` call found
in ``pilot_space.ai.tools`` or ``pilot_space.ai.mcp`` is a violation. Real
mutations belong in ``pilot_space.ai.proposals.intent_handlers`` (created
by Plan 03) and are reached only after a user accepts a proposal.

## Activation recipe (REV-89-02-B)

CI by default does NOT set ``AUDIT_GATE_ACTIVE=1`` → the gate is SKIPPED
→ CI stays green while Plan 03 is in flight.

Plan 03's final task flips the switch by ONE of:

1. Setting ``AUDIT_GATE_ACTIVE=1`` in the CI environment (preferred during
   soak — you can toggle it off quickly if a false positive appears).
2. Removing the ``@pytest.mark.skipif`` decorator entirely so the gate
   runs unconditionally (preferred steady-state — regressions now fail CI).

Either way, Plan 03 MUST land rewire commits + activation commit together
so the gate is GREEN when it goes live.

The xfail-strict strategy was considered and rejected: it would mask
partial rewires (the gate stays FAILED, xfail marks it expected, CI stays
GREEN) — the opposite of what we want.
"""

from __future__ import annotations

import ast
import os
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
ALLOWED_PATH_FRAGMENTS = (
    "ai/proposals/intent_handlers",
    "ai/proposals\\intent_handlers",  # windows path form (defensive)
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
@pytest.mark.skipif(
    os.getenv("AUDIT_GATE_ACTIVE") != "1",
    reason=(
        "Plan 89-03 not yet shipped — audit gate inactive. "
        "Set AUDIT_GATE_ACTIVE=1 once every AI write tool has been rewired "
        "through ProposalBus. See the module docstring for the full "
        "activation recipe."
    ),
)
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
