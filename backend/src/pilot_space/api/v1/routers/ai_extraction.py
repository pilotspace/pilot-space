"""AI issue extraction endpoints.

Extract structured issues from note content.

T058-T059: Issue extraction and approval.
"""

from __future__ import annotations

from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from pilot_space.api.middleware.request_context import CorrelationId, WorkspaceId
from pilot_space.api.utils.sse import SSEResponse, SSEStreamBuilder
from pilot_space.dependencies import (
    CurrentUserId,
    DbSession,
)
from pilot_space.dependencies.auth import require_workspace_member
from pilot_space.infrastructure.logging import get_logger

logger = get_logger(__name__)

router = APIRouter(tags=["AI Extraction"])


class ExtractIssuesRequest(BaseModel):
    """Request for issue extraction."""

    note_title: str = Field(
        max_length=255,
        description="Note title",
    )
    note_content: dict[str, Any] = Field(description="TipTap JSON content")
    project_id: str | None = Field(
        default=None,
        description="Project ID for context",
    )
    project_context: str | None = Field(
        default=None,
        max_length=2000,
        description="Project description for context",
    )
    selected_text: str | None = Field(
        default=None,
        max_length=5000,
        description="User-selected text to focus on",
    )
    available_labels: list[str] | None = Field(
        default=None,
        max_length=50,
        description="Labels available in the project",
    )
    max_issues: int = Field(
        default=10,
        ge=1,
        le=20,
        description="Maximum number of issues to extract",
    )


class ExtractedIssueResponse(BaseModel):
    """Single extracted issue."""

    title: str = Field(description="Issue title")
    description: str = Field(description="Issue description")
    priority: int = Field(description="Suggested priority (0-4)")
    labels: list[str] = Field(description="Suggested labels")
    confidence_score: float = Field(description="Confidence score (0-1)")
    confidence_tag: str = Field(description="Confidence category")
    source_block_ids: list[str] = Field(default_factory=list, description="Source blocks")
    rationale: str = Field(default="", description="Extraction rationale")


class ExtractIssuesResponse(BaseModel):
    """Response for issue extraction."""

    issues: list[ExtractedIssueResponse] = Field(description="Extracted issues")
    recommended_count: int = Field(description="High confidence issues")
    total_count: int = Field(description="Total issues")
    processing_time_ms: float = Field(description="Processing time")


class ExtractedIssueInput(BaseModel):
    """Single issue to create from extraction."""

    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    priority: int = Field(default=4, ge=0, le=4)
    source_block_id: str | None = None


class CreateExtractedIssuesRequest(BaseModel):
    """Request to create extracted issues (auto-approve, DD-003 non-destructive)."""

    issues: list[ExtractedIssueInput] = Field(default_factory=list)
    project_id: str | None = Field(default=None, description="Project UUID to assign issues to")


@router.post(
    "/notes/{note_id}/extract-issues",
    summary="Extract issues from note with SSE streaming",
    description="Extract structured issues from note content with confidence tags (DD-048).",
    response_model=None,
)
async def extract_issues_stream(
    workspace_id: WorkspaceId,
    correlation_id: CorrelationId,
    note_id: str,
    extract_request: ExtractIssuesRequest,
    current_user_id: CurrentUserId,
    request: Request,
    session: DbSession,
    _member: Annotated[UUID, Depends(require_workspace_member)],
) -> SSEResponse:
    """Extract issues from note content with confidence tags.

    Returns SSE stream with:
    - progress: Extraction progress updates
    - issue: Each extracted issue as found
    - complete: Final summary with approval_id
    - error: If extraction fails

    Issues require approval before creation (DD-003).

    Args:
        workspace_id: Workspace UUID from request context.
        correlation_id: Correlation ID for tracing.
        note_id: Note ID to extract from.
        extract_request: Extraction request.
        current_user_id: Current user ID.
        request: FastAPI request.
        approval_service: Approval service for human-in-the-loop.
        session: Database session.

    Returns:
        SSE stream of extraction events.
    """
    _ = correlation_id  # Used for tracing

    async def generate_events():
        from pilot_space.application.services.extraction import (
            ExtractIssuesPayload,
            IssueExtractionService,
        )

        builder = SSEStreamBuilder()

        # Progress: starting
        yield builder.event(
            "progress", {"stage": "analyzing", "message": "Analyzing note content..."}
        )

        try:
            service = IssueExtractionService(session=session)
            payload = ExtractIssuesPayload(
                workspace_id=workspace_id,
                note_id=note_id,
                note_title=extract_request.note_title,
                note_content=extract_request.note_content,
                project_id=extract_request.project_id,
                project_context=extract_request.project_context,
                selected_text=extract_request.selected_text,
                available_labels=extract_request.available_labels,
                max_issues=extract_request.max_issues,
            )

            yield builder.event(
                "progress", {"stage": "extracting", "message": "Extracting issues..."}
            )

            result = await service.extract(payload)

            # Stream each extracted issue
            for idx, issue in enumerate(result.issues):
                yield builder.event(
                    "issue",
                    {
                        "index": idx,
                        "title": issue.title,
                        "description": issue.description,
                        "priority": issue.priority,
                        "labels": issue.labels,
                        "confidenceScore": issue.confidence_score,
                        "confidenceTag": issue.confidence_tag,
                        "sourceBlockIds": issue.source_block_ids,
                        "rationale": issue.rationale,
                    },
                )

            # Complete event with summary
            yield builder.event(
                "complete",
                {
                    "totalCount": result.total_count,
                    "recommendedCount": result.recommended_count,
                    "processingTimeMs": result.processing_time_ms,
                    "model": result.model,
                },
            )

        except Exception:
            logger.exception("Issue extraction failed", extra={"note_id": note_id})
            yield builder.event(
                "error",
                {"code": "EXTRACTION_FAILED", "message": "Extraction failed. Please try again."},
            )

    return SSEResponse(generate_events())


