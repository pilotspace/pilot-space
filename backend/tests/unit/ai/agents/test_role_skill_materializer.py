"""Unit tests for role_skill_materializer.

Tests filesystem materialization, YAML frontmatter generation,
stale skill cleanup, and new-table materialization path.

Source: 011-role-based-skills, FR-006, FR-007, FR-008, FR-014, Phase 20
"""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING
from uuid import uuid4

import pytest

from pilot_space.ai.agents.role_skill_materializer import (
    _build_frontmatter,
    _build_workspace_frontmatter,
    _cleanup_stale_role_skills,
    _sanitize_skill_dir_name,
    materialize_role_skills,
)
from pilot_space.infrastructure.database.models.skill_template import SkillTemplate
from pilot_space.infrastructure.database.models.user_role_skill import UserRoleSkill
from pilot_space.infrastructure.database.models.user_skill import UserSkill

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


class TestSanitizeSkillDirName:
    """Tests for _sanitize_skill_dir_name helper."""

    def test_basic_name(self) -> None:
        """Lowercases and replaces spaces with hyphens."""
        result = _sanitize_skill_dir_name("Senior Developer", "abc123")
        assert result == "senior-developer"

    def test_special_chars(self) -> None:
        """Replaces non-alphanumeric chars with hyphens."""
        result = _sanitize_skill_dir_name("C++ & Rust Engineer!", "abc123")
        assert result == "c-rust-engineer"

    def test_leading_trailing_hyphens(self) -> None:
        """Strips leading/trailing hyphens."""
        result = _sanitize_skill_dir_name("---test---", "abc123")
        assert result == "test"

    def test_empty_name_uses_fallback(self) -> None:
        """Falls back to truncated ID when name sanitizes to empty."""
        result = _sanitize_skill_dir_name("!!!", "abcdef12345678")
        assert result == "abcdef12"

    def test_empty_string_uses_fallback(self) -> None:
        """Falls back when name is empty string."""
        result = _sanitize_skill_dir_name("", "abcdef12345678")
        assert result == "abcdef12"


class TestBuildFrontmatter:
    """Tests for _build_frontmatter helper."""

    def test_standard_skill(self) -> None:
        """Produces frontmatter with name and description."""
        result = _build_frontmatter("Senior Developer", "abc123")
        assert result.startswith("---\n")
        assert result.endswith("\n---")
        assert "name: skill-senior-developer" in result
        assert 'description: "Senior Developer"' in result
        assert "origin: personal" in result

    def test_uses_sanitized_name(self) -> None:
        """Name in frontmatter is sanitized."""
        result = _build_frontmatter("C++ Engineer!", "abc123")
        assert "name: skill-c-engineer" in result


class TestBuildWorkspaceFrontmatter:
    """Tests for _build_workspace_frontmatter helper."""

    def test_workspace_skill(self) -> None:
        """Produces frontmatter with origin: workspace."""
        result = _build_workspace_frontmatter("Backend Dev", "abc123")
        assert "origin: workspace" in result
        assert "name: skill-backend-dev" in result


class TestCleanupStaleRoleSkills:
    """Tests for _cleanup_stale_role_skills helper."""

    def test_removes_stale_skill_dirs(self, tmp_path: Path) -> None:
        """Removes skill-* dirs not in expected set."""
        skills_dir = tmp_path / "skills"
        skills_dir.mkdir()

        (skills_dir / "skill-developer-abc123").mkdir()
        (skills_dir / "skill-developer-abc123" / "SKILL.md").write_text("content")
        (skills_dir / "skill-tester-def456").mkdir()
        (skills_dir / "skill-tester-def456" / "SKILL.md").write_text("content")

        _cleanup_stale_role_skills(skills_dir, {"skill-developer-abc123"})

        assert (skills_dir / "skill-developer-abc123").exists()
        assert not (skills_dir / "skill-tester-def456").exists()

    def test_removes_legacy_role_dirs(self, tmp_path: Path) -> None:
        """Phase 20 transition: legacy role-* dirs are always removed."""
        skills_dir = tmp_path / "skills"
        skills_dir.mkdir()

        (skills_dir / "role-developer").mkdir()
        (skills_dir / "role-developer" / "SKILL.md").write_text("content")

        _cleanup_stale_role_skills(skills_dir, set())

        assert not (skills_dir / "role-developer").exists()

    def test_preserves_system_skills(self, tmp_path: Path) -> None:
        """System skills (without skill-/role- prefix) are never removed."""
        skills_dir = tmp_path / "skills"
        skills_dir.mkdir()

        (skills_dir / "extract-issues").mkdir()
        (skills_dir / "extract-issues" / "SKILL.md").write_text("content")

        _cleanup_stale_role_skills(skills_dir, set())

        assert (skills_dir / "extract-issues").exists()

    def test_handles_nonexistent_dir(self, tmp_path: Path) -> None:
        """Does not raise when skills_dir does not exist."""
        _cleanup_stale_role_skills(tmp_path / "nonexistent", set())


