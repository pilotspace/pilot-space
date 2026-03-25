"""Pydantic schemas for project member API endpoints.

Covers US1 (project members section), US4 (bulk re-assignment),
US5 (my-projects dashboard), US2 (member chips).
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

# ── Project assignment item (used in invites and bulk-update) ──────────────────


class ProjectAssignmentItem(BaseModel):
    """Minimal assignment reference stored in workspace_invitations.project_assignments."""

    project_id: UUID
    role: str = Field(default="member", pattern="^member$")


class ProjectAssignmentAction(BaseModel):
    """Single add/remove action for bulk-update endpoint."""

    project_id: UUID
    action: str = Field(..., pattern="^(add|remove)$")


# ── ProjectMember response ───────────────────────────────────────────────────


class ProjectMemberResponse(BaseModel):
    """Serialized project member for API responses."""

    id: UUID
    project_id: UUID
    user_id: UUID
    email: str
    full_name: str | None = None
    avatar_url: str | None = None
    assigned_at: datetime
    assigned_by: UUID | None = None
    is_active: bool

    model_config = {"from_attributes": True}


class ProjectMemberListResponse(BaseModel):
    """Paginated list of project members."""

    items: list[ProjectMemberResponse]
    total: int
    next_cursor: str | None = None
    has_next: bool


# ── Add / remove single member ────────────────────────────────────────────────


class AddProjectMemberRequest(BaseModel):
    """Request body for POST /projects/{pid}/members."""

    user_id: UUID


class RemoveProjectMemberResponse(BaseModel):
    """Response after removing a project member."""

    removed: bool
    user_id: UUID


# ── Bulk assignment (US4) ─────────────────────────────────────────────────────


class BulkAssignmentRequest(BaseModel):
    """Request body for PATCH /workspaces/{wid}/members/{uid}/assignments."""

    workspace_role: str | None = Field(
        default=None,
        pattern="^(OWNER|ADMIN|MEMBER|GUEST)$",
        description="New workspace-level role (optional).",
    )
    project_assignments: list[ProjectAssignmentAction] = Field(
        default_factory=list,
        description="Add or remove project memberships.",
    )


class BulkAssignmentWarning(BaseModel):
    """Soft-warning attached to BulkAssignmentResponse."""

    code: str
    message: str


class BulkAssignmentResponse(BaseModel):
    """Response from PATCH .../assignments."""

    user_id: UUID
    workspace_role: str | None = None
    project_assignments_updated: int
    warnings: list[BulkAssignmentWarning] = Field(default_factory=list)


# ── Project summary chip (US2 — workspace members page) ───────────────────────


class ProjectSummaryChip(BaseModel):
    """Compact project info for embedding in WorkspaceMemberResponse."""

    project_id: UUID
    name: str
    identifier: str
    color: str | None = None
    is_archived: bool = False


# ── My-projects dashboard (US5) ───────────────────────────────────────────────


class MyProjectCard(BaseModel):
    """Project card shown on member dashboard."""

    project_id: UUID
    name: str
    identifier: str
    description: str | None = None
    icon: str | None = None
    is_archived: bool
    role: str  # "admin" | "member" | "owner"
    assigned_at: datetime | None = None
    last_activity_at: datetime | None = None
    open_issues_count: int = 0
    total_issues_count: int = 0


class MyProjectsResponse(BaseModel):
    """Response for GET /workspaces/{wid}/my-projects."""

    items: list[MyProjectCard]
    total: int


# ── Archive project ───────────────────────────────────────────────────────────


class ArchiveProjectRequest(BaseModel):
    """Request body for PATCH /projects/{pid}/archive."""

    is_archived: bool
