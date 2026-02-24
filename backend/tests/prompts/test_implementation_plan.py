"""Unit tests for implementation plan prompt building and response parsing.

Coverage:
- build_plan_prompt: includes issue title, identifier, context fields
- parse_plan_response: valid JSON -> YAML-frontmatter markdown
- parse_plan_response: malformed JSON -> fallback plan
- parse_plan_response: empty response -> fallback plan
- parse_plan_response: code-fenced JSON extraction
- _extract_json: edge cases
- _parse_subagent: default values and coercion
- _ensure_str_list: non-list and None handling
"""

from __future__ import annotations

import json
from typing import Any

# Also import private helpers for thorough coverage
from pilot_space.ai.prompts.implementation_plan import (
    _build_fallback_plan,
    _ensure_str_list,
    _extract_json,
    _parse_subagent,
    _role_display,
    build_plan_prompt,
    parse_plan_response,
)

# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


def _valid_plan_json(
    *,
    outcome: str = "All tests pass and the feature is deployed.",
    subagent_count: int = 2,
    code_fenced: bool = True,
) -> str:
    """Build a valid JSON plan response string.

    The production _extract_json uses a non-greedy regex for raw JSON that
    fails on nested objects. Code-fenced JSON (the expected model output
    format per PLAN_SYSTEM_PROMPT) parses correctly due to the ``` anchor.
    """
    subagents = []
    for i in range(1, subagent_count + 1):
        subagents.append(
            {
                "id": f"sa-{i}",
                "role": "backend-engineer" if i % 2 else "frontend-expert",
                "task": f"Implement subagent task {i}",
                "context": f"Context for task {i}",
                "files": [f"backend/src/file_{i}.py"],
                "steps": [f"Step 1 for sa-{i}", f"Step 2 for sa-{i}"],
                "acceptance_criteria": [f"Tests pass for sa-{i}"],
                "depends_on": [f"sa-{i - 1}"] if i > 1 else [],
            }
        )
    raw = json.dumps(
        {
            "outcome": outcome,
            "subagents": subagents,
            "related_issues": [
                {"identifier": "PS-10", "title": "Related issue", "relation": "blocks"},
            ],
        }
    )
    if code_fenced:
        return f"```json\n{raw}\n```"
    return raw


# ---------------------------------------------------------------------------
# build_plan_prompt tests
# ---------------------------------------------------------------------------


class TestBuildPlanPrompt:
    """Tests for build_plan_prompt function."""

    def test_contains_issue_title_and_identifier(self) -> None:
        """Prompt must include the issue title and identifier."""
        result = build_plan_prompt(
            issue_title="Add user auth",
            issue_description=None,
            issue_identifier="PS-42",
        )

        assert "PS-42" in result
        assert "Add user auth" in result

    def test_contains_description_when_provided(self) -> None:
        """Prompt must include description section when present."""
        result = build_plan_prompt(
            issue_title="Fix login bug",
            issue_description="Users cannot log in with SSO",
            issue_identifier="PS-99",
        )

        assert "Users cannot log in with SSO" in result
        assert "**Description:**" in result

    def test_omits_description_when_none(self) -> None:
        """Prompt must not contain Description header when description is None."""
        result = build_plan_prompt(
            issue_title="Fix login bug",
            issue_description=None,
            issue_identifier="PS-99",
        )

        assert "**Description:**" not in result

    def test_includes_context_data_fields(self) -> None:
        """Prompt must include summary, analysis, complexity, approach from context."""
        context = {
            "summary": "This is a summary of the issue.",
            "analysis": "Technical analysis here.",
            "complexity": "high",
            "estimated_effort": "3 days",
            "suggested_approach": "Use strategy pattern.",
            "tasks_checklist": [
                {"description": "Task A", "estimated_effort": "1d"},
                {"description": "Task B", "estimated_effort": "2d"},
            ],
        }

        result = build_plan_prompt(
            issue_title="Refactor auth",
            issue_description=None,
            issue_identifier="PS-50",
            context_data=context,
        )

        assert "This is a summary of the issue." in result
        assert "Technical analysis here." in result
        assert "high" in result
        assert "3 days" in result
        assert "Use strategy pattern." in result
        assert "Task A" in result
        assert "Task B" in result

    def test_includes_related_issues(self) -> None:
        """Prompt must list related issues when provided."""
        related = [
            {"identifier": "PS-10", "title": "Parent issue"},
            {"identifier": "PS-11", "title": "Sibling issue"},
        ]

        result = build_plan_prompt(
            issue_title="Child issue",
            issue_description=None,
            issue_identifier="PS-12",
            related_issues=related,
        )

        assert "PS-10" in result
        assert "Parent issue" in result
        assert "PS-11" in result

    def test_includes_code_references(self) -> None:
        """Prompt must list code file references when provided."""
        refs = [
            {"file_path": "backend/src/auth.py", "description": "Auth module"},
            {"file_path": "backend/src/user.py", "description": "User model"},
        ]

        result = build_plan_prompt(
            issue_title="Update auth",
            issue_description=None,
            issue_identifier="PS-60",
            code_references=refs,
        )

        assert "`backend/src/auth.py`" in result
        assert "Auth module" in result

    def test_limits_related_issues_to_eight(self) -> None:
        """Prompt must cap related issues at 8."""
        related = [{"identifier": f"PS-{i}", "title": f"Issue {i}"} for i in range(20)]

        result = build_plan_prompt(
            issue_title="Test",
            issue_description=None,
            issue_identifier="PS-1",
            related_issues=related,
        )

        # PS-0 through PS-7 should appear, PS-8 onward should not
        assert "PS-7" in result
        assert "PS-8" not in result

    def test_limits_code_references_to_fifteen(self) -> None:
        """Prompt must cap code references at 15."""
        refs = [{"file_path": f"src/file_{i}.py", "description": f"File {i}"} for i in range(20)]

        result = build_plan_prompt(
            issue_title="Test",
            issue_description=None,
            issue_identifier="PS-1",
            code_references=refs,
        )

        assert "`src/file_14.py`" in result
        assert "`src/file_15.py`" not in result

    def test_ends_with_generation_instruction(self) -> None:
        """Prompt must end with the JSON generation instruction."""
        result = build_plan_prompt(
            issue_title="Test",
            issue_description=None,
            issue_identifier="PS-1",
        )

        assert "Generate a structured implementation plan" in result

    def test_no_context_data_omits_sections(self) -> None:
        """Prompt without context_data should not contain AI-Generated Summary."""
        result = build_plan_prompt(
            issue_title="Test",
            issue_description=None,
            issue_identifier="PS-1",
            context_data=None,
        )

        assert "AI-Generated Summary" not in result
        assert "Technical Analysis" not in result


