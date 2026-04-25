"""Unit tests for skill_discovery — Phase 91 extensions.

Covers SkillInfo new fields (slug, reference_files, updated_at) and the
new ``get_skill_detail`` helper. The pre-existing discover_skills tests
live in tests/unit/api/test_skills_router.py and are kept untouched.
"""

from __future__ import annotations

import os
from datetime import UTC, datetime
from pathlib import Path

from pilot_space.ai.skills.skill_discovery import (
    ReferenceFileInfo,
    SkillDetail,
    discover_skills,
    get_skill_detail,
)


def _write_skill(
    skills_root: Path,
    slug: str,
    *,
    name: str | None = None,
    description: str = "Test skill",
    body: str = "# Body\n\nDetails here.\n",
    trigger: str | None = None,
) -> Path:
    """Create a synthetic skill directory with a minimal SKILL.md."""
    skill_dir = skills_root / slug
    skill_dir.mkdir(parents=True, exist_ok=True)
    frontmatter_lines = [f"name: {name or slug}", f"description: {description}"]
    if trigger:
        frontmatter_lines.append(f"trigger: {trigger}")
    frontmatter = "\n".join(frontmatter_lines)
    (skill_dir / "SKILL.md").write_text(
        f"---\n{frontmatter}\n---\n{body}",
        encoding="utf-8",
    )
    return skill_dir


# ---------------------------------------------------------------------------
# discover_skills — Phase 91 fields
# ---------------------------------------------------------------------------


class TestSkillInfoPhase91Fields:
    def test_slug_matches_directory_name(self, tmp_path: Path) -> None:
        _write_skill(tmp_path, "foo-skill")

        result = discover_skills(tmp_path)

        assert len(result) == 1
        assert result[0].slug == "foo-skill"

    def test_reference_files_excludes_skill_md_and_sorted(self, tmp_path: Path) -> None:
        skill_dir = _write_skill(tmp_path, "ref-skill")
        (skill_dir / "b.md").write_text("# B", encoding="utf-8")
        (skill_dir / "a.py").write_text("print('a')", encoding="utf-8")
        nested = skill_dir / "nested"
        nested.mkdir()
        (nested / "c.txt").write_text("c", encoding="utf-8")

        info = discover_skills(tmp_path)[0]

        assert info.reference_files == ["a.py", "b.md", "nested/c.txt"]
        assert "SKILL.md" not in info.reference_files

    def test_reference_files_excludes_dotfiles_and_pycache(self, tmp_path: Path) -> None:
        skill_dir = _write_skill(tmp_path, "noise-skill")
        (skill_dir / "real.md").write_text("ok", encoding="utf-8")
        (skill_dir / ".DS_Store").write_text("noise", encoding="utf-8")
        pycache = skill_dir / "__pycache__"
        pycache.mkdir()
        (pycache / "x.pyc").write_text("noise", encoding="utf-8")

        info = discover_skills(tmp_path)[0]

        assert info.reference_files == ["real.md"]

    def test_updated_at_is_utc_max_mtime(self, tmp_path: Path) -> None:
        skill_dir = _write_skill(tmp_path, "mtime-skill")
        ref = skill_dir / "ref.md"
        ref.write_text("# ref", encoding="utf-8")

        # Use an integer-second timestamp to avoid float precision flake.
        target_mtime = 1_700_000_000
        os.utime(ref, (target_mtime, target_mtime))
        # Make SKILL.md older so ref.md dominates.
        os.utime(skill_dir / "SKILL.md", (1_600_000_000, 1_600_000_000))

        info = discover_skills(tmp_path)[0]

        assert info.updated_at is not None
        assert info.updated_at.tzinfo is UTC
        assert info.updated_at == datetime.fromtimestamp(target_mtime, tz=UTC)


# ---------------------------------------------------------------------------
# get_skill_detail
# ---------------------------------------------------------------------------


class TestGetSkillDetail:
    def test_returns_body_after_frontmatter(self, tmp_path: Path) -> None:
        _write_skill(
            tmp_path,
            "body-skill",
            body="# Hello\n\nBody paragraph.\n",
        )

        detail = get_skill_detail(tmp_path, "body-skill")

        assert detail is not None
        assert isinstance(detail, SkillDetail)
        assert detail.body.lstrip().startswith("# Hello")
        # Frontmatter must NOT leak into body.
        assert "name: body-skill" not in detail.body

    def test_unknown_slug_returns_none(self, tmp_path: Path) -> None:
        _write_skill(tmp_path, "real-skill")

        assert get_skill_detail(tmp_path, "missing") is None

    def test_reference_file_meta_size_and_mime(self, tmp_path: Path) -> None:
        skill_dir = _write_skill(tmp_path, "meta-skill")
        contents = "# Architecture\n\nMatters.\n"
        (skill_dir / "architecture.md").write_text(contents, encoding="utf-8")

        detail = get_skill_detail(tmp_path, "meta-skill")

        assert detail is not None
        assert len(detail.reference_files) == 1
        ref = detail.reference_files[0]
        assert isinstance(ref, ReferenceFileInfo)
        assert ref.name == "architecture.md"
        assert ref.path == "architecture.md"
        assert ref.size_bytes == len(contents.encode("utf-8"))
        # mimetypes returns "text/markdown" or "text/plain" depending on platform.
        assert ref.mime_type in {"text/markdown", "text/plain", "application/octet-stream"}

    def test_skips_non_invocable_trigger(self, tmp_path: Path) -> None:
        _write_skill(tmp_path, "cron-skill", trigger="scheduled")

        assert get_skill_detail(tmp_path, "cron-skill") is None

    def test_slug_path_traversal_returns_none(self, tmp_path: Path) -> None:
        # Create skills_dir as a subdir so escaping it is meaningful.
        skills_dir = tmp_path / "skills"
        skills_dir.mkdir()
        _write_skill(skills_dir, "real-skill")
        # A peer dir outside skills_dir.
        outside = tmp_path / "outside"
        outside.mkdir()
        (outside / "SKILL.md").write_text(
            "---\nname: outside\ndescription: x\n---\n# x\n", encoding="utf-8"
        )

        assert get_skill_detail(skills_dir, "../outside") is None

    def test_skip_non_directory_skills_dir_returns_none(self, tmp_path: Path) -> None:
        # skills_dir does not exist
        assert get_skill_detail(tmp_path / "missing", "any") is None

    def test_missing_skill_md_returns_none(self, tmp_path: Path) -> None:
        (tmp_path / "no-skill-md").mkdir()

        assert get_skill_detail(tmp_path, "no-skill-md") is None
