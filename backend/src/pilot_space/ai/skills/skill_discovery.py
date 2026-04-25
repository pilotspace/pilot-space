"""Skill discovery service.

Scans the skills template directory, parses YAML frontmatter from each
SKILL.md, merges with UI metadata, and returns a list of user-invocable skills.
"""

from __future__ import annotations

import mimetypes
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

import yaml

from pilot_space.ai.skills.skill_metadata import get_skill_ui_metadata
from pilot_space.infrastructure.logging import get_logger

logger = get_logger(__name__)

# Triggers that indicate the skill is NOT user-invocable via slash command
_NON_INVOCABLE_TRIGGERS = frozenset({"scheduled", "intent_detection"})

# Compiled once, reused for every parse
_FRONTMATTER_RE = re.compile(r"^---\n(.*?)\n---\n", re.DOTALL)

# Reference-file enumeration filters
_REFERENCE_FILE_EXCLUDES = frozenset({"SKILL.md", ".DS_Store"})
_REFERENCE_FILE_EXCLUDED_DIRS = frozenset({"__pycache__", ".git"})


@dataclass(frozen=True, slots=True)
class SkillInfo:
    """Parsed skill definition ready for API response."""

    name: str
    description: str
    category: str
    icon: str
    examples: list[str] = field(default_factory=list)
    feature_module: list[str] | None = field(default=None)
    # Phase 91 additions — populated by discover_skills/_parse_skill_file.
    slug: str = ""
    reference_files: list[str] = field(default_factory=list)
    updated_at: datetime | None = None


@dataclass(frozen=True, slots=True)
class ReferenceFileInfo:
    """Per-file metadata for the skill detail response."""

    name: str
    path: str
    size_bytes: int
    mime_type: str


@dataclass(frozen=True, slots=True)
class SkillDetail:
    """Detail payload for a single skill including markdown body + ref files."""

    info: SkillInfo
    body: str
    reference_files: list[ReferenceFileInfo]


def discover_skills(skills_dir: Path) -> list[SkillInfo]:
    """Discover all user-invocable skills from the templates directory.

    Args:
        skills_dir: Path to the ``templates/skills/`` directory.

    Returns:
        Sorted list of :class:`SkillInfo` for skills that are user-invocable.
    """
    if not skills_dir.is_dir():
        logger.warning("Skills directory not found: %s", skills_dir)
        return []

    skills: list[SkillInfo] = []

    for skill_dir in sorted(skills_dir.iterdir()):
        if not skill_dir.is_dir():
            continue

        skill_file = skill_dir / "SKILL.md"
        if not skill_file.exists():
            continue

        try:
            info = _parse_skill_file(skill_file)
            if info is not None:
                skills.append(info)
        except Exception:
            logger.warning("Failed to parse skill %s", skill_file, exc_info=True)

    return skills


def get_skill_detail(skills_dir: Path, slug: str) -> SkillDetail | None:
    """Return the detail payload for a single skill or None if missing/non-invocable.

    Performs slug containment check (`is_relative_to(skills_dir)` after resolve)
    so that any escape attempt via ``slug`` (e.g. ``"../etc"``) is rejected at
    the discovery layer — the router does not have to repeat this check.

    Args:
        skills_dir: Path to the ``templates/skills/`` directory.
        slug: Skill directory name (URL-safe; never trusted for filesystem safety).

    Returns:
        :class:`SkillDetail` for a valid invocable skill, otherwise None.
    """
    if not skills_dir.is_dir():
        return None
    skills_dir_resolved = skills_dir.resolve()
    skill_root = (skills_dir / slug).resolve()
    # Slug containment — defends against `slug == "../etc"` where the resolved
    # path escapes skills_dir.
    if not skill_root.is_relative_to(skills_dir_resolved):
        return None
    if not skill_root.is_dir():
        return None
    skill_file = skill_root / "SKILL.md"
    if not skill_file.is_file():
        return None
    info = _parse_skill_file(skill_file)
    if info is None:
        return None  # non-invocable trigger or malformed frontmatter
    content = skill_file.read_text(encoding="utf-8")
    match = _FRONTMATTER_RE.match(content)
    body = content[match.end() :] if match else content
    refs: list[ReferenceFileInfo] = []
    for rel_path in info.reference_files:
        candidate = skill_root / rel_path
        try:
            size = candidate.stat().st_size
        except OSError:
            continue
        mime, _ = mimetypes.guess_type(candidate.name, strict=False)
        refs.append(
            ReferenceFileInfo(
                name=candidate.name,
                path=rel_path,
                size_bytes=size,
                mime_type=mime or "application/octet-stream",
            )
        )
    return SkillDetail(info=info, body=body, reference_files=refs)


