"""Round-trip tests for alembic migration 111 — proposals table + version columns.

Gated on ``TEST_DATABASE_URL`` pointing to a PostgreSQL instance because:
- RLS policies (ENABLE / FORCE ROW LEVEL SECURITY, pg_policies) are PG-specific
- JSONB server defaults (``'[]'::jsonb``) are PG-specific
- ``gen_random_uuid()`` default is PG-specific

Contracts asserted:
    1. Single alembic head after upgrade == ``111_proposals_and_version_history``.
    2. ``proposals`` table exists with all required columns, check constraint on
       status enum, check constraint on mode enum (REV-89-01-A), and 2 indexes.
    3. ``proposals`` has ``relrowsecurity = true`` AND ``relforcerowsecurity = true``.
    4. At least one workspace-isolation policy + one service_role policy on proposals.
    5. ``issues.version_number`` / ``issues.version_history`` exist with correct
       types and defaults (``1`` / ``'[]'::jsonb``).
    6. ``alembic downgrade -1`` reverses all changes cleanly.

NOTE: ``specs`` version columns deferred per CONTEXT §2 line 103 — ``specs``
table does not exist in schema. Plan 05 (or whichever plan introduces ``specs``)
adds version columns when the table lands.
"""

from __future__ import annotations

import os

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, text

from alembic import command

pytestmark = pytest.mark.postgres


def _alembic_config() -> Config:
    cfg = Config("alembic.ini")
    if url := os.environ.get("TEST_DATABASE_URL"):
        cfg.set_main_option("sqlalchemy.url", url)
    return cfg


@pytest.fixture
def pg_url() -> str:
    url = os.environ.get("TEST_DATABASE_URL")
    if not url or not url.startswith(("postgresql", "postgres")):
        pytest.skip("TEST_DATABASE_URL not set to a PostgreSQL URL")
    return url


def test_single_head_is_111() -> None:
    """Migration 111 is the single head; down_revision is 110."""
    cfg = _alembic_config()
    script = ScriptDirectory.from_config(cfg)
    heads = script.get_heads()
    assert len(heads) == 1, f"Expected single alembic head, got {heads}"
    assert heads[0] == "111_proposals_and_version_history"

    rev = script.get_revision("111_proposals_and_version_history")
    assert rev is not None
    assert rev.down_revision == "110_workspace_hook_configs"


def test_upgrade_creates_proposals_table_with_columns(pg_url: str) -> None:
    """Proposals table has all columns per CONTEXT §2 + REV-89-01-A."""
    cfg = _alembic_config()
    command.upgrade(cfg, "111_proposals_and_version_history")

    engine = create_engine(pg_url)
    required = {
        "id",
        "workspace_id",
        "session_id",
        "message_id",
        "target_artifact_type",
        "target_artifact_id",
        "intent_tool",
        "intent_args",
        "diff_kind",
        "diff_payload",
        "reasoning",
        "status",
        "applied_version",
        "decided_at",
        "decided_by",
        "created_at",
        # REV-89-01-A columns
        "mode",
        "accept_disabled",
        "persist",
        "plan_preview_only",
    }
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'proposals'
                """
            )
        ).all()
    actual = {r[0] for r in rows}
    missing = required - actual
    assert not missing, f"Missing proposals columns: {missing}"


def test_upgrade_creates_proposals_indexes(pg_url: str) -> None:
    """Two composite indexes exist per plan."""
    engine = create_engine(pg_url)
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT indexname FROM pg_indexes
                WHERE tablename = 'proposals'
                """
            )
        ).all()
    names = {r[0] for r in rows}
    assert "idx_proposals_session_status" in names, f"indexes={names}"
    assert "idx_proposals_workspace_target" in names, f"indexes={names}"


