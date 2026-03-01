# Current Issue: {{ issue.title }}

> This section was injected by `pilot implement {{ issue.id }}`.
> Do NOT delete it — the pilot CLI reads this file on exit.

## Issue Context

| Field | Value |
|-------|-------|
| **ID** | {{ issue.id }} |
| **Status** | {{ issue.status }} |
| **Priority** | {{ issue.priority }} |
| **Labels** | {{ issue.labels | join(', ') or 'none' }} |

## Description

{{ issue.description or '_No description provided._' }}

## Acceptance Criteria

{% if issue.acceptance_criteria %}
{% for criterion in issue.acceptance_criteria %}
{{ loop.index }}. {{ criterion }}
{% endfor %}
{% else %}
_No acceptance criteria specified._
{% endif %}

## Relevant Notes

{% if linked_notes %}
{% for note in linked_notes %}
### {{ note.note_title }}

{% for block in note.relevant_blocks %}
> {{ block }}

{% endfor %}
{% endfor %}
{% else %}
_No linked notes for this issue._
{% endif %}

## Repository Context

| Field | Value |
|-------|-------|
| **Workspace** | {{ workspace.name }} ({{ workspace.slug }}) |
| **Project** | {{ project.name }} |
| **Repository** | {{ repository.clone_url }} |
| **Default Branch** | {{ repository.default_branch }} |
| **Your Branch** | `{{ suggested_branch }}` |

### Tech Stack Summary

{{ project.tech_stack_summary or '_Not specified._' }}

## Implementation Instructions

1. **Follow existing patterns** in `docs/dev-pattern/45-pilot-space-patterns.md`
2. **Run quality gates** before finishing:
   - Backend: `{{ backend_quality_gate }}`
   - Frontend: `{{ frontend_quality_gate }}`
3. **Write tests** for all new code (>80% coverage required)
4. **File size limit**: 700 lines max per code file
5. **Conventional commits**: `feat|fix|refactor(scope): description`
6. **Do NOT create a PR** — the `pilot` CLI will handle that automatically on exit

## Definition of Done

- [ ] All acceptance criteria implemented and tested
- [ ] Quality gates pass (no lint / type / test failures)
- [ ] No TODOs or placeholder code in committed files
- [ ] Commit message follows Conventional Commits format
