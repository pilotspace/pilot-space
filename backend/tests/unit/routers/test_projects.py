"""Unit tests for project CRUD schema and route wiring.

Validates lead_id and icon are accepted by create/update schemas
and correctly passed through to the Project entity.
"""

from __future__ import annotations

import uuid

import pytest
from pydantic import ValidationError

from pilot_space.api.v1.schemas.project import (
    ProjectCreate,
    ProjectUpdate,
)


class TestProjectCreateSchema:
    """Validate ProjectCreate accepts lead_id and icon."""

    def test_create_minimal(self) -> None:
        """Minimal create with only required fields."""
        data = ProjectCreate(
            name="Test Project",
            identifier="TP",
            workspace_id=uuid.uuid4(),
        )
        assert data.lead_id is None
        assert data.icon is None

    def test_create_with_lead_id(self) -> None:
        """Create with lead_id populates correctly."""
        lead = uuid.uuid4()
        data = ProjectCreate(
            name="Test Project",
            identifier="TP",
            workspace_id=uuid.uuid4(),
            lead_id=lead,
        )
        assert data.lead_id == lead

    def test_create_with_icon(self) -> None:
        """Create with icon populates correctly."""
        data = ProjectCreate(
            name="Test Project",
            identifier="TP",
            workspace_id=uuid.uuid4(),
            icon="🚀",
        )
        assert data.icon == "🚀"

    def test_create_with_all_fields(self) -> None:
        """Create with all optional fields."""
        lead = uuid.uuid4()
        ws = uuid.uuid4()
        data = ProjectCreate(
            name="Full Project",
            identifier="FP",
            workspace_id=ws,
            description="A complete project",
            lead_id=lead,
            icon="🎯",
        )
        assert data.name == "Full Project"
        assert data.identifier == "FP"
        assert data.workspace_id == ws
        assert data.description == "A complete project"
        assert data.lead_id == lead
        assert data.icon == "🎯"

    def test_create_accepts_camel_case_lead_id(self) -> None:
        """Frontend sends leadId (camelCase) — schema must accept it."""
        lead = uuid.uuid4()
        data = ProjectCreate.model_validate(
            {
                "name": "Test",
                "identifier": "TS",
                "workspaceId": str(uuid.uuid4()),
                "leadId": str(lead),
            }
        )
        assert data.lead_id == lead

    def test_create_icon_max_length(self) -> None:
        """Icon field enforces max_length=10."""
        with pytest.raises(ValidationError):
            ProjectCreate(
                name="Test",
                identifier="TP",
                workspace_id=uuid.uuid4(),
                icon="x" * 11,
            )


class TestProjectUpdateSchema:
    """Validate ProjectUpdate accepts lead_id and icon."""

    def test_update_empty(self) -> None:
        """Empty update (no fields set)."""
        data = ProjectUpdate()
        dumped = data.model_dump(exclude_unset=True)
        assert dumped == {}

    def test_update_lead_id_only(self) -> None:
        """Update only lead_id."""
        lead = uuid.uuid4()
        data = ProjectUpdate(lead_id=lead)
        dumped = data.model_dump(exclude_unset=True)
        assert dumped == {"lead_id": lead}

    def test_update_icon_only(self) -> None:
        """Update only icon."""
        data = ProjectUpdate(icon="🔥")
        dumped = data.model_dump(exclude_unset=True)
        assert dumped == {"icon": "🔥"}

    def test_update_unset_lead_with_none(self) -> None:
        """Explicitly setting lead_id=None should be in exclude_unset dump."""
        data = ProjectUpdate.model_validate({"leadId": None})
        dumped = data.model_dump(exclude_unset=True)
        assert "lead_id" in dumped
        assert dumped["lead_id"] is None

    def test_update_accepts_camel_case(self) -> None:
        """Frontend sends camelCase — schema must accept it."""
        lead = uuid.uuid4()
        data = ProjectUpdate.model_validate(
            {
                "leadId": str(lead),
                "icon": "📦",
            }
        )
        assert data.lead_id == lead
        assert data.icon == "📦"

    def test_update_all_fields(self) -> None:
        """Update with all fields set."""
        lead = uuid.uuid4()
        data = ProjectUpdate(
            name="New Name",
            description="New desc",
            lead_id=lead,
            icon="⭐",
            settings={"key": "value"},
        )
        dumped = data.model_dump(exclude_unset=True)
        assert len(dumped) == 5
        assert dumped["lead_id"] == lead
        assert dumped["icon"] == "⭐"
