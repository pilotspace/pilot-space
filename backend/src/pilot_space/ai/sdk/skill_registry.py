"""Skill registry for discovering and loading skills from filesystem.

Provides filesystem-based skill discovery, parsing, and caching for
PilotSpace AI agents. Skills are defined in .claude/skills/*/SKILL.md files.

Reference: docs/architect/claude-agent-sdk-architecture.md
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml


@dataclass(frozen=True, slots=True)
class SkillDefinition:
    """Parsed skill definition from SKILL.md file."""

    name: str
    description: str
    when_to_use: str
    workflow: list[str]
    output_format: dict[str, Any]
    examples: list[dict[str, Any]]
    integration_points: list[str]
    file_path: Path

    @property
    def inputs(self) -> dict[str, Any]:
        """Extract input schema from workflow section."""
        # For MVP, inputs are implicit in workflow description
        # Future: Parse explicit input schema from SKILL.md
        return {}

    @property
    def outputs(self) -> dict[str, Any]:
        """Extract output schema from output_format section."""
        return self.output_format


class SkillRegistry:
    """Registry for discovering and caching skill definitions.

    Scans .claude/skills/ directory for SKILL.md files, parses them,
    and provides query interface for finding relevant skills.

    Attributes:
        skills_dir: Path to skills directory (.claude/skills)
        _cache: Cached skill definitions (name -> SkillDefinition)
    """

    def __init__(self, skills_dir: Path | str) -> None:
        """Initialize skill registry.

        Args:
            skills_dir: Path to skills directory containing skill folders.
        """
        self.skills_dir = Path(skills_dir)
        self._cache: dict[str, SkillDefinition] = {}
        self._loaded = False

    def _discover_skills(self) -> None:
        """Discover all SKILL.md files in skills directory."""
        if not self.skills_dir.exists():
            return

        for skill_folder in self.skills_dir.iterdir():
            if not skill_folder.is_dir():
                continue

            skill_file = skill_folder / "SKILL.md"
            if not skill_file.exists():
                continue

            try:
                skill_def = self._parse_skill_file(skill_file)
                self._cache[skill_def.name] = skill_def
            except Exception:
                # Skip invalid skill files
                continue

    def _parse_skill_file(self, skill_file: Path) -> SkillDefinition:
        """Parse SKILL.md file into SkillDefinition.

        Args:
            skill_file: Path to SKILL.md file.

        Returns:
            Parsed SkillDefinition.

        Raises:
            ValueError: If skill file is invalid.
        """
        content = skill_file.read_text(encoding="utf-8")

        # Extract YAML frontmatter
        frontmatter_match = re.match(r"^---\n(.*?)\n---\n", content, re.DOTALL)
        if not frontmatter_match:
            raise ValueError(f"Missing YAML frontmatter in {skill_file}")

        frontmatter = yaml.safe_load(frontmatter_match.group(1))
        name = frontmatter.get("name")
        description = frontmatter.get("description")

        if not name or not description:
            raise ValueError(f"Missing name or description in {skill_file}")

        # Parse sections
        when_to_use = self._extract_section(content, "Quick Start") or ""
        workflow = self._extract_workflow(content)
        output_format = self._extract_output_format(content)
        examples = self._extract_examples(content)
        integration_points = self._extract_integration_points(content)

        return SkillDefinition(
            name=name,
            description=description,
            when_to_use=when_to_use,
            workflow=workflow,
            output_format=output_format,
            examples=examples,
            integration_points=integration_points,
            file_path=skill_file,
        )

    def _extract_section(self, content: str, section_name: str) -> str | None:
        """Extract content of a markdown section.

        Args:
            content: Full SKILL.md content.
            section_name: Section heading to extract.

        Returns:
            Section content or None if not found.
        """
        pattern = rf"##\s+{re.escape(section_name)}\s*\n(.*?)(?=\n##|\Z)"
        match = re.search(pattern, content, re.DOTALL)
        return match.group(1).strip() if match else None

    def _extract_workflow(self, content: str) -> list[str]:
        """Extract workflow steps from Workflow section.

        Args:
            content: Full SKILL.md content.

        Returns:
            List of workflow step descriptions.
        """
        workflow_section = self._extract_section(content, "Workflow")
        if not workflow_section:
            return []

        # Extract numbered list items
        return re.findall(r"\d+\.\s+\*\*(.+?)\*\*", workflow_section)

    def _extract_output_format(self, content: str) -> dict[str, Any]:
        """Extract output format from Output Format section.

        Args:
            content: Full SKILL.md content.

        Returns:
            Output format schema (simplified for MVP).
        """
        output_section = self._extract_section(content, "Output Format")
        if not output_section:
            return {}

        # For MVP, just indicate that structured JSON is expected
        # Future: Parse JSON schema from code block
        return {"type": "json", "description": "Structured JSON output"}

    def _extract_examples(self, content: str) -> list[dict[str, Any]]:
        """Extract examples from Examples section.

        Args:
            content: Full SKILL.md content.

        Returns:
            List of example objects (input/output pairs).
        """
        examples_section = self._extract_section(content, "Examples")
        if not examples_section:
            return []

        # For MVP, just count examples
        # Future: Parse actual input/output pairs
        example_count = len(re.findall(r"###\s+Example\s+\d+", examples_section))
        return [{"id": i + 1} for i in range(example_count)]

    def _extract_integration_points(self, content: str) -> list[str]:
        """Extract integration points from Integration Points section.

        Args:
            content: Full SKILL.md content.

        Returns:
            List of integration point descriptions.
        """
        integration_section = self._extract_section(content, "Integration Points")
        if not integration_section:
            return []

        # Extract bullet points
        return re.findall(r"^-\s+\*\*(.+?)\*\*:", integration_section, re.MULTILINE)

    def get_skill(self, name: str) -> SkillDefinition | None:
        """Get skill definition by name.

        Args:
            name: Skill name (e.g., "extract-issues").

        Returns:
            SkillDefinition if found, None otherwise.
        """
        if not self._loaded:
            self._discover_skills()
            self._loaded = True

        return self._cache.get(name)

    def list_skills(self) -> list[SkillDefinition]:
        """List all available skills.

        Returns:
            List of all discovered SkillDefinitions.
        """
        if not self._loaded:
            self._discover_skills()
            self._loaded = True

        return list(self._cache.values())

    def search_skills(self, query: str) -> list[SkillDefinition]:
        """Search skills by query string.

        Searches in skill name, description, and when_to_use fields.

        Args:
            query: Search query string.

        Returns:
            List of matching SkillDefinitions.
        """
        if not self._loaded:
            self._discover_skills()
            self._loaded = True

        query_lower = query.lower()
        results: list[SkillDefinition] = []

        for skill in self._cache.values():
            # Search in name, description, and when_to_use
            searchable = f"{skill.name} {skill.description} {skill.when_to_use}".lower()
            if query_lower in searchable:
                results.append(skill)

        return results

    def reload(self) -> None:
        """Reload all skills from filesystem.

        Useful for development when skills are being modified.
        """
        self._cache.clear()
        self._loaded = False
        self._discover_skills()
        self._loaded = True
