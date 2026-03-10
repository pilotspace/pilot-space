"""Xfail stubs for SKRG-03 — plugin skill materializer tests.

Wave 0 TDD stubs. Each test is marked xfail(strict=False) so pytest exits 0
while the plugin skill materializer is pending implementation.
Stubs drive the green implementation in Phase 19 Plan 02.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.asyncio


@pytest.mark.xfail(strict=False, reason="SKRG-03: not yet implemented")
async def test_materialize_plugin_skills_writes_skill_md_files() -> None:
    """SKRG-03: materialize_plugin_skills writes SKILL.md for each installed plugin."""
    pytest.fail("not implemented")


@pytest.mark.xfail(strict=False, reason="SKRG-03: not yet implemented")
async def test_materialize_plugin_skills_writes_reference_files_alongside_skill_md() -> None:
    """SKRG-03: materialize_plugin_skills writes references/ files alongside SKILL.md."""
    pytest.fail("not implemented")


@pytest.mark.xfail(strict=False, reason="SKRG-03: not yet implemented")
async def test_materialize_plugin_skills_cleans_up_stale_plugin_dirs() -> None:
    """SKRG-03: materialize_plugin_skills removes directories for uninstalled plugins."""
    pytest.fail("not implemented")


@pytest.mark.xfail(strict=False, reason="SKRG-03: not yet implemented")
async def test_materialize_plugin_skills_handles_operational_error_gracefully() -> None:
    """SKRG-03: materialize_plugin_skills handles OperationalError without crashing."""
    pytest.fail("not implemented")