def _collect_reference_files(skill_dir: Path) -> list[str]:
    """Enumerate reference files inside a skill directory.

    Excludes SKILL.md, dotfiles, and files under ``__pycache__``/``.git``.
    Paths are returned relative to ``skill_dir`` using POSIX separators and
    sorted for deterministic ordering.
    """
    matches: list[str] = []
    for path in skill_dir.rglob("*"):
        if not path.is_file():
            continue
        if path.name in _REFERENCE_FILE_EXCLUDES:
            continue
        if path.name.startswith("."):
            continue
        rel_parts = path.relative_to(skill_dir).parts
        if any(part in _REFERENCE_FILE_EXCLUDED_DIRS for part in rel_parts[:-1]):
            continue
        matches.append(path.relative_to(skill_dir).as_posix())
    matches.sort()
    return matches


def _collect_max_mtime(skill_dir: Path) -> datetime | None:
    """Return the max mtime across all files in ``skill_dir`` as a UTC datetime."""
    mtimes: list[float] = []
    for path in skill_dir.rglob("*"):
        if path.is_file():
            try:
                mtimes.append(path.stat().st_mtime)
            except OSError:
                continue
    if not mtimes:
        return None
    return datetime.fromtimestamp(max(mtimes), tz=UTC)


def _parse_skill_file(skill_file: Path) -> SkillInfo | None:
    """Parse a single SKILL.md and return a SkillInfo, or None if not invocable."""
    content = skill_file.read_text(encoding="utf-8")

    match = _FRONTMATTER_RE.match(content)
    if not match:
        logger.warning("Missing YAML frontmatter in %s", skill_file)
        return None

    frontmatter: dict[str, object] = yaml.safe_load(match.group(1)) or {}

    # Filter out non-invocable skills (scheduled cron jobs, intent-only)
    trigger = str(frontmatter.get("trigger", ""))
    if trigger in _NON_INVOCABLE_TRIGGERS:
        logger.debug(
            "Skipping non-invocable skill %s (trigger=%s)", skill_file.parent.name, trigger
        )
        return None

    name = str(frontmatter.get("name", "")) or skill_file.parent.name
    description = str(frontmatter.get("description", ""))

    # Parse feature_module — normalize single string to list.
    # Invalid types (int, dict, bool, etc.) produce [] so the skill is gated
    # out rather than bypassing feature checks via the None="always keep" path.
    raw_module = frontmatter.get("feature_module")
    feature_module: list[str] | None = None
    if isinstance(raw_module, str):
        feature_module = [raw_module]
    elif isinstance(raw_module, list):
        feature_module = [str(m) for m in raw_module]
    elif raw_module is not None:
        # Malformed value — restrict rather than bypass gating.
        feature_module = []

    ui = get_skill_ui_metadata(name)

    skill_dir = skill_file.parent
    slug = skill_dir.name
    reference_files = _collect_reference_files(skill_dir)
    updated_at = _collect_max_mtime(skill_dir)

    return SkillInfo(
        name=name,
        description=description,
        category=ui.category,
        icon=ui.icon,
        examples=list(ui.examples),
        feature_module=feature_module,
        slug=slug,
        reference_files=reference_files,
        updated_at=updated_at,
    )


def filter_skills_by_features(
    skills: list[SkillInfo],
    feature_toggles: dict[str, bool],
) -> list[SkillInfo]:
    """Filter skills based on workspace feature toggles.

    A skill is removed only when ALL of its feature_module values are
    disabled.  Skills with ``feature_module=None`` (no gate declared) are
    always kept.  Skills with ``feature_module=[]`` (malformed/unknown gate)
    are always removed — ``any()`` over an empty iterable is False.

    Callers are expected to pass a fully-populated toggle dict (schema
    defaults merged with stored overrides) so that missing keys are not
    silently treated as enabled or disabled.  The fallback default here
    is ``False`` (disabled) to be conservative — the normalisation in
    pilotspace_agent._build_stream_config is the canonical source of truth.

    Args:
        skills: List of discovered skills.
        feature_toggles: Fully-populated mapping of feature key to
            enabled/disabled state (defaults already merged by caller).

    Returns:
        Filtered list of skills that are available in this workspace.
    """
    result: list[SkillInfo] = []
    for skill in skills:
        if skill.feature_module is None:
            result.append(skill)
            continue
        # Keep if ANY listed module is enabled.
        # Default to False: a missing key means the caller didn't normalise
        # properly; being conservative avoids exposing disabled-feature tools.
        if any(feature_toggles.get(m, False) for m in skill.feature_module):
            result.append(skill)
    return result


__all__ = [
    "ReferenceFileInfo",
    "SkillDetail",
    "SkillInfo",
    "discover_skills",
    "filter_skills_by_features",
    "get_skill_detail",
]
