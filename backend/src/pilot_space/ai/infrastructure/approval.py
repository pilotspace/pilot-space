"""Human-in-the-loop approval service for AI actions.

Implements DD-003: Critical-only approval flow with configurable action classification.
Manages approval requests for AI-suggested actions, ensuring humans retain control
over critical operations while allowing safe automation of routine tasks.

T012: ApprovalService class implementation.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from typing import TYPE_CHECKING, Any, Final

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# Default expiration time for approval requests
DEFAULT_EXPIRATION_HOURS: Final[int] = 24


class ApprovalStatus(StrEnum):
    """Status of an approval request.

    Attributes:
        PENDING: Awaiting human review.
        APPROVED: Human approved the action.
        REJECTED: Human rejected the action.
        EXPIRED: Request expired without response.
    """

    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXPIRED = "expired"


class ActionType(StrEnum):
    """AI action types requiring approval classification.

    Per DD-003, actions are classified into three categories:
    - ALWAYS_REQUIRE: Critical destructive operations (workspace/project/issue/note deletion,
      PR merge, bulk delete)
    - DEFAULT_REQUIRE: Significant changes requiring approval by default but configurable
      (create sub-issues, extract issues, publish docs, post PR comments)
    - AUTO_EXECUTE: Safe suggestions applied automatically (suggest labels, suggest priority,
      auto-transition state, create annotation)
    """

    # ALWAYS_REQUIRE: Critical operations (non-configurable)
    DELETE_WORKSPACE = "delete_workspace"
    DELETE_PROJECT = "delete_project"
    DELETE_ISSUE = "delete_issue"
    DELETE_NOTE = "delete_note"
    MERGE_PR = "merge_pr"
    BULK_DELETE = "bulk_delete"

    # DEFAULT_REQUIRE: Significant changes (configurable)
    CREATE_SUB_ISSUES = "create_sub_issues"
    EXTRACT_ISSUES = "extract_issues"
    PUBLISH_DOCS = "publish_docs"
    POST_PR_COMMENTS = "post_pr_comments"

    # AUTO_EXECUTE: Safe operations (configurable)
    SUGGEST_LABELS = "suggest_labels"
    SUGGEST_PRIORITY = "suggest_priority"
    AUTO_TRANSITION_STATE = "auto_transition_state"
    CREATE_ANNOTATION = "create_annotation"


class ApprovalLevel(StrEnum):
    """Workspace-level AI autonomy configuration.

    Per DD-003, workspaces can configure their AI autonomy level:
    - CONSERVATIVE: Require approval for all AI actions except suggestions.
    - BALANCED: Default behavior, approve critical only.
    - AUTONOMOUS: Auto-execute most actions, critical still require approval.
    """

    CONSERVATIVE = "conservative"
    BALANCED = "balanced"
    AUTONOMOUS = "autonomous"


@dataclass(frozen=True, slots=True, kw_only=True)
class ApprovalRequest:
    """Immutable approval request data.

    Represents a request for human approval of an AI action.

    Attributes:
        id: Unique request identifier.
        workspace_id: Workspace where action will be performed.
        action_type: Type of action requiring approval.
        action_data: Action-specific parameters and context.
        requested_by_agent: Name of the AI agent requesting approval.
        requested_at: When the request was created.
        expires_at: When the request expires.
        status: Current status of the request.
        resolved_at: When the request was resolved (if applicable).
        resolved_by: User who resolved the request (if applicable).
        resolution_comment: Optional comment from resolver.
    """

    id: uuid.UUID = field(default_factory=uuid.uuid4)
    workspace_id: uuid.UUID
    action_type: ActionType
    action_data: dict[str, Any]
    requested_by_agent: str
    requested_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    expires_at: datetime | None = None
    status: ApprovalStatus = ApprovalStatus.PENDING
    resolved_at: datetime | None = None
    resolved_by: uuid.UUID | None = None
    resolution_comment: str | None = None


@dataclass(frozen=True, slots=True, kw_only=True)
class ProjectSettings:
    """Project-level AI autonomy settings.

    Per DD-003, projects can override workspace-level settings.

    Attributes:
        level: Overall autonomy level.
        overrides: Action-specific overrides (action_type -> auto_execute: bool).
    """

    level: ApprovalLevel = ApprovalLevel.BALANCED
    overrides: dict[str, bool] = field(default_factory=dict)


class ApprovalService:
    """Service for managing AI action approval requests.

    Implements DD-003 critical-only approval flow with three-tier classification:
    1. ALWAYS_REQUIRE: Critical operations never auto-execute
    2. DEFAULT_REQUIRE: Configurable per workspace/project
    3. AUTO_EXECUTE: Safe operations auto-execute unless overridden

    Thread-safe for concurrent request creation and resolution.
    """

    # Classification of actions by approval requirement
    ALWAYS_REQUIRE_ACTIONS: Final[set[ActionType]] = {
        ActionType.DELETE_WORKSPACE,
        ActionType.DELETE_PROJECT,
        ActionType.DELETE_ISSUE,
        ActionType.DELETE_NOTE,
        ActionType.MERGE_PR,
        ActionType.BULK_DELETE,
    }

    DEFAULT_REQUIRE_ACTIONS: Final[set[ActionType]] = {
        ActionType.CREATE_SUB_ISSUES,
        ActionType.EXTRACT_ISSUES,
        ActionType.PUBLISH_DOCS,
        ActionType.POST_PR_COMMENTS,
    }

    AUTO_EXECUTE_ACTIONS: Final[set[ActionType]] = {
        ActionType.SUGGEST_LABELS,
        ActionType.SUGGEST_PRIORITY,
        ActionType.AUTO_TRANSITION_STATE,
        ActionType.CREATE_ANNOTATION,
    }

    def __init__(
        self,
        session: AsyncSession,
        expiration_hours: int = DEFAULT_EXPIRATION_HOURS,
    ) -> None:
        """Initialize approval service.

        Args:
            session: SQLAlchemy async session for database operations.
            expiration_hours: Default expiration time for requests.
        """
        self.session = session
        self.expiration_hours = expiration_hours
        # In-memory storage for MVP; migrate to database table in production
        self._requests: dict[uuid.UUID, ApprovalRequest] = {}

    def check_approval_required(
        self,
        action_type: ActionType,
        project_settings: ProjectSettings | None = None,
    ) -> bool:
        """Check if an action requires human approval.

        Implements three-tier classification per DD-003:
        1. ALWAYS_REQUIRE: Always return True (non-configurable)
        2. DEFAULT_REQUIRE: Check project settings, default True
        3. AUTO_EXECUTE: Check project settings, default False

        Args:
            action_type: The action to check.
            project_settings: Optional project-level settings override.

        Returns:
            True if approval is required, False if action can auto-execute.

        Example:
            >>> settings = ProjectSettings(level=ApprovalLevel.BALANCED)
            >>> service.check_approval_required(ActionType.DELETE_WORKSPACE, settings)
            True
            >>> service.check_approval_required(ActionType.SUGGEST_LABELS, settings)
            False
        """
        # ALWAYS_REQUIRE: Critical operations never auto-execute
        if action_type in self.ALWAYS_REQUIRE_ACTIONS:
            logger.debug(
                "Action requires approval (always)",
                extra={
                    "action_type": action_type.value,
                    "classification": "always_require",
                },
            )
            return True

        # Check for explicit overrides
        settings = project_settings or ProjectSettings()
        action_name = action_type.value

        if action_name in settings.overrides:
            auto_execute = settings.overrides[action_name]
            logger.debug(
                "Action approval determined by override",
                extra={
                    "action_type": action_name,
                    "auto_execute": auto_execute,
                    "requires_approval": not auto_execute,
                },
            )
            return not auto_execute

        # Apply level-based defaults
        if action_type in self.DEFAULT_REQUIRE_ACTIONS:
            # DEFAULT_REQUIRE: Approve unless autonomous
            requires_approval = settings.level != ApprovalLevel.AUTONOMOUS
        else:
            # AUTO_EXECUTE: Auto-execute unless conservative
            requires_approval = settings.level == ApprovalLevel.CONSERVATIVE

        logger.debug(
            "Action approval determined by level",
            extra={
                "action_type": action_name,
                "level": settings.level.value,
                "requires_approval": requires_approval,
            },
        )

        return requires_approval

    async def create_approval_request(
        self,
        workspace_id: uuid.UUID,
        action_type: ActionType,
        action_data: dict[str, Any],
        requested_by_agent: str,
        expires_at: datetime | None = None,
    ) -> ApprovalRequest:
        """Create a new approval request.

        Args:
            workspace_id: Workspace where action will be performed.
            action_type: Type of action requiring approval.
            action_data: Action-specific parameters and context.
            requested_by_agent: Name of the AI agent requesting approval.
            expires_at: Optional custom expiration time.

        Returns:
            Created approval request.

        Raises:
            ValueError: If action_data is empty or action_type is invalid.

        Example:
            >>> request = await service.create_approval_request(
            ...     workspace_id=workspace_id,
            ...     action_type=ActionType.DELETE_ISSUE,
            ...     action_data={"issue_id": issue_id, "reason": "Duplicate"},
            ...     requested_by_agent="DuplicateDetectorAgent",
            ... )
        """
        if not action_data:
            raise ValueError("action_data cannot be empty")

        # Calculate expiration if not provided
        if expires_at is None:
            expires_at = datetime.now(UTC) + timedelta(hours=self.expiration_hours)

        request = ApprovalRequest(
            workspace_id=workspace_id,
            action_type=action_type,
            action_data=action_data,
            requested_by_agent=requested_by_agent,
            expires_at=expires_at,
        )

        # Store request (in-memory for MVP)
        self._requests[request.id] = request

        logger.info(
            "Approval request created",
            extra={
                "request_id": str(request.id),
                "workspace_id": str(workspace_id),
                "action_type": action_type.value,
                "agent": requested_by_agent,
                "expires_at": expires_at.isoformat(),
            },
        )

        return request

    async def resolve(
        self,
        request_id: uuid.UUID,
        approved: bool,
        resolved_by: uuid.UUID,
        resolution_comment: str | None = None,
    ) -> ApprovalRequest:
        """Resolve an approval request.

        Args:
            request_id: ID of the request to resolve.
            approved: True to approve, False to reject.
            resolved_by: User ID who is resolving the request.
            resolution_comment: Optional comment explaining the decision.

        Returns:
            Updated approval request.

        Raises:
            ValueError: If request not found or already resolved.

        Example:
            >>> resolved = await service.resolve(
            ...     request_id=request_id,
            ...     approved=False,
            ...     resolved_by=user_id,
            ...     resolution_comment="Not a duplicate, different requirements",
            ... )
        """
        request = self._requests.get(request_id)
        if not request:
            raise ValueError(f"Approval request not found: {request_id}")

        if request.status != ApprovalStatus.PENDING:
            raise ValueError(
                f"Cannot resolve request with status {request.status.value}"
            )

        # Create new immutable request with updated fields
        now = datetime.now(UTC)
        status = ApprovalStatus.APPROVED if approved else ApprovalStatus.REJECTED

        resolved_request = ApprovalRequest(
            id=request.id,
            workspace_id=request.workspace_id,
            action_type=request.action_type,
            action_data=request.action_data,
            requested_by_agent=request.requested_by_agent,
            requested_at=request.requested_at,
            expires_at=request.expires_at,
            status=status,
            resolved_at=now,
            resolved_by=resolved_by,
            resolution_comment=resolution_comment,
        )

        # Update storage
        self._requests[request_id] = resolved_request

        logger.info(
            "Approval request resolved",
            extra={
                "request_id": str(request_id),
                "status": status.value,
                "resolved_by": str(resolved_by),
                "has_comment": resolution_comment is not None,
            },
        )

        return resolved_request

    async def get_pending_for_workspace(
        self,
        workspace_id: uuid.UUID,
    ) -> list[ApprovalRequest]:
        """Get all pending approval requests for a workspace.

        Args:
            workspace_id: Workspace to query.

        Returns:
            List of pending requests, sorted by requested_at descending.

        Example:
            >>> pending = await service.get_pending_for_workspace(workspace_id)
            >>> for request in pending:
            ...     print(f"{request.action_type}: {request.requested_at}")
        """
        pending = [
            req
            for req in self._requests.values()
            if req.workspace_id == workspace_id and req.status == ApprovalStatus.PENDING
        ]

        # Sort by requested_at descending (newest first)
        pending.sort(key=lambda r: r.requested_at, reverse=True)

        logger.debug(
            "Fetched pending approval requests",
            extra={
                "workspace_id": str(workspace_id),
                "count": len(pending),
            },
        )

        return pending

    async def expire_stale_requests(self) -> int:
        """Mark expired requests as EXPIRED.

        Scans all pending requests and expires those past their expiration time.
        Should be called periodically (e.g., hourly background job).

        Returns:
            Number of requests expired.

        Example:
            >>> expired_count = await service.expire_stale_requests()
            >>> print(f"Expired {expired_count} stale requests")
        """
        now = datetime.now(UTC)
        expired_count = 0

        # Find pending requests past expiration
        for request_id, request in list(self._requests.items()):
            if request.status != ApprovalStatus.PENDING:
                continue

            if request.expires_at and request.expires_at <= now:
                # Create expired version
                expired_request = ApprovalRequest(
                    id=request.id,
                    workspace_id=request.workspace_id,
                    action_type=request.action_type,
                    action_data=request.action_data,
                    requested_by_agent=request.requested_by_agent,
                    requested_at=request.requested_at,
                    expires_at=request.expires_at,
                    status=ApprovalStatus.EXPIRED,
                    resolved_at=now,
                    resolved_by=None,
                    resolution_comment="Request expired without response",
                )

                self._requests[request_id] = expired_request
                expired_count += 1

        if expired_count > 0:
            logger.info(
                "Expired stale approval requests",
                extra={
                    "expired_count": expired_count,
                    "checked_at": now.isoformat(),
                },
            )

        return expired_count

    async def get_request(self, request_id: uuid.UUID) -> ApprovalRequest | None:
        """Get an approval request by ID.

        Args:
            request_id: Request ID to fetch.

        Returns:
            Approval request if found, None otherwise.
        """
        return self._requests.get(request_id)

    def get_action_classification(self, action_type: ActionType) -> str:
        """Get the classification of an action type.

        Args:
            action_type: Action to classify.

        Returns:
            Classification string: "always_require", "default_require", or "auto_execute".

        Example:
            >>> service.get_action_classification(ActionType.DELETE_WORKSPACE)
            'always_require'
            >>> service.get_action_classification(ActionType.SUGGEST_LABELS)
            'auto_execute'
        """
        if action_type in self.ALWAYS_REQUIRE_ACTIONS:
            return "always_require"
        if action_type in self.DEFAULT_REQUIRE_ACTIONS:
            return "default_require"
        return "auto_execute"


__all__ = [
    "ActionType",
    "ApprovalLevel",
    "ApprovalRequest",
    "ApprovalService",
    "ApprovalStatus",
    "ProjectSettings",
]
