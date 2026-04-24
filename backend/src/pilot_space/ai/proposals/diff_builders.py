"""Diff-payload builders shared by AI tool shims (Phase 89 Plan 03).

Two output shapes — keyed on ``DiffKind``:

* ``build_text_diff(prev, new) -> {"kind": "text", "hunks": [...]}``
  For free-text mutations (note content, annotation text, etc.). Uses
  ``difflib.SequenceMatcher`` opcodes at line granularity. Each hunk is
  ``{"op": "equal"|"insert"|"delete"|"replace", "text": str}``.

* ``build_fields_diff(current, proposed) -> {"kind": "fields", "rows": [...]}``
  For structured mutations (issue priority, title, assignee). Only rows
  where ``before != after`` are included. Labels default to the humanised
  field name (``"assignee_id"`` -> ``"Assignee"``). Values are converted to
  JSON-safe primitives (UUIDs -> str, datetimes -> isoformat, enums -> .value).

Frontend ``TextDiffBlock`` / ``FieldsDiffBlock`` (Plan 04) consume these
shapes directly.
"""

from __future__ import annotations

import difflib
from datetime import date, datetime
from enum import Enum
from typing import Any
from uuid import UUID


def _jsonable(value: Any) -> Any:  # noqa: PLR0911 — explicit type branches, not control-flow complexity
    """Coerce a value to something json.dumps will accept."""
    if value is None or isinstance(value, bool | int | float | str):
        return value
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, datetime | date):
        return value.isoformat()
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, list | tuple):
        return [_jsonable(v) for v in value]
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    return str(value)


def _humanise(field: str) -> str:
    """``assignee_id`` -> ``Assignee``; ``start_date`` -> ``Start Date``."""
    # Strip trailing ``_id`` / ``_ids`` for display purposes.
    stripped = field.removesuffix("_ids").removesuffix("_id")
    return stripped.replace("_", " ").strip().title() or field


def build_text_diff(prev: str, new: str) -> dict[str, Any]:
    """Build a line-level text diff payload.

    Empty strings are accepted. A diff against identical content returns a
    single ``equal`` hunk (Plan 04 can detect no-ops by checking for any
    non-``equal`` op).
    """
    prev_lines = (prev or "").splitlines(keepends=True)
    new_lines = (new or "").splitlines(keepends=True)

    matcher = difflib.SequenceMatcher(a=prev_lines, b=new_lines, autojunk=False)
    hunks: list[dict[str, str]] = []
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            hunks.append({"op": "equal", "text": "".join(prev_lines[i1:i2])})
        elif tag == "delete":
            hunks.append({"op": "delete", "text": "".join(prev_lines[i1:i2])})
        elif tag == "insert":
            hunks.append({"op": "insert", "text": "".join(new_lines[j1:j2])})
        elif tag == "replace":
            hunks.append({"op": "delete", "text": "".join(prev_lines[i1:i2])})
            hunks.append({"op": "insert", "text": "".join(new_lines[j1:j2])})
    return {"kind": "text", "hunks": hunks}


def build_fields_diff(
    current: dict[str, Any],
    proposed: dict[str, Any],
    *,
    labels: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Build a structured field-level diff payload.

    Only rows where ``current[field] != proposed[field]`` are emitted. Fields
    absent from ``current`` are treated as ``None`` before. Fields absent
    from ``proposed`` are skipped (no intent to change).

    ``labels`` optionally overrides the default humanised name per field.
    """
    labels = labels or {}
    rows: list[dict[str, Any]] = []
    for field, after in proposed.items():
        before = current.get(field)
        if before == after:
            continue
        rows.append(
            {
                "field": field,
                "label": labels.get(field, _humanise(field)),
                "before": _jsonable(before),
                "after": _jsonable(after),
            }
        )
    return {"kind": "fields", "rows": rows}


__all__ = ["build_fields_diff", "build_text_diff"]
