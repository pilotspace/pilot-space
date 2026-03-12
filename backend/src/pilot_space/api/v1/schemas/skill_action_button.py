"""Pydantic v2 schemas for skill action button endpoints.

Request/response models for action button CRUD and reorder operations.

Source: Phase 17, SKBTN-01..04
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from pilot_space.infrastructure.database.models.skill_action_button import BindingType


class SkillActionButtonCreate(BaseModel):
    """Request to create a skill action button.

    Attributes:
        name: Display name (1-100 chars).
        icon: Optional icon identifier.
        binding_type: SKILL or MCP_TOOL.
        binding_id: Optional UUID of the bound skill/tool.
        binding_metadata: JSONB metadata dict.
    """

    name: str = Field(min_length=1, max_length=100)
    icon: str | None = None
    binding_type: BindingType
    binding_id: UUID | None = None
    binding_metadata: dict = Field(default_factory=dict)  # type: ignore[type-arg]


class SkillActionButtonUpdate(BaseModel):
    """Request to update a skill action button (all fields optional).

    Attributes:
        name: Updated display name.
        icon: Updated icon identifier.
        binding_type: Updated binding type.
        binding_id: Updated binding ID.
        binding_metadata: Updated metadata.
        sort_order: Updated display order.
        is_active: Updated active state.
    """

    name: str | None = Field(default=None, min_length=1, max_length=100)
    icon: str | None = None
    binding_type: BindingType | None = None
    binding_id: UUID | None = None
    binding_metadata: dict | None = None  # type: ignore[type-arg]
    sort_order: int | None = None
    is_active: bool | None = None


class SkillActionButtonResponse(BaseModel):
    """Response for a skill action button.

    Attributes:
        id: Button UUID.
        name: Display name.
        icon: Icon identifier.
        binding_type: SKILL or MCP_TOOL.
        binding_id: Bound skill/tool UUID.
        binding_metadata: JSONB metadata.
        sort_order: Display order.
        is_active: Whether button is visible.
        created_at: Creation timestamp.
        updated_at: Last update timestamp.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    icon: str | None
    binding_type: BindingType
    binding_id: UUID | None
    binding_metadata: dict  # type: ignore[type-arg]
    sort_order: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


class SkillActionButtonReorder(BaseModel):
    """Request to reorder action buttons.

    Attributes:
        button_ids: Ordered list of button UUIDs (first = lowest sort_order).
    """

    button_ids: list[UUID]


__all__ = [
    "SkillActionButtonCreate",
    "SkillActionButtonReorder",
    "SkillActionButtonResponse",
    "SkillActionButtonUpdate",
]
