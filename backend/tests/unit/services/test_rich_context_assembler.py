"""Unit tests for RichContextAssembler (Phase 74 — CTX-01..05).

Tests cover:
- CTX-01: KG decisions included / empty graceful degradation
- CTX-02: Related PRs included / empty graceful degradation
- CTX-03: Budget truncation priority + budget pct reporting
- CTX-04: Sprint peers included / no cycle
- CTX-05: Base context fields unchanged + KG failure degradation

All dependencies are mocked — no real DB or network calls.
The TTLCache is cleared between tests to prevent cross-test cache interference.
"""

from __future__ import annotations

import uuid
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from pilot_space.application.services.issue.rich_context_assembler import (
    RichContextAssembler,
    RichContextPayload,
)
from pilot_space.application.services.memory.memory_recall_service import (
    MemoryItem,
    RecallResult,
)

# ============================================================================
# Helper factories
# ============================================================================


def _make_uuid() -> uuid.UUID:
    return uuid.uuid4()


def _make_base_context(*, cycle_id: uuid.UUID | None = None) -> MagicMock:
    """Build a mock ImplementContextResponse with all required fields."""
    from pilot_space.api.v1.schemas.implement_context import (
        IssueDetail,
        IssueLabelDetail,
        IssueStateDetail,
        ProjectContext,
        RepositoryContext,
        WorkspaceContext,
    )
    from pilot_space.infrastructure.database.models import IssuePriority, StateGroup

    issue = MagicMock(spec=IssueDetail)
    issue.id = _make_uuid()
    issue.identifier = "PS-1"
    issue.title = "Test Issue"
    issue.description = "Test description for the issue"
    issue.description_html = "<p>Test description for the issue</p>"
    issue.acceptance_criteria = ["Criterion 1", "Criterion 2"]
    issue.status = "started"
    issue.priority = IssuePriority.MEDIUM
    issue.labels = []
    issue.cycle_id = cycle_id

    repository = MagicMock(spec=RepositoryContext)
    repository.clone_url = "https://github.com/org/repo"
    repository.default_branch = "main"
    repository.provider = "github"

    workspace = MagicMock(spec=WorkspaceContext)
    workspace.slug = "test-workspace"
    workspace.name = "Test Workspace"

    project = MagicMock(spec=ProjectContext)
    project.name = "Test Project"
    project.tech_stack_summary = "Python FastAPI + React"

    context = MagicMock()
    context.issue = issue
    context.linked_notes = []
    context.repository = repository
    context.workspace = workspace
    context.project = project
    context.suggested_branch = "feat/ps-1-test-issue"
    context.kg_decisions = []
    context.related_prs = []
    context.sprint_peers = []
    context.context_budget_used_pct = None

    # model_dump_json returns a small JSON string for budget calculation
    # model_dump_json returns a small JSON string (40 chars) for budget calculation
    context.model_dump_json.return_value = '{"issue":{"id":"test"},"linked_notes":[]}'
    # __len__ on the string return value is handled by the assembler calling len() on it

    return context


def _make_base_result(*, cycle_id: uuid.UUID | None = None) -> MagicMock:
    """Build a mock GetImplementContextResult."""
    result = MagicMock()
    result.context = _make_base_context(cycle_id=cycle_id)
    result.from_cache = False
    return result


def _make_memory_item(
    *,
    node_id: str = "node-1",
    snippet: str = "Use Redis for caching",
    score: float = 0.85,
    source_type: str = "DECISION",
) -> MemoryItem:
    return MemoryItem(
        source_type=source_type,
        source_id="source-1",
        node_id=node_id,
        score=score,
        snippet=snippet,
        created_at="2026-01-01",
    )


def _make_issue_link(
    *,
    link_type: Any,
    source_issue_id: uuid.UUID,
    target_issue: MagicMock,
) -> MagicMock:
    """Build a mock IssueLink with a completed target issue."""
    link = MagicMock()
    link.link_type = link_type
    link.source_issue_id = source_issue_id
    link.target_issue = target_issue
    link.source_issue = None
    return link