def test_upgrade_creates_status_and_mode_check_constraints(pg_url: str) -> None:
    """CHECK constraints restrict status enum (5 values) + mode enum (4 values)."""
    engine = create_engine(pg_url)
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT con.conname, pg_get_constraintdef(con.oid)
                FROM pg_constraint con
                JOIN pg_class rel ON rel.oid = con.conrelid
                WHERE rel.relname = 'proposals' AND con.contype = 'c'
                """
            )
        ).all()
    defs = {r[0]: r[1] for r in rows}
    # Status check
    status_def = next((d for n, d in defs.items() if "status" in n), None)
    assert status_def is not None, f"no status check found: {defs}"
    for v in ("pending", "applied", "rejected", "retried", "errored"):
        assert v in status_def, f"status check missing '{v}': {status_def}"
    # Mode check
    mode_def = next((d for n, d in defs.items() if "mode" in n), None)
    assert mode_def is not None, f"no mode check found: {defs}"
    for v in ("plan", "act", "research", "draft"):
        assert v in mode_def, f"mode check missing '{v}': {mode_def}"


def test_upgrade_enables_and_forces_rls(pg_url: str) -> None:
    """RLS is enabled AND forced on proposals (per rls-check.md)."""
    engine = create_engine(pg_url)
    with engine.connect() as conn:
        row = conn.execute(
            text(
                """
                SELECT relrowsecurity, relforcerowsecurity
                FROM pg_class
                WHERE relname = 'proposals'
                """
            )
        ).first()
    assert row is not None, "proposals table not found"
    assert row[0] is True, "ENABLE ROW LEVEL SECURITY missing"
    assert row[1] is True, "FORCE ROW LEVEL SECURITY missing"


def test_upgrade_creates_workspace_and_service_role_policies(pg_url: str) -> None:
    """At least one workspace-isolation policy AND a service_role policy exist."""
    engine = create_engine(pg_url)
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT policyname, roles::text, qual
                FROM pg_policies
                WHERE tablename = 'proposals'
                """
            )
        ).all()
    names = {r[0] for r in rows}
    roles_blob = " ".join(r[1] for r in rows)
    quals_blob = " ".join((r[2] or "") for r in rows)
    assert any("workspace" in n or "isolation" in n for n in names), (
        f"no workspace isolation policy: {names}"
    )
    assert any("service" in n for n in names) or "service_role" in roles_blob, (
        f"no service_role policy: names={names} roles={roles_blob}"
    )
    assert "workspace_members" in quals_blob, (
        f"workspace policy does not reference workspace_members: {quals_blob}"
    )


def test_upgrade_adds_version_columns_to_issues(pg_url: str) -> None:
    """``issues.version_number`` + ``issues.version_history`` exist with defaults."""
    engine = create_engine(pg_url)
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT column_name, data_type, column_default, is_nullable
                FROM information_schema.columns
                WHERE table_name = 'issues'
                  AND column_name IN ('version_number', 'version_history')
                """
            )
        ).all()
    by_name = {r[0]: r for r in rows}
    assert "version_number" in by_name, "issues.version_number missing"
    assert "version_history" in by_name, "issues.version_history missing"

    vn = by_name["version_number"]
    assert vn[1] == "integer"
    assert vn[3] == "NO"  # NOT NULL
    assert vn[2] is not None
    assert "1" in vn[2]

    vh = by_name["version_history"]
    assert vh[1] == "jsonb"
    assert vh[3] == "NO"
    assert vh[2] is not None
    assert "[]" in vh[2]


def test_downgrade_reverts_proposals_table_and_version_columns(pg_url: str) -> None:
    """Downgrade removes proposals table and issue version columns."""
    cfg = _alembic_config()
    command.downgrade(cfg, "110_workspace_hook_configs")

    engine = create_engine(pg_url)
    with engine.connect() as conn:
        tbl = conn.execute(
            text(
                """
                SELECT 1 FROM information_schema.tables
                WHERE table_name = 'proposals'
                """
            )
        ).first()
        cols = conn.execute(
            text(
                """
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'issues'
                  AND column_name IN ('version_number', 'version_history')
                """
            )
        ).all()
    assert tbl is None, "proposals table should be dropped on downgrade"
    assert cols == [], f"issues version columns should be dropped, got {cols}"

    # Re-upgrade for test cleanliness.
    command.upgrade(cfg, "111_proposals_and_version_history")
