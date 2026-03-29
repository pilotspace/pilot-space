"""Skill Generator API router.

Handles saving skills generated through conversational AI.

Phase 051: Conversational Skill Generator
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter
from pydantic import BaseModel, Field

from pilot_space.api.v1.dependencies import SkillGeneratorServiceDep
from pilot_space.application.services.skill.skill_generator_service import (
    SkillSavePayload,
)
from pilot_space.dependencies.auth import CurrentUserId, DbSession
from pilot_space.dependencies.workspace import HeaderWorkspaceMemberId
from pilot_space.infrastructure.logging import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/skills/generator", tags=["skill-generator"])


class SkillSaveRequest(BaseModel):
    """Request body for saving a generated skill."""

    session_id: UUID = Field(..., alias="sessionId")
    save_type: str = Field(..., alias="saveType", pattern="^(personal|workspace)$")
    name: str = Field(..., min_length=1, max_length=100)
    description: str = Field(default="")
    category: str = Field(default="general")
    icon: str = Field(default="Wand2")
    skill_content: str = Field(..., alias="skillContent", min_length=1)
    example_prompts: list[str] = Field(default_factory=list, alias="examplePrompts")
    graph_data: dict[str, Any] | None = Field(default=None, alias="graphData")

    model_config = {"populate_by_name": True}


class SkillSaveResponse(BaseModel):
    """Response from saving a generated skill."""

    skill_id: str = Field(..., alias="skillId")
    skill_name: str = Field(..., alias="skillName")
    save_type: str = Field(..., alias="saveType")

    model_config = {"populate_by_name": True}


@router.post(
    "/save",
    response_model=SkillSaveResponse,
    summary="Save a generated skill",
    description="Persists a conversationally generated skill as personal or workspace skill.",
)
async def save_generated_skill(
    body: SkillSaveRequest,
    session: DbSession,
    workspace_id: HeaderWorkspaceMemberId,
    user_id: CurrentUserId,
    service: SkillGeneratorServiceDep,
) -> SkillSaveResponse:
    """Save a skill generated through the conversational AI flow.

    Args:
        body: Skill save payload from frontend.
        session: DB session (required for DI context).
        workspace_id: Workspace from X-Workspace-Id header.
        user_id: Authenticated user ID.
        service: Injected SkillGeneratorService.

    Returns:
        SkillSaveResponse with saved skill ID.
    """
    payload = SkillSavePayload(
        workspace_id=workspace_id,
        user_id=user_id,
        session_id=body.session_id,
        save_type=body.save_type,
        name=body.name,
        description=body.description,
        category=body.category,
        icon=body.icon,
        skill_content=body.skill_content,
        example_prompts=body.example_prompts,
        graph_data=body.graph_data,
    )
    result = await service.save_skill(payload)
    return SkillSaveResponse(
        skillId=str(result.skill_id),
        skillName=result.skill_name,
        saveType=result.save_type,
    )