def _make_completed_issue(
    *,
    issue_id: uuid.UUID | None = None,
    identifier: str = "PS-99",
    name: str = "Done Issue",
) -> MagicMock:
    """Build a mock Issue ORM instance in a completed state."""
    issue = MagicMock()
    issue.id = issue_id or _make_uuid()
    issue.identifier = identifier
    issue.name = name

    state = MagicMock()
    group = MagicMock()
    group.value = "completed"
    state.group = group
    issue.state = state

    return issue


def _make_pr_link(
    *,
    issue_id: uuid.UUID,
    pr_url: str = "https://github.com/org/repo/pull/42",
    state: str = "merged",
) -> MagicMock:
    """Build a mock IntegrationLink for a PR."""
    pr = MagicMock()
    pr.issue_id = issue_id
    pr.external_url = pr_url
    pr.link_metadata = {"state": state}
    return pr


def _make_cycle_peer(
    *,
    peer_id: uuid.UUID | None = None,
    identifier: str = "PS-2",
    name: str = "Peer Issue",
    state_value: str = "started",
    assignee_name: str | None = None,
) -> MagicMock:
    """Build a mock cycle peer Issue."""
    peer = MagicMock()
    peer.id = peer_id or _make_uuid()
    peer.identifier = identifier
    peer.name = name

    state = MagicMock()
    group = MagicMock()
    group.value = state_value
    state.group = group
    peer.state = state

    if assignee_name:
        assignee = MagicMock()
        assignee.display_name = assignee_name
        peer.assignee = assignee
    else:
        peer.assignee = None

    peer.ai_metadata = {}

    return peer


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def mock_base_service() -> AsyncMock:
    return AsyncMock()


@pytest.fixture
def mock_memory_recall() -> AsyncMock:
    return AsyncMock()


@pytest.fixture
def mock_issue_link_repo() -> AsyncMock:
    return AsyncMock()


@pytest.fixture
def mock_integration_link_repo() -> AsyncMock:
    return AsyncMock()


@pytest.fixture
def mock_cycle_repo() -> AsyncMock:
    return AsyncMock()


@pytest.fixture
def assembler(
    mock_base_service: AsyncMock,
    mock_memory_recall: AsyncMock,
    mock_issue_link_repo: AsyncMock,
    mock_integration_link_repo: AsyncMock,
    mock_cycle_repo: AsyncMock,
) -> RichContextAssembler:
    # Clear TTLCache to prevent cross-test interference
    RichContextAssembler._cache.clear()

    return RichContextAssembler(
        base_service=mock_base_service,
        memory_recall=mock_memory_recall,
        issue_link_repo=mock_issue_link_repo,
        integration_link_repo=mock_integration_link_repo,
        cycle_repo=mock_cycle_repo,
    )


@pytest.fixture
def payload() -> RichContextPayload:
    return RichContextPayload(
        issue_id=_make_uuid(),
        workspace_id=_make_uuid(),
        requester_id=_make_uuid(),
    )


# ============================================================================
# CTX-01: KG decisions
# ============================================================================


@pytest.mark.asyncio
async def test_kg_decisions_included(
    assembler: RichContextAssembler,
    mock_base_service: AsyncMock,
    mock_memory_recall: AsyncMock,
    mock_issue_link_repo: AsyncMock,
    mock_integration_link_repo: AsyncMock,
    mock_cycle_repo: AsyncMock,
    payload: RichContextPayload,
) -> None:
    """CTX-01: KG decisions appear in enriched response when recall returns results."""
    mock_base_service.execute.return_value = _make_base_result()
    mock_memory_recall.recall.return_value = RecallResult(
        items=[_make_memory_item(snippet="Use Redis for caching", score=0.85)]
    )
    mock_issue_link_repo.find_all_for_issue.return_value = []
    mock_integration_link_repo.get_pull_requests_for_issues.return_value = []
    mock_cycle_repo.get_issues_in_cycle.return_value = []

    result = await assembler.execute(payload)

    assert len(result.context.kg_decisions) >= 1
    snippets = [d.snippet for d in result.context.kg_decisions]
    assert "Use Redis for caching" in snippets


