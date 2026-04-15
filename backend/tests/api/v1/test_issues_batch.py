"""Tests for batch issue creation pipeline.

Phase 75, Plan 01 — CIP-01, CIP-02, CIP-05.

Tests the BatchCreateIssuesService (service-layer unit tests) and
validates the BatchCreateIssueRequest schema (camelCase / snake_case).

Tests:
  1. Service creates all 3 issues and returns 3 results with success=True.
  2. Each created issue has acceptance_criteria and source_note_id populated.
  3. If 1 of 3 issues fails, other 2 succeed; response includes per-issue results.
  4. Empty issues array raises ValidationError on schema parse.
  5. Request schema uses BaseSchema (camelCase) — sourceNoteId maps to source_note_id.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest

from pilot_space.api.v1.schemas.issue import (
    BatchCreateIssueRequest,
    BatchCreateIssueResponse,
    BatchCreateIssueResult,
    BatchIssueItemRequest,
)
from pilot_space.application.services.issue.batch_create_issues_service import (
    BatchCreateIssueItemResult,
    BatchCreateIssuesPayload,
    BatchCreateIssuesResult,
    BatchCreateIssuesService,
    BatchIssueItemPayload,
)

WORKSPACE_ID = UUID("11111111-1111-1111-1111-111111111111")
USER_ID = UUID("22222222-2222-2222-2222-222222222222")
PROJECT_ID = UUID("33333333-3333-3333-3333-333333333333")
NOTE_ID = UUID("44444444-4444-4444-4444-444444444444")
ISSUE_ID_1 = UUID("55555555-5555-5555-5555-555555555551")
ISSUE_ID_2 = UUID("55555555-5555-5555-5555-555555555552")
ISSUE_ID_3 = UUID("55555555-5555-5555-5555-555555555553")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_session() -> Any:
    """Create a mock async session."""
    session = MagicMock()
    session.commit = AsyncMock()
    return session


def _make_issue(issue_id: UUID) -> Any:
    """Create a minimal mock Issue model."""
    issue = MagicMock()
    issue.id = issue_id
    return issue


def _make_create_issue_service(
    issue_ids: list[UUID],
    fail_indices: list[int] | None = None,
) -> Any:
    """Create a mock CreateIssueService.

    Args:
        issue_ids: List of issue IDs to return for each successful call.
        fail_indices: List of 0-based call indices that should raise an exception.
    """
    fail_set = set(fail_indices or [])
    call_count = [0]

    async def _execute(payload: Any) -> Any:
        idx = call_count[0]
        call_count[0] += 1
        if idx in fail_set:
            raise ValueError(f"Project not found (index {idx})")
        issue_idx = idx - len([f for f in fail_set if f < idx])
        result = MagicMock()
        result.issue = _make_issue(issue_ids[issue_idx])
        return result

    svc = MagicMock()
    svc.execute = AsyncMock(side_effect=_execute)
    return svc


def _make_batch_service(
    issue_ids: list[UUID],
    fail_indices: list[int] | None = None,
) -> BatchCreateIssuesService:
    """Create a real BatchCreateIssuesService with mocked dependencies."""
    session = _make_session()
    create_svc = _make_create_issue_service(issue_ids, fail_indices)
    return BatchCreateIssuesService(session=session, create_issue_service=create_svc)


def _make_payload(
    items: list[dict[str, Any]],
    *,
    source_note_id: UUID | None = None,
) -> BatchCreateIssuesPayload:
    return BatchCreateIssuesPayload(
        workspace_id=WORKSPACE_ID,
        project_id=PROJECT_ID,
        reporter_id=USER_ID,
        issues=[
            BatchIssueItemPayload(
                title=item["title"],
                description=item.get("description"),
                acceptance_criteria=item.get("acceptance_criteria"),
                priority=item.get("priority", "medium"),
            )
            for item in items
        ],
        source_note_id=source_note_id,
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_batch_create_all_succeed() -> None:
    """Test 1: Service creates all 3 issues, returns 3 results with success=True."""
    svc = _make_batch_service([ISSUE_ID_1, ISSUE_ID_2, ISSUE_ID_3])
    payload = _make_payload([
        {"title": "Issue 1"},
        {"title": "Issue 2"},
        {"title": "Issue 3"},
    ])

    result = await svc.execute(payload)

    assert result.created_count == 3
    assert result.failed_count == 0
    assert len(result.results) == 3
    for r in result.results:
        assert r.success is True
        assert r.issue_id is not None
        assert r.error is None


@pytest.mark.asyncio
async def test_batch_create_populates_acceptance_criteria_and_source_note() -> None:
    """Test 2: Service passes acceptance_criteria and source_note_id to CreateIssueService."""
    create_svc = MagicMock()
    create_svc.execute = AsyncMock()
    mock_issue = _make_issue(ISSUE_ID_1)
    mock_result = MagicMock()
    mock_result.issue = mock_issue
    create_svc.execute.return_value = mock_result

    session = _make_session()
    svc = BatchCreateIssuesService(session=session, create_issue_service=create_svc)

    ac = [{"criterion": "User can login", "met": False}]
    payload = _make_payload(
        [{"title": "Auth setup", "acceptance_criteria": ac, "priority": "high"}],
        source_note_id=NOTE_ID,
    )

    result = await svc.execute(payload)

    assert result.created_count == 1
    assert result.failed_count == 0

    # Verify CreateIssuePayload received correct fields
    called_payload = create_svc.execute.call_args[0][0]
    assert called_payload.acceptance_criteria == ac
    assert called_payload.source_note_id == NOTE_ID


@pytest.mark.asyncio
async def test_batch_create_partial_failure() -> None:
    """Test 3: If 1 of 3 issues fails, others succeed; response has per-issue results."""
    # index 1 (second issue) will fail
    svc = _make_batch_service([ISSUE_ID_1, ISSUE_ID_3], fail_indices=[1])
    payload = _make_payload([
        {"title": "Issue 1"},
        {"title": "Issue 2"},  # will fail
        {"title": "Issue 3"},
    ])

    result = await svc.execute(payload)

    assert result.created_count == 2
    assert result.failed_count == 1
    assert len(result.results) == 3

    assert result.results[0].success is True
    assert result.results[0].issue_id == ISSUE_ID_1

    assert result.results[1].success is False
    assert result.results[1].issue_id is None
    assert "Project not found" in (result.results[1].error or "")

    assert result.results[2].success is True
    assert result.results[2].issue_id == ISSUE_ID_3


def test_batch_create_empty_issues_raises_validation_error() -> None:
    """Test 4: Empty issues array raises ValidationError on schema parse."""
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        BatchCreateIssueRequest(issues=[], project_id=PROJECT_ID)


def test_batch_request_schema_camel_case() -> None:
    """Test 5: Schema uses BaseSchema — sourceNoteId maps to source_note_id (camelCase)."""
    # Parse using camelCase keys (as the frontend sends)
    request = BatchCreateIssueRequest.model_validate(
        {
            "issues": [
                {
                    "title": "Test issue",
                    "acceptanceCriteria": [{"criterion": "Works", "met": False}],
                    "priority": "low",
                }
            ],
            "projectId": str(PROJECT_ID),
            "sourceNoteId": str(NOTE_ID),
        }
    )

    # Verify camelCase was deserialized to snake_case Python attrs
    assert request.source_note_id == NOTE_ID
    assert request.project_id == PROJECT_ID
    assert len(request.issues) == 1
    assert request.issues[0].acceptance_criteria == [{"criterion": "Works", "met": False}]

    # Verify serialization back to camelCase
    data = request.model_dump(by_alias=True)
    assert "sourceNoteId" in data
    assert "projectId" in data


def test_batch_response_schema_camel_case() -> None:
    """Validate BatchCreateIssueResponse serializes to camelCase."""
    response = BatchCreateIssueResponse(
        results=[
            BatchCreateIssueResult(index=0, success=True, issue_id=ISSUE_ID_1),
            BatchCreateIssueResult(index=1, success=False, error="Project not found"),
        ],
        created_count=1,
        failed_count=1,
    )
    data = response.model_dump(by_alias=True)
    assert "createdCount" in data
    assert "failedCount" in data
    results = data["results"]
    assert results[0]["issueId"] == ISSUE_ID_1
    assert results[1]["error"] == "Project not found"
