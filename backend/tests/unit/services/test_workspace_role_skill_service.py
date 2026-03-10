"""Xfail stubs for WRSKL-01..02 — workspace role skill service tests.

Wave 0 TDD stubs. Each test is marked xfail(strict=False) so pytest exits 0
while WorkspaceRoleSkillService is pending implementation.
Stubs drive the green implementation in Phase 16 Plan 02.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.asyncio


@pytest.mark.xfail(strict=False, reason="implementation pending — WRSKL-01")
async def test_generate_workspace_skill_creates_inactive() -> None:
    """WRSKL-01: generate_workspace_skill() creates a skill with is_active=False."""
    pytest.fail("not implemented")


@pytest.mark.xfail(strict=False, reason="implementation pending — WRSKL-02")
async def test_activate_workspace_skill_sets_active() -> None:
    """WRSKL-02: activate_workspace_skill() sets is_active=True on the skill row."""
    pytest.fail("not implemented")


@pytest.mark.xfail(strict=False, reason="implementation pending — WRSKL-01")
async def test_list_workspace_skills() -> None:
    """WRSKL-01: list_workspace_skills() returns all skills for a workspace."""
    pytest.fail("not implemented")


@pytest.mark.xfail(strict=False, reason="implementation pending — WRSKL-01")
async def test_delete_workspace_skill() -> None:
    """WRSKL-01: delete_workspace_skill() soft-deletes the skill row."""
    pytest.fail("not implemented")


@pytest.mark.xfail(strict=False, reason="implementation pending — WRSKL-01")
async def test_generate_rate_limit_enforced() -> None:
    """WRSKL-01: generate_workspace_skill() raises RateLimitError when quota exceeded."""
    pytest.fail("not implemented")
