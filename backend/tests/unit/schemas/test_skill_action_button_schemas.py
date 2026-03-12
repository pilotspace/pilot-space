"""Unit tests for SkillActionButton Pydantic schemas.

Tests validation rules for create/update/response/reorder schemas.

Source: Phase 17, SKBTN-01..04
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from pilot_space.api.v1.schemas.skill_action_button import (
    SkillActionButtonCreate,
    SkillActionButtonReorder,
    SkillActionButtonResponse,
    SkillActionButtonUpdate,
)
from pilot_space.infrastructure.database.models.skill_action_button import BindingType


class TestSkillActionButtonCreate:
    """Tests for SkillActionButtonCreate validation."""

    def test_valid_create_skill_binding(self) -> None:
        """Accept valid creation with SKILL binding type."""
        req = SkillActionButtonCreate(
            name="Run Tests",
            icon="play",
            binding_type=BindingType.SKILL,
            binding_id=uuid4(),
        )
        assert req.name == "Run Tests"
        assert req.binding_type == BindingType.SKILL
        assert req.binding_metadata == {}

    def test_valid_create_mcp_tool_binding(self) -> None:
        """Accept valid creation with MCP_TOOL binding type."""
        req = SkillActionButtonCreate(
            name="Deploy",
            binding_type=BindingType.MCP_TOOL,
            binding_metadata={"server_id": "abc123"},
        )
        assert req.binding_type == BindingType.MCP_TOOL
        assert req.binding_metadata == {"server_id": "abc123"}

    def test_rejects_empty_name(self) -> None:
        """Reject empty name."""
        with pytest.raises(ValidationError):
            SkillActionButtonCreate(
                name="",
                binding_type=BindingType.SKILL,
            )

    def test_rejects_long_name(self) -> None:
        """Reject name over 100 chars."""
        with pytest.raises(ValidationError):
            SkillActionButtonCreate(
                name="x" * 101,
                binding_type=BindingType.SKILL,
            )

    def test_accepts_max_length_name(self) -> None:
        """Accept name at exactly 100 chars."""
        req = SkillActionButtonCreate(
            name="x" * 100,
            binding_type=BindingType.SKILL,
        )
        assert len(req.name) == 100

    def test_rejects_invalid_binding_type(self) -> None:
        """Reject invalid binding_type value."""
        with pytest.raises(ValidationError):
            SkillActionButtonCreate(
                name="Test",
                binding_type="invalid",  # type: ignore[arg-type]
            )

    def test_icon_and_binding_id_optional(self) -> None:
        """Icon and binding_id are optional, defaulting to None."""
        req = SkillActionButtonCreate(
            name="Test",
            binding_type=BindingType.SKILL,
        )
        assert req.icon is None
        assert req.binding_id is None

    def test_default_binding_metadata(self) -> None:
        """binding_metadata defaults to empty dict."""
        req = SkillActionButtonCreate(
            name="Test",
            binding_type=BindingType.MCP_TOOL,
        )
        assert req.binding_metadata == {}


class TestSkillActionButtonUpdate:
    """Tests for SkillActionButtonUpdate validation."""

    def test_all_fields_optional(self) -> None:
        """Accept request with no fields (no-op update)."""
        req = SkillActionButtonUpdate()
        assert req.name is None
        assert req.icon is None
        assert req.binding_type is None
        assert req.binding_id is None
        assert req.binding_metadata is None
        assert req.sort_order is None
        assert req.is_active is None

    def test_partial_update_name(self) -> None:
        """Accept partial update with only name."""
        req = SkillActionButtonUpdate(name="Updated Name")
        assert req.name == "Updated Name"
        assert req.binding_type is None

    def test_partial_update_sort_order(self) -> None:
        """Accept partial update with only sort_order."""
        req = SkillActionButtonUpdate(sort_order=5)
        assert req.sort_order == 5

    def test_partial_update_is_active(self) -> None:
        """Accept partial update with only is_active."""
        req = SkillActionButtonUpdate(is_active=False)
        assert req.is_active is False

    def test_rejects_empty_name_when_provided(self) -> None:
        """Reject empty name when explicitly set."""
        with pytest.raises(ValidationError):
            SkillActionButtonUpdate(name="")

    def test_rejects_long_name_when_provided(self) -> None:
        """Reject name over 100 chars when explicitly set."""
        with pytest.raises(ValidationError):
            SkillActionButtonUpdate(name="x" * 101)


class TestSkillActionButtonResponse:
    """Tests for SkillActionButtonResponse serialization."""

    def test_includes_all_fields(self) -> None:
        """Response includes all expected fields."""
        now = datetime.now(tz=UTC)
        resp = SkillActionButtonResponse(
            id=uuid4(),
            name="Run Tests",
            icon="play",
            binding_type=BindingType.SKILL,
            binding_id=uuid4(),
            binding_metadata={"key": "val"},
            sort_order=10,
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        data = resp.model_dump()
        assert "id" in data
        assert "name" in data
        assert "icon" in data
        assert "binding_type" in data
        assert "binding_id" in data
        assert "binding_metadata" in data
        assert "sort_order" in data
        assert "is_active" in data
        assert "created_at" in data
        assert "updated_at" in data

    def test_from_attributes(self) -> None:
        """Response can be created from ORM-like object via from_attributes."""
        now = datetime.now(tz=UTC)
        resp = SkillActionButtonResponse.model_validate(
            {
                "id": uuid4(),
                "name": "Deploy",
                "icon": None,
                "binding_type": BindingType.MCP_TOOL,
                "binding_id": None,
                "binding_metadata": {},
                "sort_order": 0,
                "is_active": True,
                "created_at": now,
                "updated_at": now,
            }
        )
        assert resp.name == "Deploy"
        assert resp.binding_type == BindingType.MCP_TOOL


class TestSkillActionButtonReorder:
    """Tests for SkillActionButtonReorder validation."""

    def test_valid_reorder(self) -> None:
        """Accept valid list of button IDs."""
        ids = [uuid4(), uuid4(), uuid4()]
        req = SkillActionButtonReorder(button_ids=ids)
        assert len(req.button_ids) == 3

    def test_empty_list(self) -> None:
        """Accept empty list (no-op reorder)."""
        req = SkillActionButtonReorder(button_ids=[])
        assert req.button_ids == []
