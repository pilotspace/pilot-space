"""Note intent handlers (Phase 89 Plan 03).

Registered tool names:

* ``create_note`` — creates a Note via ``CreateNoteService``.
* ``create_note_annotation`` — inserts a ``NoteAnnotation`` row.

Handlers live here because they perform real DB mutations; the audit gate
allow-lists only ``pilot_space/ai/proposals/intent_handlers/``.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import select

from pilot_space.ai.proposals.intent_executor import register_intent
from pilot_space.application.services.proposal_bus import IntentExecutionOutcome
from pilot_space.dependencies.auth import get_current_session
from pilot_space.domain.exceptions import NotFoundError
from pilot_space.infrastructure.database.models import (
    AnnotationStatus,
    AnnotationType,
    Note,
    NoteAnnotation,
)


def _safe_uuid(value: Any) -> UUID | None:
    if value is None:
        return None
    if isinstance(value, UUID):
        return value
    try:
        return UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        return None


@register_intent("create_note_annotation")
async def execute_create_note_annotation(
    args: dict[str, Any],
    *,
    workspace_id: UUID,
    target_artifact_id: UUID,
) -> IntentExecutionOutcome:
    """Persist an AI margin annotation on a note.

    ``target_artifact_id`` is the Note id (same as ``args['note_id']``); we
    pull from ``args`` for clarity since the tool that built the proposal
    already resolved it.
    """
    session = get_current_session()

    note_id = _safe_uuid(args.get("note_id"))
    if note_id is None:
        msg = f"create_note_annotation: invalid note_id={args.get('note_id')!r}"
        raise NotFoundError(msg)

    note = (
        await session.execute(
            select(Note).where(
                Note.id == note_id,
                Note.workspace_id == workspace_id,
            )
        )
    ).scalar_one_or_none()
    if note is None:
        msg = f"Note {note_id} not found"
        raise NotFoundError(msg)

    try:
        ann_type = AnnotationType(str(args.get("annotation_type", "")))
    except ValueError as exc:
        valid = [t.value for t in AnnotationType]
        msg = f"Invalid annotation_type; valid: {valid}"
        raise ValueError(msg) from exc

    confidence = float(args.get("confidence", 0.8))
    annotation = NoteAnnotation(
        note_id=note_id,
        block_id=args.get("block_id") or None,
        type=ann_type,
        content=str(args.get("content", "")),
        status=AnnotationStatus.PENDING,
        confidence=confidence,
        workspace_id=workspace_id,
    )
    session.add(annotation)
    await session.flush()
    # No version concept for annotations — return v1.
    return IntentExecutionOutcome(applied_version=1, lines_changed=1)


@register_intent("create_note")
async def execute_create_note(
    args: dict[str, Any],
    *,
    workspace_id: UUID,
    target_artifact_id: UUID,
) -> IntentExecutionOutcome:
    """Create a Note via ``CreateNoteService``.

    ``args`` carries: ``title``, optional ``content_markdown``,
    optional ``project_id``, and the ``owner_id`` resolved at tool time.
    """
    from pilot_space.application.services.note.content_converter import ContentConverter
    from pilot_space.application.services.note.create_note_service import (
        CreateNotePayload,
        CreateNoteService,
    )
    from pilot_space.infrastructure.database.repositories.note_repository import (
        NoteRepository,
    )
    from pilot_space.infrastructure.database.repositories.template_repository import (
        TemplateRepository,
    )

    session = get_current_session()
    owner_id = _safe_uuid(args.get("owner_id"))
    if owner_id is None:
        msg = "create_note: owner_id is required"
        raise ValueError(msg)

    tiptap_content: dict[str, Any] | None = None
    if args.get("content_markdown"):
        tiptap_content = ContentConverter().markdown_to_tiptap(
            str(args["content_markdown"])
        )

    payload = CreateNotePayload(
        workspace_id=workspace_id,
        owner_id=owner_id,
        title=str(args.get("title", "")),
        content=tiptap_content,
        project_id=_safe_uuid(args.get("project_id")),
    )
    svc = CreateNoteService(
        session=session,
        note_repository=NoteRepository(session),
        template_repository=TemplateRepository(session),
    )
    result = await svc.execute(payload)
    # Fresh notes start at version 1 — Note doesn't carry version_number yet.
    _ = result.note.id
    return IntentExecutionOutcome(applied_version=1, lines_changed=None)
