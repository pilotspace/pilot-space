"""Shared entity ID resolver for MCP tools (AD-006).

Resolves UUID strings or human-readable identifiers (PILOT-123, PILOT)
to entity UUIDs. All MCP tools use this utility for consistent ID handling.
"""

from __future__ import annotations

import re
import uuid
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pilot_space.ai.tools.mcp_server import ToolContext

# UUID v4 pattern
_UUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)

# Issue identifier: PROJECT_CODE-NUMBER (e.g., PILOT-123)
_ISSUE_IDENTIFIER_PATTERN = re.compile(r"^([A-Z]{2,10})-(\d+)$")

# Project identifier: 2-10 uppercase letters (e.g., PILOT)
_PROJECT_IDENTIFIER_PATTERN = re.compile(r"^[A-Z]{2,10}$")


async def resolve_entity_id(
    entity_type: str,
    id_or_identifier: str,
    ctx: ToolContext,
) -> tuple[uuid.UUID | None, str | None]:
    """Resolve UUID or human-readable identifier to entity UUID.

    Accepts UUID string, issue identifier (PILOT-123), or project
    identifier (PILOT). Routes to appropriate repository lookup
    based on entity_type.

    Args:
        entity_type: One of "issue", "project", or "note".
        id_or_identifier: UUID string or human-readable identifier.
        ctx: Tool context with db_session and workspace_id.

    Returns:
        (resolved_uuid, None) on success.
        (None, error_message) on failure.
    """
    if not id_or_identifier or not id_or_identifier.strip():
        return None, f"{entity_type} identifier cannot be empty"

    id_or_identifier = id_or_identifier.strip()

    # UUID passthrough
    if _UUID_PATTERN.match(id_or_identifier):
        return uuid.UUID(id_or_identifier), None

    # Route by entity type
    if entity_type == "issue":
        return await _resolve_issue_identifier(id_or_identifier, ctx)
    if entity_type == "project":
        return await _resolve_project_identifier(id_or_identifier, ctx)
    if entity_type == "note":
        return None, "Notes only support UUID identifiers"

    return None, f"Unknown entity type: {entity_type}"


async def _resolve_issue_identifier(
    identifier: str,
    ctx: ToolContext,
) -> tuple[uuid.UUID | None, str | None]:
    """Resolve issue identifier like PILOT-123 to UUID."""
    match = _ISSUE_IDENTIFIER_PATTERN.match(identifier)
    if not match:
        # Hint if uppercased version would match
        if _ISSUE_IDENTIFIER_PATTERN.match(identifier.upper()):
            return None, (
                f"Invalid issue identifier: '{identifier}'. "
                "Identifier must be uppercase (e.g., PILOT-123)"
            )
        return None, (
            f"Invalid issue identifier: '{identifier}'. Expected UUID or format like PILOT-123"
        )

    project_code = match.group(1)
    sequence_id = int(match.group(2))
    workspace_id = uuid.UUID(ctx.workspace_id)

    from pilot_space.infrastructure.database.repositories.issue_repository import (
        IssueRepository,
    )

    repo = IssueRepository(ctx.db_session)
    issue = await repo.get_by_identifier(
        workspace_id=workspace_id,
        project_identifier=project_code,
        sequence_id=sequence_id,
    )
    if not issue:
        return None, f"Issue {identifier} not found in this workspace"

    return issue.id, None


async def _resolve_project_identifier(
    identifier: str,
    ctx: ToolContext,
) -> tuple[uuid.UUID | None, str | None]:
    """Resolve project identifier like PILOT to UUID."""
    if not _PROJECT_IDENTIFIER_PATTERN.match(identifier):
        if _PROJECT_IDENTIFIER_PATTERN.match(identifier.upper()):
            return None, (
                f"Invalid project identifier: '{identifier}'. "
                "Identifier must be uppercase (e.g., PILOT)"
            )
        return None, (
            f"Invalid project identifier: '{identifier}'. "
            "Expected UUID or 2-10 uppercase letters (e.g., PILOT)"
        )

    workspace_id = uuid.UUID(ctx.workspace_id)

    from pilot_space.infrastructure.database.repositories.project_repository import (
        ProjectRepository,
    )

    repo = ProjectRepository(ctx.db_session)
    project = await repo.get_by_identifier(
        workspace_id=workspace_id,
        identifier=identifier,
    )
    if not project:
        return None, f"Project '{identifier}' not found in this workspace"

    return project.id, None