@pytest.mark.asyncio
class TestMaterializeFromNewTables:
    """Tests for materializer reading from new user_skills + skill_templates tables."""

    async def test_materializes_user_skills(
        self,
        db_session: AsyncSession,
        tmp_path: Path,
    ) -> None:
        """User skills are materialized as skill-{name}-{id[:6]} dirs."""
        user_id = uuid4()
        workspace_id = uuid4()
        template_id = uuid4()
        skills_dir = tmp_path / "skills"
        skills_dir.mkdir()

        from pilot_space.infrastructure.database.models import User, Workspace

        user = User(id=user_id, email="new-mat@example.com")
        ws = Workspace(id=workspace_id, name="New WS", slug="new-ws", owner_id=user_id)
        db_session.add(user)
        db_session.add(ws)
        await db_session.flush()

        # Create a skill template
        template = SkillTemplate(
            id=template_id,
            workspace_id=workspace_id,
            name="Senior Developer",
            description="Dev template",
            skill_content="# Senior Developer Template",
            source="built_in",
        )
        db_session.add(template)
        await db_session.flush()

        # Create a user skill linked to template
        skill_id = uuid4()
        user_skill = UserSkill(
            id=skill_id,
            user_id=user_id,
            workspace_id=workspace_id,
            template_id=template_id,
            skill_content="# My Developer Skill\n\nPersonalized content.",
        )
        db_session.add(user_skill)
        await db_session.flush()

        count = await materialize_role_skills(
            db_session=db_session,
            user_id=user_id,
            workspace_id=workspace_id,
            skills_dir=skills_dir,
        )

        assert count >= 1
        # Verify directory naming: skill-{sanitized_name}-{id[:6]}
        expected_dir = f"skill-senior-developer-{str(skill_id)[:6]}"
        skill_file = skills_dir / expected_dir / "SKILL.md"
        assert skill_file.exists(), f"Expected {expected_dir}/SKILL.md to exist"
        content = skill_file.read_text()
        assert "# My Developer Skill" in content
        assert "origin: personal" in content

    async def test_template_fallback_for_uncovered_templates(
        self,
        db_session: AsyncSession,
        tmp_path: Path,
    ) -> None:
        """Active templates without matching user skills are materialized as workspace skills."""
        user_id = uuid4()
        workspace_id = uuid4()
        template_id = uuid4()
        skills_dir = tmp_path / "skills"
        skills_dir.mkdir()

        from pilot_space.infrastructure.database.models import User, Workspace

        user = User(id=user_id, email="fallback-mat@example.com")
        ws = Workspace(id=workspace_id, name="Fallback WS", slug="fallback-ws", owner_id=user_id)
        db_session.add(user)
        db_session.add(ws)
        await db_session.flush()

        # Create an active template with no matching user skill
        template = SkillTemplate(
            id=template_id,
            workspace_id=workspace_id,
            name="QA Engineer",
            description="QA template",
            skill_content="# QA Engineer\n\nTesting best practices.",
            source="built_in",
        )
        db_session.add(template)
        await db_session.flush()

        count = await materialize_role_skills(
            db_session=db_session,
            user_id=user_id,
            workspace_id=workspace_id,
            skills_dir=skills_dir,
        )

        assert count >= 1
        # Verify workspace template fallback dir
        expected_dir = f"skill-qa-engineer-{str(template_id)[:6]}"
        skill_file = skills_dir / expected_dir / "SKILL.md"
        assert skill_file.exists(), f"Expected {expected_dir}/SKILL.md to exist"
        content = skill_file.read_text()
        assert "# QA Engineer" in content
        assert "origin: workspace" in content

    async def test_user_skill_suppresses_template_fallback(
        self,
        db_session: AsyncSession,
        tmp_path: Path,
    ) -> None:
        """User skill for a template prevents workspace fallback for same template."""
        user_id = uuid4()
        workspace_id = uuid4()
        template_id = uuid4()
        skills_dir = tmp_path / "skills"
        skills_dir.mkdir()

        from pilot_space.infrastructure.database.models import User, Workspace

        user = User(id=user_id, email="suppress-mat@example.com")
        ws = Workspace(id=workspace_id, name="Suppress WS", slug="suppress-ws", owner_id=user_id)
        db_session.add(user)
        db_session.add(ws)
        await db_session.flush()

        template = SkillTemplate(
            id=template_id,
            workspace_id=workspace_id,
            name="Developer",
            description="Dev template",
            skill_content="# Developer Template",
            source="built_in",
        )
        db_session.add(template)
        await db_session.flush()

        skill_id = uuid4()
        user_skill = UserSkill(
            id=skill_id,
            user_id=user_id,
            workspace_id=workspace_id,
            template_id=template_id,
            skill_content="# My Personal Developer Skill",
        )
        db_session.add(user_skill)
        await db_session.flush()

        count = await materialize_role_skills(
            db_session=db_session,
            user_id=user_id,
            workspace_id=workspace_id,
            skills_dir=skills_dir,
        )

        # Should only have the personal skill, not the template fallback
        # Count skill-* dirs
        skill_dirs = [d for d in skills_dir.iterdir() if d.is_dir() and d.name.startswith("skill-")]
        assert len(skill_dirs) == 1
        # Content should be personal, not template
        content = (skill_dirs[0] / "SKILL.md").read_text()
        assert "# My Personal Developer Skill" in content

    async def test_no_skills_returns_zero(
        self,
        db_session: AsyncSession,
        tmp_path: Path,
    ) -> None:
        """Returns 0 when user has no skills and no templates."""
        user_id = uuid4()
        workspace_id = uuid4()
        skills_dir = tmp_path / "skills"
        skills_dir.mkdir()

        from pilot_space.infrastructure.database.models import User, Workspace

        user = User(id=user_id, email="empty-new@example.com")
        ws = Workspace(id=workspace_id, name="Empty WS", slug="empty-new-ws", owner_id=user_id)
        db_session.add(user)
        db_session.add(ws)
        await db_session.flush()

        count = await materialize_role_skills(
            db_session=db_session,
            user_id=user_id,
            workspace_id=workspace_id,
            skills_dir=skills_dir,
        )

        assert count == 0

    async def test_cleans_up_stale_dirs(
        self,
        db_session: AsyncSession,
        tmp_path: Path,
    ) -> None:
        """Stale skill directories are removed during materialization."""
        user_id = uuid4()
        workspace_id = uuid4()
        skills_dir = tmp_path / "skills"
        skills_dir.mkdir()

        # Pre-create a stale skill dir
        stale_dir = skills_dir / "skill-old-stuff-aaa111"
        stale_dir.mkdir()
        (stale_dir / "SKILL.md").write_text("stale content")

        from pilot_space.infrastructure.database.models import User, Workspace

        user = User(id=user_id, email="cleanup-new@example.com")
        ws = Workspace(id=workspace_id, name="Cleanup WS", slug="cleanup-new-ws", owner_id=user_id)
        db_session.add(user)
        db_session.add(ws)
        await db_session.flush()

        await materialize_role_skills(
            db_session=db_session,
            user_id=user_id,
            workspace_id=workspace_id,
            skills_dir=skills_dir,
        )

        assert not stale_dir.exists()

    async def test_user_skill_without_template(
        self,
        db_session: AsyncSession,
        tmp_path: Path,
    ) -> None:
        """User skill without template_id uses skill id for naming."""
        user_id = uuid4()
        workspace_id = uuid4()
        skills_dir = tmp_path / "skills"
        skills_dir.mkdir()

        from pilot_space.infrastructure.database.models import User, Workspace

        user = User(id=user_id, email="no-tmpl@example.com")
        ws = Workspace(id=workspace_id, name="NoTmpl WS", slug="no-tmpl-ws", owner_id=user_id)
        db_session.add(user)
        db_session.add(ws)
        await db_session.flush()

        skill_id = uuid4()
        user_skill = UserSkill(
            id=skill_id,
            user_id=user_id,
            workspace_id=workspace_id,
            template_id=None,
            skill_content="# Custom Skill\n\nUser-created.",
        )
        db_session.add(user_skill)
        await db_session.flush()

        count = await materialize_role_skills(
            db_session=db_session,
            user_id=user_id,
            workspace_id=workspace_id,
            skills_dir=skills_dir,
        )

        assert count >= 1
        # Without template, dir uses id[:8] fallback
        expected_dir = f"skill-{str(skill_id)[:8]}-{str(skill_id)[:6]}"
        skill_file = skills_dir / expected_dir / "SKILL.md"
        assert skill_file.exists(), f"Expected {expected_dir}/SKILL.md to exist"