@router.post(
    "/notes/{note_id}/extract-issues/approve",
    summary="Create extracted issues",
    description="Auto-approve and create extracted issues directly (DD-003 non-destructive).",
)
async def approve_extracted_issues(
    workspace_id: WorkspaceId,
    note_id: str,
    body: CreateExtractedIssuesRequest,
    current_user_id: CurrentUserId,
    session: DbSession,
    _member: Annotated[UUID, Depends(require_workspace_member)],
) -> dict[str, Any]:
    """Create extracted issues directly (auto-approve).

    Issues are content creation (non-destructive per DD-003), so no approval
    gate is required. Issues are created from the provided list.

    Args:
        workspace_id: Workspace UUID from request context.
        note_id: Source note ID.
        body: Issues to create with optional project_id.
        current_user_id: Current user ID.
        session: Database session.

    Returns:
        Created issue IDs and count.
    """
    from pilot_space.application.services.issue import CreateIssuePayload, CreateIssueService
    from pilot_space.infrastructure.database.models.issue import IssuePriority
    from pilot_space.infrastructure.database.repositories import (
        ActivityRepository,
        IssueRepository,
        LabelRepository,
    )

    if not body.issues:
        return {
            "created_issues": [],
            "created_count": 0,
            "source_note_id": note_id,
            "message": "No issues to create",
        }

    if not body.project_id:
        return {
            "created_issues": [],
            "created_count": 0,
            "source_note_id": note_id,
            "message": "project_id is required to create issues",
        }

    try:
        project_id = UUID(body.project_id)
    except (ValueError, AttributeError):
        return {
            "created_issues": [],
            "created_count": 0,
            "source_note_id": note_id,
            "message": "Invalid project_id format",
        }

    issue_service = CreateIssueService(
        session=session,
        issue_repository=IssueRepository(session),
        activity_repository=ActivityRepository(session),
        label_repository=LabelRepository(session),
    )

    priority_map = {
        0: IssuePriority.URGENT,
        1: IssuePriority.HIGH,
        2: IssuePriority.MEDIUM,
        3: IssuePriority.LOW,
        4: IssuePriority.NONE,
    }

    created_ids = []
    for issue_data in body.issues:
        payload = CreateIssuePayload(
            workspace_id=workspace_id,
            project_id=project_id,
            reporter_id=UUID(str(current_user_id)),
            name=issue_data.title,
            description=issue_data.description,
            priority=priority_map.get(issue_data.priority, IssuePriority.NONE),
        )
        try:
            result = await issue_service.execute(payload)
            if result.issue:
                created_ids.append(str(result.issue.id))
        except ValueError as e:
            logger.warning(
                "Failed to create issue",
                extra={"title": issue_data.title, "error": str(e)},
            )
            continue

    await session.commit()

    return {
        "created_issues": created_ids,
        "created_count": len(created_ids),
        "source_note_id": note_id,
        "message": f"Successfully created {len(created_ids)} issues",
    }


__all__ = ["router"]