@pytest.mark.asyncio
async def test_kg_decisions_empty_graceful(
    assembler: RichContextAssembler,
    mock_base_service: AsyncMock,
    mock_memory_recall: AsyncMock,
    mock_issue_link_repo: AsyncMock,
    mock_integration_link_repo: AsyncMock,
    mock_cycle_repo: AsyncMock,
    payload: RichContextPayload,
) -> None:
    """CTX-01: KG section omitted (empty list) when recall returns no items."""
    mock_base_service.execute.return_value = _make_base_result()
    mock_memory_recall.recall.return_value = RecallResult(items=[])
    mock_issue_link_repo.find_all_for_issue.return_value = []
    mock_integration_link_repo.get_pull_requests_for_issues.return_value = []
    mock_cycle_repo.get_issues_in_cycle.return_value = []

    result = await assembler.execute(payload)

    assert result.context.kg_decisions == []


# ============================================================================
# CTX-02: Related PRs
# ============================================================================


@pytest.mark.asyncio
async def test_related_prs_included(
    assembler: RichContextAssembler,
    mock_base_service: AsyncMock,
    mock_memory_recall: AsyncMock,
    mock_issue_link_repo: AsyncMock,
    mock_integration_link_repo: AsyncMock,
    mock_cycle_repo: AsyncMock,
    payload: RichContextPayload,
) -> None:
    """CTX-02: Related PRs appear when linked closed issues have PRs."""
    from pilot_space.infrastructure.database.models.issue_link import IssueLinkType

    done_issue = _make_completed_issue(identifier="PS-99", name="Done Auth Issue")
    link = _make_issue_link(
        link_type=IssueLinkType.RELATED,
        source_issue_id=payload.issue_id,
        target_issue=done_issue,
    )
    pr = _make_pr_link(issue_id=done_issue.id, pr_url="https://github.com/org/repo/pull/42")

    mock_base_service.execute.return_value = _make_base_result()
    mock_memory_recall.recall.return_value = RecallResult(items=[])
    mock_issue_link_repo.find_all_for_issue.return_value = [link]
    mock_integration_link_repo.get_pull_requests_for_issues.return_value = [pr]
    mock_cycle_repo.get_issues_in_cycle.return_value = []

    result = await assembler.execute(payload)

    assert len(result.context.related_prs) >= 1
    urls = [p.pr_url for p in result.context.related_prs]
    assert any("pull/42" in url for url in urls)


@pytest.mark.asyncio
async def test_related_prs_empty_graceful(
    assembler: RichContextAssembler,
    mock_base_service: AsyncMock,
    mock_memory_recall: AsyncMock,
    mock_issue_link_repo: AsyncMock,
    mock_integration_link_repo: AsyncMock,
    mock_cycle_repo: AsyncMock,
    payload: RichContextPayload,
) -> None:
    """CTX-02: Related PR section empty when no issue links exist."""
    mock_base_service.execute.return_value = _make_base_result()
    mock_memory_recall.recall.return_value = RecallResult(items=[])
    mock_issue_link_repo.find_all_for_issue.return_value = []
    mock_integration_link_repo.get_pull_requests_for_issues.return_value = []
    mock_cycle_repo.get_issues_in_cycle.return_value = []

    result = await assembler.execute(payload)

    assert result.context.related_prs == []


# ============================================================================
# CTX-03: Budget truncation
# ============================================================================


