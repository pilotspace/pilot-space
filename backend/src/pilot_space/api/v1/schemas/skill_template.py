"""Pydantic v2 request/response schemas for skill template endpoints.

Source: Phase 20, P20-05
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class SkillTemplateSchema(BaseModel):
    """Response schema for a single skill template."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    workspace_id: UUID
    name: str
    description: str
    skill_content: str
    icon: str
    sort_order: int
    source: str
    role_type: str | None
    is_active: bool
    created_by: UUID | None
    created_at: datetime
    updated_at: datetime


class SkillTemplateCreate(BaseModel):
    """Request body for creating a workspace skill template."""

    name: str = Field(max_length=100, description="Template display name")
    description: str = Field(description="Brief description for catalog UI")
    skill_content: str = Field(
        max_length=15000,
        description="SKILL.md-format markdown content",
    )
    icon: str = Field(default="Wand2", description="Frontend icon identifier")
    sort_order: int = Field(default=0, description="Display ordering in catalog")
    role_type: str | None = Field(
        default=None,
        description="Optional SDLC role lineage",
    )


class SkillTemplateUpdate(BaseModel):
    """Request body for updating a skill template.

    All fields optional -- only provided fields are applied.
    """

    name: str | None = Field(default=None, max_length=100)
    description: str | None = None
    skill_content: str | None = Field(default=None, max_length=15000)
    icon: str | None = None
    sort_order: int | None = None
    is_active: bool | None = None


__all__ = [
    "SkillTemplateCreate",
    "SkillTemplateSchema",
    "SkillTemplateUpdate",
]
