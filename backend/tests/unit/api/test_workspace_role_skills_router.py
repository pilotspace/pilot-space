"""Xfail stubs for WRSKL-01..02 — workspace role skill router tests.

Wave 0 TDD stubs. Each test is marked xfail(strict=False) so pytest exits 0
while the workspace-role-skills router is pending implementation.
Stubs drive the green implementation in Phase 16 Plan 03.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.asyncio


@pytest.mark.xfail(strict=False, reason="implementation pending — WRSKL-01")
async def test_create_workspace_skill_forbidden_for_member() -> None:
    """WRSKL-01: POST /workspaces/{id}/workspace-role-skills returns 403 for MEMBER role."""
    pytest.fail("not implemented")


@pytest.mark.xfail(strict=False, reason="implementation pending — WRSKL-02")
async def test_activate_workspace_skill_forbidden_for_member() -> None:
    """WRSKL-02: POST /workspaces/{id}/workspace-role-skills/{skillId}/activate returns 403 for MEMBER."""
    pytest.fail("not implemented")


@pytest.mark.xfail(strict=False, reason="implementation pending — WRSKL-01")
async def test_create_workspace_skill_as_admin() -> None:
    """WRSKL-01: POST /workspaces/{id}/workspace-role-skills returns 201 for ADMIN role."""
    pytest.fail("not implemented")


@pytest.mark.xfail(strict=False, reason="implementation pending — WRSKL-02")
async def test_activate_workspace_skill_as_admin() -> None:
    """WRSKL-02: POST /workspaces/{id}/workspace-role-skills/{skillId}/activate returns 200 for ADMIN."""
    pytest.fail("not implemented")
