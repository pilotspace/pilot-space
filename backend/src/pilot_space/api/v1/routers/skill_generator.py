"""Skill Generator API router.

Handles saving skills generated through conversational AI
and dedicated chat SSE endpoint for skill generation.

Phase 051: Conversational Skill Generator
Phase 058: Dedicated generator chat endpoint with graph_update events
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
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


class GeneratorChatRequest(BaseModel):
    """Request body for generator chat SSE endpoint."""

    message: str = Field(..., min_length=1, max_length=5000)
    session_id: UUID | None = Field(default=None, alias="sessionId")
    context: dict[str, Any] = Field(default_factory=dict)

    model_config = {"populate_by_name": True}


@router.post(
    "/chat",
    response_model=None,
    summary="Generator chat SSE stream",
    description="Stream skill generation events via SSE. Emits content_delta, "
    "skill_preview, graph_update, done, and error events.",
)
async def generator_chat(
    body: GeneratorChatRequest,
    fastapi_request: Request,
    session: DbSession,
    workspace_id: HeaderWorkspaceMemberId,
    user_id: CurrentUserId,
    service: SkillGeneratorServiceDep,
) -> StreamingResponse:
    """Chat endpoint for skill generation with SSE streaming.

    Returns an SSE stream with skill generation events including
    content_delta, skill_preview, graph_update, done, and error.

    Args:
        body: Chat request with message, session_id, and context.
        fastapi_request: FastAPI request for disconnect detection.
        session: DB session (required for DI context).
        workspace_id: Workspace from X-Workspace-Id header.
        user_id: Authenticated user ID.
        service: Injected SkillGeneratorService.

    Returns:
        StreamingResponse with SSE events.
    """
    import asyncio

    logger.info(
        "Generator chat: message='%s', workspace_id=%s",
        body.message[:50],
        workspace_id,
    )

    async def stream_response():
        """Generate SSE stream from skill generator service."""
        try:
            async with asyncio.timeout(300):
                async for sse_event in service.generate_chat_response(
                    message=body.message,
                    workspace_id=workspace_id,
                    user_id=user_id,
                    session_id=body.session_id,
                    context=body.context,
                ):
                    yield sse_event

                    if await fastapi_request.is_disconnected():
                        logger.info("Client disconnected during generator chat stream")
                        break
        except TimeoutError:
            logger.warning("Generator chat stream timeout")
            yield 'event: error\ndata: {"message": "Stream exceeded maximum duration"}\n\n'
        except Exception as e:
            logger.exception("Generator chat endpoint error: %s", e)
            yield 'event: error\ndata: {"message": "An internal error occurred"}\n\n'

    return StreamingResponse(
        stream_response(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


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
