#!/usr/bin/env python3
"""Audit: find every ``queue.enqueue(QueueName.AI_NORMAL, ...)`` site in
``backend/src`` whose payload dict literal does NOT include an
``actor_user_id`` key.

Phase 70 Wave 0 precursor to the RLS fix: Wave 1 Task 1 consumes this
report to know which enqueue call sites must be patched so that
``MemoryWorker`` can restore per-workspace RLS context before processing
each job (PROD-01 / blocking real-PG test).

Usage:
    python scripts/audit_enqueue_actor_user_id.py

Exit code is always 0 (report-only). Output is line-oriented:

    [MISSING] path:line  <snippet>
    [OK]      path:line  <snippet>
    ...
    Summary: N sites; M missing actor_user_id

The parser is deliberately lenient — it walks the ``ast`` module and
treats any ``Call`` whose ``.func`` ends in ``enqueue`` or ``send`` with
a literal Dict as its 2nd positional arg (or ``payload=`` kwarg) as a
candidate. Calls not on ``QueueName.AI_NORMAL`` are skipped (PR review
queue carries repo/pr identifiers, not user ids — Wave 1 handles).
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SRC_ROOT = REPO_ROOT / "backend" / "src" / "pilot_space"


def _is_ai_normal(arg: ast.expr) -> bool:
    """Return True when arg looks like ``QueueName.AI_NORMAL`` or ``"ai_normal"``."""
    if isinstance(arg, ast.Attribute) and arg.attr == "AI_NORMAL":
        return True
    if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
        return arg.value == "ai_normal"
    return False


def _payload_dict(call: ast.Call) -> ast.Dict | None:
    # 2nd positional arg, if a Dict literal.
    if len(call.args) >= 2 and isinstance(call.args[1], ast.Dict):
        return call.args[1]
    for kw in call.keywords:
        if kw.arg in ("payload", "message") and isinstance(kw.value, ast.Dict):
            return kw.value
    return None


def _dict_has_key(d: ast.Dict, key: str) -> bool:
    return any(isinstance(k, ast.Constant) and k.value == key for k in d.keys)


def _call_func_name(call: ast.Call) -> str:
    # .enqueue / .send — we want the attribute name.
    if isinstance(call.func, ast.Attribute):
        return call.func.attr
    return ""


def audit_file(path: Path) -> list[tuple[int, str, bool, bool]]:
    """Return (lineno, snippet, is_ai_normal, has_actor_user_id) for each candidate."""
    try:
        tree = ast.parse(path.read_text())
    except SyntaxError:
        return []
    source_lines = path.read_text().splitlines()
    results: list[tuple[int, str, bool, bool]] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        fname = _call_func_name(node)
        if fname not in ("enqueue", "send"):
            continue
        if not node.args:
            continue
        is_ai = _is_ai_normal(node.args[0])
        payload = _payload_dict(node)
        if payload is None:
            # No literal dict → cannot statically verify. Report as unknown.
            snippet = source_lines[node.lineno - 1].strip() if node.lineno - 1 < len(source_lines) else ""
            results.append((node.lineno, snippet, is_ai, False))
            continue
        has_key = _dict_has_key(payload, "actor_user_id")
        snippet = source_lines[node.lineno - 1].strip() if node.lineno - 1 < len(source_lines) else ""
        results.append((node.lineno, snippet, is_ai, has_key))
    return results


def main() -> int:
    total = 0
    missing = 0
    for path in sorted(SRC_ROOT.rglob("*.py")):
        findings = audit_file(path)
        for lineno, snippet, is_ai, has_key in findings:
            if not is_ai:
                continue  # Non-AI_NORMAL queues skipped per Wave 0 scope.
            total += 1
            rel = path.relative_to(REPO_ROOT)
            status = "[OK]     " if has_key else "[MISSING]"
            if not has_key:
                missing += 1
            print(f"{status} {rel}:{lineno}  {snippet}")
    print()
    print(f"Summary: {total} AI_NORMAL enqueue sites; {missing} missing actor_user_id")
    return 0


if __name__ == "__main__":
    sys.exit(main())