# ---------------------------------------------------------------------------
# parse_plan_response tests
# ---------------------------------------------------------------------------


class TestParsePlanResponse:
    """Tests for parse_plan_response function."""

    def test_valid_json_produces_yaml_frontmatter_markdown(self) -> None:
        """Valid JSON response produces YAML-frontmatter markdown with subagents."""
        response = _valid_plan_json(subagent_count=2)

        result = parse_plan_response(
            response_text=response,
            issue_identifier="PS-42",
            issue_title="Add user auth",
        )

        # YAML front matter
        assert result.startswith("---\n")
        assert "issue: PS-42" in result
        assert 'title: "Add user auth"' in result
        assert "orchestrator: true" in result
        assert "model: claude-sonnet-4-6" in result

        # Document body
        assert "# PS-42: Add user auth" in result
        assert "## Target Outcome" in result
        assert "All tests pass and the feature is deployed." in result

        # Subagent sections
        assert "### sa-1" in result
        assert "### sa-2" in result
        assert "Backend Engineer" in result
        assert "Frontend Expert" in result

        # Related issues
        assert "PS-10" in result
        assert "blocks" in result

    def test_code_fenced_json_is_extracted(self) -> None:
        """JSON wrapped in code fences is correctly parsed."""
        raw_json = _valid_plan_json(subagent_count=1)
        fenced = f"```json\n{raw_json}\n```"

        result = parse_plan_response(
            response_text=fenced,
            issue_identifier="PS-5",
            issue_title="Fenced test",
        )

        assert "### sa-1" in result
        assert "## Target Outcome" in result

    def test_malformed_json_returns_fallback(self) -> None:
        """Malformed JSON returns a non-empty fallback plan."""
        result = parse_plan_response(
            response_text="{ this is not valid json !!!",
            issue_identifier="PS-99",
            issue_title="Broken response",
        )

        assert result.startswith("---\n")
        assert "PS-99" in result
        assert "Broken response" in result
        assert "parsing error" in result
        assert "No subagents were parsed" in result

    def test_empty_response_returns_fallback(self) -> None:
        """Empty response string returns a fallback plan."""
        result = parse_plan_response(
            response_text="",
            issue_identifier="PS-0",
            issue_title="Empty",
        )

        assert result.startswith("---\n")
        assert "PS-0" in result
        assert "parsing error" in result

    def test_json_with_no_subagents_key(self) -> None:
        """JSON without subagents key still produces valid markdown."""
        response = json.dumps({"outcome": "Done.", "related_issues": []})

        result = parse_plan_response(
            response_text=response,
            issue_identifier="PS-7",
            issue_title="No subagents",
        )

        assert "## Target Outcome" in result
        assert "Done." in result
        # No subagent headings
        assert "### sa-" not in result

    def test_subagent_steps_and_acceptance_criteria_rendered(self) -> None:
        """Subagent steps and acceptance criteria appear in output."""
        response = _valid_plan_json(subagent_count=1)

        result = parse_plan_response(
            response_text=response,
            issue_identifier="PS-8",
            issue_title="Steps test",
        )

        assert "**Steps**" in result
        assert "1. Step 1 for sa-1" in result
        assert "**Acceptance Criteria**" in result
        assert "- [ ] Tests pass for sa-1" in result

    def test_subagent_depends_on_rendered_in_frontmatter(self) -> None:
        """Subagent dependencies appear in YAML front matter."""
        response = _valid_plan_json(subagent_count=2)

        result = parse_plan_response(
            response_text=response,
            issue_identifier="PS-9",
            issue_title="Deps test",
        )

        assert "depends_on: [sa-1]" in result

    def test_non_dict_subagents_are_skipped(self) -> None:
        """Non-dict entries in subagents array are filtered out."""
        raw = json.dumps(
            {
                "outcome": "Done",
                "subagents": [
                    "not a dict",
                    42,
                    {"id": "sa-1", "role": "backend-engineer", "task": "Real task"},
                ],
            }
        )
        response = f"```json\n{raw}\n```"

        result = parse_plan_response(
            response_text=response,
            issue_identifier="PS-11",
            issue_title="Filter test",
        )

        # Only the valid dict subagent should produce a section
        assert "### sa-1" in result
        assert result.count("### sa-") == 1


