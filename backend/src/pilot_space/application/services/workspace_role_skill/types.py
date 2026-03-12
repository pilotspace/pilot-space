"""Payload dataclasses for workspace role skill services.

Source: Phase 16, WRSKL-01..04
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from uuid import UUID


@dataclass(frozen=True, slots=True)
class CreateWorkspaceSkillPayload:
    """Payload for creating (generating + persisting) a workspace role skill."""

    workspace_id: UUID
    created_by: UUID
    role_type: str
    role_name: str
    experience_description: str


@dataclass(frozen=True, slots=True)
class ActivateWorkspaceSkillPayload:
    """Payload for activating a workspace role skill."""

    skill_id: UUID
    workspace_id: UUID


@dataclass(frozen=True, slots=True)
class ListWorkspaceSkillsPayload:
    """Payload for listing workspace role skills."""

    workspace_id: UUID


@dataclass(frozen=True, slots=True)
class DeleteWorkspaceSkillPayload:
    """Payload for soft-deleting a workspace role skill."""

    skill_id: UUID
    workspace_id: UUID


__all__ = [
    "ActivateWorkspaceSkillPayload",
    "CreateWorkspaceSkillPayload",
    "DeleteWorkspaceSkillPayload",
    "ListWorkspaceSkillsPayload",
]
