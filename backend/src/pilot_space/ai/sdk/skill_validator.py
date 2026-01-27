"""Skill validator for validating SKILL.md files against schema.

Validates skill definition files to ensure they contain required fields
and follow the expected structure.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import ClassVar

import yaml


@dataclass(frozen=True, slots=True)
class ValidationError:
    """Validation error for a skill file."""

    field: str
    message: str
    line_number: int | None = None


@dataclass(frozen=True, slots=True)
class ValidationResult:
    """Result of skill validation."""

    is_valid: bool
    errors: list[ValidationError]

    @property
    def error_messages(self) -> list[str]:
        """Get formatted error messages."""
        return [f"{e.field}: {e.message}" for e in self.errors]


class SkillValidator:
    """Validator for SKILL.md files.

    Validates skill files against required schema:
    - YAML frontmatter with name and description
    - Required sections: Quick Start, Workflow, Output Format, Examples
    - Optional sections: Integration Points, References
    """

    REQUIRED_FRONTMATTER_FIELDS: ClassVar[set[str]] = {"name", "description"}
    REQUIRED_SECTIONS: ClassVar[set[str]] = {
        "Quick Start",
        "Workflow",
        "Output Format",
        "Examples",
    }
    OPTIONAL_SECTIONS: ClassVar[set[str]] = {"Integration Points", "References"}

    def validate_file(self, skill_file: Path) -> ValidationResult:
        """Validate a SKILL.md file.

        Args:
            skill_file: Path to SKILL.md file to validate.

        Returns:
            ValidationResult with errors if any.
        """
        errors: list[ValidationError] = []

        # Check file exists
        if not skill_file.exists():
            errors.append(
                ValidationError(
                    field="file",
                    message=f"Skill file not found: {skill_file}",
                )
            )
            return ValidationResult(is_valid=False, errors=errors)

        # Read content
        try:
            content = skill_file.read_text(encoding="utf-8")
        except Exception as e:
            errors.append(
                ValidationError(
                    field="file",
                    message=f"Failed to read file: {e}",
                )
            )
            return ValidationResult(is_valid=False, errors=errors)

        # Validate frontmatter
        frontmatter_errors = self._validate_frontmatter(content)
        errors.extend(frontmatter_errors)

        # Validate sections
        section_errors = self._validate_sections(content)
        errors.extend(section_errors)

        return ValidationResult(
            is_valid=len(errors) == 0,
            errors=errors,
        )

    def _validate_frontmatter(self, content: str) -> list[ValidationError]:
        """Validate YAML frontmatter.

        Args:
            content: Full SKILL.md content.

        Returns:
            List of validation errors.
        """
        errors: list[ValidationError] = []

        # Check for frontmatter
        frontmatter_match = re.match(r"^---\n(.*?)\n---\n", content, re.DOTALL)
        if not frontmatter_match:
            errors.append(
                ValidationError(
                    field="frontmatter",
                    message="Missing YAML frontmatter (should start with ---)",
                    line_number=1,
                )
            )
            return errors

        # Parse YAML
        try:
            frontmatter = yaml.safe_load(frontmatter_match.group(1))
        except yaml.YAMLError as e:
            errors.append(
                ValidationError(
                    field="frontmatter",
                    message=f"Invalid YAML: {e}",
                    line_number=1,
                )
            )
            return errors

        # Validate required fields
        for field in self.REQUIRED_FRONTMATTER_FIELDS:
            if field not in frontmatter:
                errors.append(
                    ValidationError(
                        field=f"frontmatter.{field}",
                        message=f"Missing required field: {field}",
                        line_number=1,
                    )
                )
            elif not frontmatter[field]:
                errors.append(
                    ValidationError(
                        field=f"frontmatter.{field}",
                        message=f"Field cannot be empty: {field}",
                        line_number=1,
                    )
                )

        # Validate field types
        if "name" in frontmatter and not isinstance(frontmatter["name"], str):
            errors.append(
                ValidationError(
                    field="frontmatter.name",
                    message="Field 'name' must be a string",
                    line_number=1,
                )
            )

        if "description" in frontmatter and not isinstance(frontmatter["description"], str):
            errors.append(
                ValidationError(
                    field="frontmatter.description",
                    message="Field 'description' must be a string",
                    line_number=1,
                )
            )

        # Validate name format (lowercase with hyphens)
        if "name" in frontmatter and isinstance(frontmatter["name"], str):
            name = frontmatter["name"]
            if not re.match(r"^[a-z][a-z0-9-]*$", name):
                errors.append(
                    ValidationError(
                        field="frontmatter.name",
                        message="Name must be lowercase with hyphens (e.g., extract-issues)",
                        line_number=1,
                    )
                )

        return errors

    def _validate_sections(self, content: str) -> list[ValidationError]:
        """Validate required markdown sections.

        Args:
            content: Full SKILL.md content.

        Returns:
            List of validation errors.
        """
        errors: list[ValidationError] = []

        # Find all section headings (## Section Name)
        sections = re.findall(r"^##\s+(.+)$", content, re.MULTILINE)

        # Check required sections
        for section in self.REQUIRED_SECTIONS:
            if section not in sections:
                errors.append(
                    ValidationError(
                        field=f"section.{section}",
                        message=f"Missing required section: {section}",
                    )
                )

        # Validate Workflow section structure
        if "Workflow" in sections:
            workflow_errors = self._validate_workflow_section(content)
            errors.extend(workflow_errors)

        # Validate Output Format section structure
        if "Output Format" in sections:
            output_errors = self._validate_output_format_section(content)
            errors.extend(output_errors)

        # Validate Examples section structure
        if "Examples" in sections:
            examples_errors = self._validate_examples_section(content)
            errors.extend(examples_errors)

        return errors

    def _validate_workflow_section(self, content: str) -> list[ValidationError]:
        """Validate Workflow section structure.

        Args:
            content: Full SKILL.md content.

        Returns:
            List of validation errors.
        """
        errors: list[ValidationError] = []

        # Extract Workflow section
        workflow_match = re.search(
            r"##\s+Workflow\s*\n(.*?)(?=\n##|\Z)",
            content,
            re.DOTALL,
        )

        if not workflow_match:
            return errors

        workflow_content = workflow_match.group(1)

        # Check for numbered list items
        steps = re.findall(r"^\d+\.\s+\*\*(.+?)\*\*", workflow_content, re.MULTILINE)

        if not steps:
            errors.append(
                ValidationError(
                    field="section.Workflow",
                    message="Workflow section must contain numbered steps (1. **Step Name**)",
                )
            )

        return errors

    def _validate_output_format_section(self, content: str) -> list[ValidationError]:
        """Validate Output Format section structure.

        Args:
            content: Full SKILL.md content.

        Returns:
            List of validation errors.
        """
        errors: list[ValidationError] = []

        # Extract Output Format section
        output_match = re.search(
            r"##\s+Output Format\s*\n(.*?)(?=\n##|\Z)",
            content,
            re.DOTALL,
        )

        if not output_match:
            return errors

        output_content = output_match.group(1)

        # Check for JSON code block
        if "```json" not in output_content:
            errors.append(
                ValidationError(
                    field="section.Output Format",
                    message="Output Format section should contain JSON code block",
                )
            )

        return errors

    def _validate_examples_section(self, content: str) -> list[ValidationError]:
        """Validate Examples section structure.

        Args:
            content: Full SKILL.md content.

        Returns:
            List of validation errors.
        """
        errors: list[ValidationError] = []

        # Extract Examples section
        examples_match = re.search(
            r"##\s+Examples\s*\n(.*?)(?=\n##|\Z)",
            content,
            re.DOTALL,
        )

        if not examples_match:
            return errors

        examples_content = examples_match.group(1)

        # Check for example subsections (### Example N)
        example_count = len(re.findall(r"###\s+Example\s+\d+", examples_content))

        if example_count == 0:
            errors.append(
                ValidationError(
                    field="section.Examples",
                    message="Examples section should contain at least one example (### Example 1)",
                )
            )

        return errors


def validate_skill_file(skill_file: Path) -> ValidationResult:
    """Validate a skill file.

    Convenience function for validating a single skill file.

    Args:
        skill_file: Path to SKILL.md file.

    Returns:
        ValidationResult with errors if any.
    """
    validator = SkillValidator()
    return validator.validate_file(skill_file)
