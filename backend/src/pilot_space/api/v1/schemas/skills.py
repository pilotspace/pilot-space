"""Pydantic schemas for Skills API endpoints.

Lists user-invocable skills discovered from the skills template directory,
plus per-skill detail (markdown body + reference-file metadata) added in
Phase 91 to power the skills gallery and detail page.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class SkillResponse(BaseModel):
    """Single skill in the list response."""

    name: str
    description: str
    category: str
    icon: str
    examples: list[str]
    # Phase 91 additions — additive; older clients ignore unknown fields.
    slug: str
    feature_module: list[str] | None = None
    reference_files: list[str] = Field(default_factory=list)
    updated_at: datetime | None = None


class SkillListResponse(BaseModel):
    """Response for GET /api/v1/skills."""

    skills: list[SkillResponse]


class ReferenceFileMeta(BaseModel):
    """Per-file metadata for the skill detail response."""

    name: str
    path: str
    size_bytes: int
    mime_type: str


class SkillDetailResponse(BaseModel):
    """Response for GET /api/v1/skills/{slug}.

    Modeled as a standalone class (NOT a subclass of SkillResponse) so that
    ``reference_files`` can hold the richer ``list[ReferenceFileMeta]``
    payload without conflicting with the parent's ``list[str]`` shape.
    """

    name: str
    description: str
    category: str
    icon: str
    examples: list[str]
    slug: str
    feature_module: list[str] | None = None
    updated_at: datetime | None = None
    body: str
    reference_files: list[ReferenceFileMeta] = Field(default_factory=list)


__all__ = [
    "ReferenceFileMeta",
    "SkillDetailResponse",
    "SkillListResponse",
    "SkillResponse",
]
