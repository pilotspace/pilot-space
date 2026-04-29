"""Note intent handlers (Phase 89 Plan 03).

Registered tool names:

* ``create_note`` — creates a Note via ``CreateNoteService``.
* ``create_note_annotation`` — inserts a ``NoteAnnotation`` row.
* ``update_note_block`` — replace or append a block in note TipTap content.
* ``enhance_text`` — replace a block with AI-enhanced markdown.
* ``write_to_note`` — append markdown at end of note.
* ``update_note`` — update note metadata (title, is_pinned, project_id).

Handlers live here because they perform real DB mutations; the audit gate
allow-lists only ``pilot_space/ai/proposals/intent_handlers/``.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import select

from pilot_space.ai.proposals.intent_executor import register_intent, register_revert
from pilot_space.application.services.proposal_bus import (
    IntentExecutionOutcome,
    ProposalCannotBeRevertedError,
)
from pilot_space.dependencies.auth import get_current_session
from pilot_space.domain.exceptions import NotFoundError
from pilot_space.domain.proposal import ArtifactType
from pilot_space.infrastructure.database.models import (
    AnnotationStatus,
    AnnotationType,
    Note,
    NoteAnnotation,
)
from pilot_space.infrastructure.database.models.note_version import (
    NoteVersion,
    VersionTrigger,
)
from pilot_space.infrastructure.database.repositories.note_version_repository import (
    NoteVersionRepository,
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
    optional ``project_id``, ``owner_id`` resolved at tool time,
    and optional ``source_chat_session_id`` for ARTF-04 lineage stamping.
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

    # ARTF-04 — stamp source_chat_session_id if provided (AI-originated note).
    # Must happen after creation so the Note row already exists in the session.
    source_chat_session_id = _safe_uuid(args.get("source_chat_session_id"))
    if source_chat_session_id is not None:
        result.note.source_chat_session_id = source_chat_session_id
        await session.flush()

    return IntentExecutionOutcome(applied_version=1, lines_changed=None)


# ---------------------------------------------------------------------------
# Revert handler (Phase 89 Plan 05) — reuses note_versions infra.
# ---------------------------------------------------------------------------


@register_revert(ArtifactType.NOTE)
async def revert_note(
    *,
    workspace_id: UUID,
    target_artifact_id: UUID,
) -> IntentExecutionOutcome:
    """Revert a Note to the most recent ``ai_before`` snapshot.

    Reuses ``note_versions`` table via ``NoteVersionRepository`` (no JSONB
    duplication per plan REV-89-05-A). Restores ``note.content`` from the
    snapshot and appends a NEW NoteVersion row with trigger=MANUAL and
    label="user revert" — prior NoteVersion rows are NEVER mutated
    (append-only invariant).

    Raises ``ProposalCannotBeRevertedError`` if no prior ``ai_before``
    snapshot exists (nothing to revert to).
    """
    session = get_current_session()

    note = (
        await session.execute(
            select(Note).where(
                Note.id == target_artifact_id,
                Note.workspace_id == workspace_id,
            )
        )
    ).scalar_one_or_none()
    if note is None:
        msg = f"Note {target_artifact_id} not found"
        raise NotFoundError(msg)

    nv_repo = NoteVersionRepository(session)
    ai_before = await nv_repo.get_latest_ai_before(
        note_id=target_artifact_id,
        workspace_id=workspace_id,
    )
    if ai_before is None:
        raise ProposalCannotBeRevertedError(
            f"Note {target_artifact_id} has no ai_before snapshot — nothing "
            "to revert to"
        )

    # Compute next version_number for the new snapshot row.
    latest = await nv_repo.get_latest_for_note(
        note_id=target_artifact_id,
        workspace_id=workspace_id,
    )
    next_version = (latest.version_number + 1) if latest is not None else 1

    # Restore note content in place — this is the mutation the user sees.
    note.content = ai_before.content

    # Append a new NoteVersion row recording the revert. MANUAL trigger is
    # used (not a new enum value) to avoid a migration — label carries intent.
    user_revert = NoteVersion(
        note_id=target_artifact_id,
        workspace_id=workspace_id,
        trigger=VersionTrigger.MANUAL,
        content=ai_before.content,
        label="user revert",
        version_number=next_version,
    )
    session.add(user_revert)
    await session.flush()

    return IntentExecutionOutcome(
        applied_version=next_version,
        lines_changed=None,
    )


# ---------------------------------------------------------------------------
# Block content mutation handlers (EDIT-05 / DD-003)
# ---------------------------------------------------------------------------


def _find_and_replace_block(
    nodes: list[dict[str, Any]],
    block_id: str,
    new_nodes: list[dict[str, Any]],
    *,
    operation: str,
) -> tuple[list[dict[str, Any]], bool]:
    """Walk TipTap ``content`` list and replace or append after the target block.

    Returns ``(updated_nodes, found)`` — caller raises ``NotFoundError`` when
    ``found`` is False.  The operation is ``replace`` (swap the block) or
    ``append`` (insert new_nodes immediately after it).
    """
    updated: list[dict[str, Any]] = []
    found = False
    for node in nodes:
        attrs = node.get("attrs") or {}
        node_block_id = attrs.get("id") or attrs.get("blockId") or ""
        if node_block_id == block_id and not found:
            found = True
            if operation == "replace":
                updated.extend(new_nodes)
            else:  # append
                updated.append(node)
                updated.extend(new_nodes)
        else:
            updated.append(node)
    return updated, found


@register_intent("update_note_block")
async def execute_update_note_block(
    args: dict[str, Any],
    *,
    workspace_id: UUID,
    target_artifact_id: UUID,
) -> IntentExecutionOutcome:
    """Replace or append a block in the Note TipTap content.

    ``args`` carries: ``block_id``, ``new_content_markdown``,
    ``operation`` (``replace`` | ``append``).
    """
    from pilot_space.application.services.note.content_converter import ContentConverter

    session = get_current_session()

    note = (
        await session.execute(
            select(Note).where(
                Note.id == target_artifact_id,
                Note.workspace_id == workspace_id,
            )
        )
    ).scalar_one_or_none()
    if note is None:
        msg = f"Note {target_artifact_id} not found"
        raise NotFoundError(msg)

    block_id: str = str(args.get("block_id", ""))
    if not block_id:
        msg = "update_note_block: block_id is required"
        raise ValueError(msg)

    new_markdown: str = str(args.get("new_content_markdown", ""))
    operation: str = str(args.get("operation", "replace"))

    converter = ContentConverter()
    new_tiptap = converter.markdown_to_tiptap(new_markdown)
    new_nodes: list[dict[str, Any]] = new_tiptap.get("content", []) if new_tiptap else []

    current_nodes: list[dict[str, Any]] = (note.content or {}).get("content", [])
    updated_nodes, found = _find_and_replace_block(
        current_nodes, block_id, new_nodes, operation=operation
    )
    if not found:
        msg = f"Block {block_id} not found in note {target_artifact_id}"
        raise NotFoundError(msg)

    note.content = {"type": "doc", "content": updated_nodes}
    await session.flush()
    return IntentExecutionOutcome(applied_version=1, lines_changed=len(new_nodes))


@register_intent("enhance_text")
async def execute_enhance_text(
    args: dict[str, Any],
    *,
    workspace_id: UUID,
    target_artifact_id: UUID,
) -> IntentExecutionOutcome:
    """Replace a block's content with AI-enhanced markdown.

    ``args`` carries: ``block_id``, ``enhanced_markdown``.
    Delegates to ``execute_update_note_block`` with operation=replace.
    """
    delegate_args: dict[str, Any] = {
        "block_id": args.get("block_id", ""),
        "new_content_markdown": args.get("enhanced_markdown", ""),
        "operation": "replace",
    }
    return await execute_update_note_block(
        delegate_args,
        workspace_id=workspace_id,
        target_artifact_id=target_artifact_id,
    )


@register_intent("write_to_note")
async def execute_write_to_note(
    args: dict[str, Any],
    *,
    workspace_id: UUID,
    target_artifact_id: UUID,
) -> IntentExecutionOutcome:
    """Append markdown content at the end of a Note.

    ``args`` carries: ``markdown``.
    """
    from pilot_space.application.services.note.content_converter import ContentConverter

    session = get_current_session()

    note = (
        await session.execute(
            select(Note).where(
                Note.id == target_artifact_id,
                Note.workspace_id == workspace_id,
            )
        )
    ).scalar_one_or_none()
    if note is None:
        msg = f"Note {target_artifact_id} not found"
        raise NotFoundError(msg)

    markdown: str = str(args.get("markdown", ""))
    converter = ContentConverter()
    new_tiptap = converter.markdown_to_tiptap(markdown)
    new_nodes: list[dict[str, Any]] = new_tiptap.get("content", []) if new_tiptap else []

    current_nodes: list[dict[str, Any]] = (note.content or {}).get("content", [])
    note.content = {"type": "doc", "content": current_nodes + new_nodes}
    await session.flush()
    return IntentExecutionOutcome(applied_version=1, lines_changed=len(new_nodes))


@register_intent("update_note")
async def execute_update_note(
    args: dict[str, Any],
    *,
    workspace_id: UUID,
    target_artifact_id: UUID,
) -> IntentExecutionOutcome:
    """Update Note metadata (title, is_pinned, project_id).

    ``args`` carries: ``changes`` — a dict with the fields to update.
    """
    session = get_current_session()

    note = (
        await session.execute(
            select(Note).where(
                Note.id == target_artifact_id,
                Note.workspace_id == workspace_id,
            )
        )
    ).scalar_one_or_none()
    if note is None:
        msg = f"Note {target_artifact_id} not found"
        raise NotFoundError(msg)

    changes: dict[str, Any] = args.get("changes", {})
    if not changes:
        msg = "update_note: no changes provided"
        raise ValueError(msg)

    fields_changed = 0
    if "title" in changes:
        title = str(changes["title"]).strip()
        if not title or len(title) > 255:
            msg = "update_note: title must be 1-255 characters"
            raise ValueError(msg)
        note.title = title
        fields_changed += 1
    if "is_pinned" in changes:
        note.is_pinned = bool(changes["is_pinned"])
        fields_changed += 1
    if "project_id" in changes:
        raw = changes["project_id"]
        note.project_id = _safe_uuid(raw)
        fields_changed += 1

    await session.flush()
    return IntentExecutionOutcome(applied_version=1, lines_changed=fields_changed)