@pytest.mark.asyncio
async def test_budget_truncation_priority(
    assembler: RichContextAssembler,
    mock_base_service: AsyncMock,
    mock_memory_recall: AsyncMock,
    mock_issue_link_repo: AsyncMock,
    mock_integration_link_repo: AsyncMock,
    mock_cycle_repo: AsyncMock,
    payload: RichContextPayload,
) -> None:
    """CTX-03: Budget truncates lowest-priority sections first.

    Sprint peers removed first, then related_prs, then kg_decisions.
    We force overflow by mocking model_dump_json to return a huge string.
    """
    from pilot_space.infrastructure.database.models.issue_link import IssueLinkType

    # Create a base context whose JSON is just under the char budget
    base_ctx = _make_base_context()
    # Make the base context JSON huge — 500k chars forces immediate budget overflow
    # _CHAR_BUDGET = 480_000 (60% of 200k tokens * 4 chars/token)
    huge_json = "x" * 500_000
    base_ctx.model_dump_json.return_value = huge_json

    base_result = MagicMock()
    base_result.context = base_ctx
    mock_base_service.execute.return_value = base_result

    # Provide data for all three enrichment layers
    mock_memory_recall.recall.return_value = RecallResult(
        items=[_make_memory_item(node_id=f"n{i}", snippet=f"Decision {i}") for i in range(5)]
    )

    done_issue = _make_completed_issue()
    link = _make_issue_link(
        link_type=IssueLinkType.RELATED,
        source_issue_id=payload.issue_id,
        target_issue=done_issue,
    )
    pr = _make_pr_link(issue_id=done_issue.id)
    mock_issue_link_repo.find_all_for_issue.return_value = [link]
    mock_integration_link_repo.get_pull_requests_for_issues.return_value = [pr]

    peers = [_make_cycle_peer(identifier=f"PS-{i}") for i in range(3)]
    cycle_id = _make_uuid()
    base_ctx.issue.cycle_id = cycle_id
    mock_cycle_repo.get_issues_in_cycle.return_value = peers

    result = await assembler.execute(payload)

    # When base context itself exceeds budget, all enrichment is cleared
    # Priority: sprint_peers cleared first, then related_prs, then kg_decisions
    assert result.context.sprint_peers == []
    # The base JSON alone exceeds the budget, so related_prs and kg_decisions
    # should also be cleared
    assert result.context.related_prs == []
    assert result.context.kg_decisions == []


@pytest.mark.asyncio
async def test_budget_pct_reported(
    assembler: RichContextAssembler,
    mock_base_service: AsyncMock,
    mock_memory_recall: AsyncMock,
    mock_issue_link_repo: AsyncMock,
    mock_integration_link_repo: AsyncMock,
    mock_cycle_repo: AsyncMock,
    payload: RichContextPayload,
) -> None:
    """CTX-03: context_budget_used_pct reflects actual usage."""
    mock_base_service.execute.return_value = _make_base_result()
    mock_memory_recall.recall.return_value = RecallResult(items=[])
    mock_issue_link_repo.find_all_for_issue.return_value = []
    mock_integration_link_repo.get_pull_requests_for_issues.return_value = []
    mock_cycle_repo.get_issues_in_cycle.return_value = []

    result = await assembler.execute(payload)

    assert result.context.context_budget_used_pct is not None
    assert isinstance(result.context.context_budget_used_pct, float)
    assert result.context.context_budget_used_pct >= 0


# ============================================================================
# CTX-04: Sprint peers
# ============================================================================


@pytest.mark.asyncio
async def test_sprint_peers_included(
    assembler: RichContextAssembler,
    mock_base_service: AsyncMock,
    mock_memory_recall: AsyncMock,
    mock_issue_link_repo: AsyncMock,
    mock_integration_link_repo: AsyncMock,
    mock_cycle_repo: AsyncMock,
    payload: RichContextPayload,
) -> None:
    """CTX-04: Sprint peers appear when issue belongs to active cycle."""
    cycle_id = _make_uuid()
    mock_base_service.execute.return_value = _make_base_result(cycle_id=cycle_id)

    peer1 = _make_cycle_peer(identifier="PS-10", name="Search feature", assignee_name="Alice")
    peer2 = _make_cycle_peer(identifier="PS-11", name="Auth feature")
    mock_cycle_repo.get_issues_in_cycle.return_value = [peer1, peer2]

    mock_memory_recall.recall.return_value = RecallResult(items=[])
    mock_issue_link_repo.find_all_for_issue.return_value = []
    mock_integration_link_repo.get_pull_requests_for_issues.return_value = []

    result = await assembler.execute(payload)

    assert len(result.context.sprint_peers) >= 1
    identifiers = [p.identifier for p in result.context.sprint_peers]
    assert "PS-10" in identifiers or "PS-11" in identifiers