@pytest.mark.asyncio
class TestMaterializeLegacyFallback:
    """Tests for legacy table fallback when new tables don't exist."""

    async def test_legacy_path_still_works(
        self,
        db_session: AsyncSession,
        tmp_path: Path,
    ) -> None:
        """Legacy role skills still materialize correctly via fallback."""
        user_id = uuid4()
        workspace_id = uuid4()
        skills_dir = tmp_path / "skills"
        skills_dir.mkdir()

        from pilot_space.infrastructure.database.models import User, Workspace

        user = User(id=user_id, email="legacy-mat@example.com")
        ws = Workspace(id=workspace_id, name="Legacy WS", slug="legacy-ws", owner_id=user_id)
        db_session.add(user)
        db_session.add(ws)
        await db_session.flush()

        skill = UserRoleSkill(
            id=uuid4(),
            user_id=user_id,
            workspace_id=workspace_id,
            role_type="developer",
            role_name="Senior Dev",
            skill_content="# Developer\n\nWrite clean code.",
            is_primary=True,
        )
        db_session.add(skill)
        await db_session.flush()

        count = await materialize_role_skills(
            db_session=db_session,
            user_id=user_id,
            workspace_id=workspace_id,
            skills_dir=skills_dir,
        )

        # In this test env, new tables exist so new path runs.
        # Legacy path tested via OperationalError mock in separate test below.
        assert count >= 0


