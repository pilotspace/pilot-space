"""Xfail stubs for WRSKL-01..02 — workspace role skill repository tests.

Wave 0 TDD stubs. Each test is marked xfail(strict=False) so pytest exits 0
while the WorkspaceRoleSkill model and repository are pending implementation.
Stubs drive the green implementation in Phase 16 Plan 02.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.asyncio


@pytest.mark.xfail(strict=False, reason="implementation pending — WRSKL-01")
async def test_create_workspace_role_skill() -> None:
    """WRSKL-01: create a WorkspaceRoleSkill row, verify id and is_active=False."""
    pytest.fail("not implemented")


@pytest.mark.xfail(strict=False, reason="implementation pending — WRSKL-03")
async def test_get_active_by_workspace() -> None:
    """WRSKL-03: list only is_active=True skills scoped to a workspace_id."""
    pytest.fail("not implemented")


@pytest.mark.xfail(strict=False, reason="implementation pending — WRSKL-01")
async def test_unique_constraint_workspace_role() -> None:
    """WRSKL-01: second insert with same (workspace_id, role_type) raises IntegrityError."""
    pytest.fail("not implemented")


@pytest.mark.xfail(strict=False, reason="implementation pending — WRSKL-02")
async def test_soft_delete_skill() -> None:
    """WRSKL-02: soft_delete() sets is_deleted=True; get_active_by_workspace excludes it."""
    pytest.fail("not implemented")
