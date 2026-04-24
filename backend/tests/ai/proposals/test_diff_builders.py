"""Tests for text + fields diff builders (Phase 89 Plan 03 Task 1)."""

from __future__ import annotations

from datetime import date
from uuid import uuid4

from pilot_space.ai.proposals.diff_builders import (
    build_fields_diff,
    build_text_diff,
)


def test_text_diff_returns_kind_text():
    out = build_text_diff("", "")
    assert out["kind"] == "text"
    assert isinstance(out["hunks"], list)


def test_text_diff_detects_insert_and_delete():
    prev = "line1\nline2\n"
    new = "line1\nline2 CHANGED\nline3\n"
    out = build_text_diff(prev, new)
    ops = [h["op"] for h in out["hunks"]]
    assert "insert" in ops
    assert "delete" in ops


def test_text_diff_identical_content_is_single_equal_hunk():
    out = build_text_diff("same\n", "same\n")
    assert out["hunks"] == [{"op": "equal", "text": "same\n"}]


def test_fields_diff_only_includes_changed_rows():
    out = build_fields_diff(
        current={"title": "A", "priority": "low", "unused": "x"},
        proposed={"title": "B", "priority": "low"},
    )
    assert out["kind"] == "fields"
    fields = [r["field"] for r in out["rows"]]
    assert fields == ["title"]
    row = out["rows"][0]
    assert row["before"] == "A"
    assert row["after"] == "B"
    assert row["label"] == "Title"


def test_fields_diff_jsonifies_uuids_and_dates():
    uid = uuid4()
    out = build_fields_diff(
        current={"assignee_id": None, "target_date": None},
        proposed={"assignee_id": uid, "target_date": date(2026, 4, 24)},
    )
    before_after = {r["field"]: (r["before"], r["after"]) for r in out["rows"]}
    assert before_after["assignee_id"] == (None, str(uid))
    assert before_after["target_date"] == (None, "2026-04-24")
    assert {r["label"] for r in out["rows"]} == {"Assignee", "Target Date"}


def test_fields_diff_respects_custom_labels():
    out = build_fields_diff(
        current={"name": "old"},
        proposed={"name": "new"},
        labels={"name": "Issue Title"},
    )
    assert out["rows"][0]["label"] == "Issue Title"