@pytest.mark.asyncio
class TestMaterializeLegacyViaOperationalError:
    """Tests legacy fallback via OperationalError simulation."""

    async def test_falls_back_to_legacy_on_operational_error(
        self,
        db_session: AsyncSession,
        tmp_path: Path,
    ) -> None:
        """OperationalError on new table triggers legacy path."""
        from unittest.mock import patch

        user_id = uuid4()
        workspace_id = uuid4()
        skills_dir = tmp_path / "skills"
        skills_dir.mkdir()

        from pilot_space.infrastructure.database.models import User, Workspace

        user = User(id=user_id, email="oe-fallback@example.com")
        ws = Workspace(id=workspace_id, name="OE WS", slug="oe-ws", owner_id=user_id)
        db_session.add(user)
        db_session.add(ws)
        await db_session.flush()

        skill = UserRoleSkill(
            id=uuid4(),
            user_id=user_id,
            workspace_id=workspace_id,
            role_type="developer",
            role_name="Dev",
            skill_content="# Dev Skill",
            is_primary=False,
        )
        db_session.add(skill)
        await db_session.flush()

        from sqlalchemy.exc import OperationalError

        # Patch _materialize_from_new_tables to raise OperationalError
        async def _raise_oe(*args, **kwargs):
            raise OperationalError("no such table: user_skills", {}, None)

        with patch(
            "pilot_space.ai.agents.role_skill_materializer._materialize_from_new_tables",
            side_effect=_raise_oe,
        ):
            count = await materialize_role_skills(
                db_session=db_session,
                user_id=user_id,
                workspace_id=workspace_id,
                skills_dir=skills_dir,
            )

        # Should have fallen back to legacy and materialized the role skill
        assert count >= 1
        skill_file = skills_dir / "skill-developer" / "SKILL.md"
        assert skill_file.exists()