@pytest.mark.asyncio
async def test_sprint_peers_no_cycle(
    assembler: RichContextAssembler,
    mock_base_service: AsyncMock,
    mock_memory_recall: AsyncMock,
    mock_issue_link_repo: AsyncMock,
    mock_integration_link_repo: AsyncMock,
    mock_cycle_repo: AsyncMock,
    payload: RichContextPayload,
) -> None:
    """CTX-04: Sprint peers empty when cycle_id is None."""
    # cycle_id=None means no sprint
    mock_base_service.execute.return_value = _make_base_result(cycle_id=None)

    mock_memory_recall.recall.return_value = RecallResult(items=[])
    mock_issue_link_repo.find_all_for_issue.return_value = []
    mock_integration_link_repo.get_pull_requests_for_issues.return_value = []

    result = await assembler.execute(payload)

    assert result.context.sprint_peers == []
    mock_cycle_repo.get_issues_in_cycle.assert_not_called()


# ============================================================================
# CTX-05: Base context integrity + graceful degradation
# ============================================================================


@pytest.mark.asyncio
async def test_base_fields_unchanged(
    assembler: RichContextAssembler,
    mock_base_service: AsyncMock,
    mock_memory_recall: AsyncMock,
    mock_issue_link_repo: AsyncMock,
    mock_integration_link_repo: AsyncMock,
    mock_cycle_repo: AsyncMock,
    payload: RichContextPayload,
) -> None:
    """CTX-05: Base context fields unchanged after enrichment."""
    base_result = _make_base_result()
    base_ctx = base_result.context
    mock_base_service.execute.return_value = base_result

    mock_memory_recall.recall.return_value = RecallResult(
        items=[_make_memory_item(snippet="Decision A")]
    )
    mock_issue_link_repo.find_all_for_issue.return_value = []
    mock_integration_link_repo.get_pull_requests_for_issues.return_value = []
    mock_cycle_repo.get_issues_in_cycle.return_value = []

    result = await assembler.execute(payload)

    # Core base fields must be identical (use is for objects, == for primitives/lists)
    assert result.context.issue is base_ctx.issue
    assert result.context.linked_notes == base_ctx.linked_notes
    assert result.context.repository is base_ctx.repository
    assert result.context.workspace is base_ctx.workspace
    assert result.context.project is base_ctx.project
    assert result.context.suggested_branch == base_ctx.suggested_branch


@pytest.mark.asyncio
async def test_kg_failure_degrades_gracefully(
    assembler: RichContextAssembler,
    mock_base_service: AsyncMock,
    mock_memory_recall: AsyncMock,
    mock_issue_link_repo: AsyncMock,
    mock_integration_link_repo: AsyncMock,
    mock_cycle_repo: AsyncMock,
    payload: RichContextPayload,
) -> None:
    """CTX-05: KG failure degrades gracefully — base context still returned."""
    base_result = _make_base_result()
    base_ctx = base_result.context
    mock_base_service.execute.return_value = base_result

    # KG recall raises an exception
    mock_memory_recall.recall.side_effect = Exception("KG timeout")
    mock_issue_link_repo.find_all_for_issue.return_value = []
    mock_integration_link_repo.get_pull_requests_for_issues.return_value = []
    mock_cycle_repo.get_issues_in_cycle.return_value = []

    # Should NOT raise — graceful degradation
    result = await assembler.execute(payload)

    assert result.context.kg_decisions == []
    # Base fields still present (use is for object identity)
    assert result.context.issue is base_ctx.issue
    assert result.context.repository is base_ctx.repository
    assert result.context.workspace is base_ctx.workspace