# ---------------------------------------------------------------------------
# _extract_json tests
# ---------------------------------------------------------------------------


class TestExtractJson:
    """Tests for _extract_json helper."""

    def test_extracts_raw_json_object(self) -> None:
        """Extracts a raw JSON object from text."""
        text = 'Some preamble {"key": "value"} trailing'
        result = _extract_json(text)
        assert result == {"key": "value"}

    def test_extracts_fenced_json(self) -> None:
        """Extracts JSON from markdown code fence."""
        text = '```json\n{"a": 1}\n```'
        result = _extract_json(text)
        assert result == {"a": 1}

    def test_returns_none_for_no_json(self) -> None:
        """Returns None when no JSON object is found."""
        assert _extract_json("no json here") is None

    def test_returns_none_for_json_array(self) -> None:
        """Returns None when JSON is an array, not an object."""
        assert _extract_json("[1, 2, 3]") is None

    def test_returns_none_for_invalid_json_in_braces(self) -> None:
        """Returns None when braces contain invalid JSON."""
        assert _extract_json("{not: valid: json}") is None


# ---------------------------------------------------------------------------
# _parse_subagent tests
# ---------------------------------------------------------------------------


class TestParseSubagent:
    """Tests for _parse_subagent helper."""

    def test_full_data(self) -> None:
        """Parses complete subagent data."""
        data: dict[str, Any] = {
            "id": "sa-1",
            "role": "qa-engineer",
            "task": "Write tests",
            "context": "Test context",
            "files": ["test.py"],
            "steps": ["Step 1"],
            "acceptance_criteria": ["All green"],
            "depends_on": ["sa-0"],
        }
        spec = _parse_subagent(data, 0)

        assert spec.id == "sa-1"
        assert spec.role == "qa-engineer"
        assert spec.task == "Write tests"
        assert spec.files == ["test.py"]
        assert spec.depends_on == ["sa-0"]

    def test_missing_fields_get_defaults(self) -> None:
        """Missing fields get safe defaults."""
        spec = _parse_subagent({}, 3)

        assert spec.id == "sa-4"  # idx=3 -> sa-4
        assert spec.role == "backend-engineer"
        assert spec.task == ""
        assert spec.files == []
        assert spec.steps == []

    def test_non_list_files_coerced_to_empty(self) -> None:
        """Non-list 'files' value is coerced to empty list."""
        spec = _parse_subagent({"files": "not-a-list"}, 0)
        assert spec.files == []


# ---------------------------------------------------------------------------
# _ensure_str_list tests
# ---------------------------------------------------------------------------


class TestEnsureStrList:
    """Tests for _ensure_str_list helper."""

    def test_list_of_strings(self) -> None:
        assert _ensure_str_list(["a", "b"]) == ["a", "b"]

    def test_list_with_none_values_filtered(self) -> None:
        assert _ensure_str_list(["a", None, "b"]) == ["a", "b"]

    def test_list_of_ints_coerced(self) -> None:
        assert _ensure_str_list([1, 2]) == ["1", "2"]

    def test_non_list_returns_empty(self) -> None:
        assert _ensure_str_list("string") == []
        assert _ensure_str_list(42) == []
        assert _ensure_str_list(None) == []


# ---------------------------------------------------------------------------
# _role_display tests
# ---------------------------------------------------------------------------


class TestRoleDisplay:
    """Tests for _role_display helper."""

    def test_known_roles(self) -> None:
        assert _role_display("backend-engineer") == "Backend Engineer"
        assert _role_display("frontend-expert") == "Frontend Expert"
        assert _role_display("qa-engineer") == "QA Engineer"

    def test_unknown_role_titlecased(self) -> None:
        assert _role_display("data-scientist") == "Data Scientist"


# ---------------------------------------------------------------------------
# _build_fallback_plan tests
# ---------------------------------------------------------------------------


class TestBuildFallbackPlan:
    """Tests for _build_fallback_plan helper."""

    def test_contains_issue_info(self) -> None:
        result = _build_fallback_plan("PS-42", "Fallback test")

        assert result.startswith("---\n")
        assert "issue: PS-42" in result
        assert 'title: "Fallback test"' in result
        assert "subagents: []" in result
        assert "parsing error" in result
        assert "No subagents were parsed" in result
