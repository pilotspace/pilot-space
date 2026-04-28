"""AI ``create_file`` tool — generate Markdown / HTML artifacts.

Phase 87.1 Plan 02. The tool encodes UTF-8 content into bytes, validates
size against the 10 MB ceiling, sanitises the filename server-side, and
persists via :class:`ArtifactUploadService` (with ``project_id=None`` so
the storage key uses the literal ``ai-generated`` segment introduced in
Plan 87.1-01).

Approval level: ``AUTO_EXECUTE``. Documented deviation from
``CREATE_NOTE`` / ``CREATE_ISSUE`` (REQUIRE_APPROVAL): file generation is
non-destructive content creation explicitly requested by the user in
chat; the file is not visible to teammates until shared. See
``.planning/phases/87.1-.../87.1-CONTEXT.md`` ("Approval & DD-003
Compliance").

DI / wiring notes
-----------------
This handler is invoked by the SDK MCP server (see
``ai/mcp/file_server.py``) which builds the ``ArtifactUploadService``
inline from ``ToolContext.db_session`` + the container-managed
``SupabaseStorageClient``. The module path is still listed in
``container.wiring_config.modules`` per the project DI rules so future
``@inject`` decorators on helpers in this module resolve correctly.

Server-controlled MIME map
--------------------------
The agent / model cannot override the MIME type. ``format`` is a typed
enum (``md`` | ``html``) that maps to a fixed MIME and extension. Any
other value raises :class:`FileGenerationError` with code
``UNSUPPORTED_FORMAT``.

Telemetry
---------
Every successful invocation emits a structured INFO log
``ai_file_generated`` with ``workspace_id``, ``user_id``, ``format``,
``size_bytes``, ``artifact_id`` (per CONTEXT.md telemetry section). Logs
never include the file content nor signed URLs.
"""

from __future__ import annotations

import pathlib
import re
from typing import TYPE_CHECKING
from uuid import UUID

from pilot_space.ai.exceptions import FileGenerationError
from pilot_space.ai.tools.mcp_server import ToolApprovalLevel, ToolResult
from pilot_space.infrastructure.logging import get_logger

if TYPE_CHECKING:
    from pilot_space.ai.tools.mcp_server import ToolContext
    from pilot_space.application.services.artifact.artifact_upload_service import (
        ArtifactUploadService,
    )

logger = get_logger(__name__)

# Server-controlled MIME map — model cannot override.
FORMAT_MIME_MAP: dict[str, str] = {
    "md": "text/markdown",
    "html": "text/html",
}

FORMAT_EXTENSION_MAP: dict[str, str] = {
    "md": ".md",
    "html": ".html",
}

# 10 MB ceiling — matches existing artifact upload limit.
_MAX_BYTES = 10 * 1024 * 1024

# Strip ASCII control characters (NUL through US, plus DEL).
_CONTROL_CHAR_RE = re.compile(r"[\x00-\x1f\x7f]")
# Restrict to a conservative safe charset.
_UNSAFE_CHAR_RE = re.compile(r"[^A-Za-z0-9._\- ]")


def _sanitize_filename(name: str, fmt: str) -> str:
    """Sanitise filename server-side; never trust agent-provided names.

    Steps:
        1. ``pathlib.Path(name).name`` strips any directory components,
           neutralising path-traversal (``../etc/passwd`` -> ``passwd``).
        2. Strip ASCII control characters.
        3. Replace any character outside ``[A-Za-z0-9._\\- ]`` with ``_``.
        4. Collapse leading dots so the result cannot be a hidden file
           (``.bashrc`` -> ``bashrc``) which would be confusing for users.
        5. Fallback to ``"file"`` if the sanitised stem is empty.
        6. Append the extension matching ``fmt`` if not already present.
    """
    base = pathlib.Path(name).name  # path-component strip
    base = _CONTROL_CHAR_RE.sub("", base)
    base = _UNSAFE_CHAR_RE.sub("_", base)
    base = base.lstrip(".")
    if not base:
        base = "file"
    expected_ext = FORMAT_EXTENSION_MAP[fmt]
    if not base.lower().endswith(expected_ext):
        # Drop any pre-existing extension that doesn't match the format
        # so the caller can't smuggle e.g. ``report.exe`` through with
        # format='md' producing ``report.exe.md``. Per CONTEXT.md the
        # extension is server-derived from ``format``.
        stem = pathlib.Path(base).stem or "file"
        base = f"{stem}{expected_ext}"
    return base


async def create_file(
    *,
    filename: str,
    content: str,
    format: str,
    tool_context: ToolContext,
    upload_service: ArtifactUploadService,
) -> ToolResult:
    """Generate a downloadable Markdown or HTML artifact.

    Args:
        filename: Suggested filename. Sanitised server-side; the
            extension is overwritten based on ``format``.
        content: UTF-8 text body. Must be non-empty and <= 10 MB once
            encoded.
        format: ``"md"`` or ``"html"``. Drives the MIME type and the
            final extension.
        tool_context: Server-side session context. ``workspace_id`` and
            ``user_id`` are extracted from here, NEVER from tool args,
            to prevent cross-workspace writes.
        upload_service: ``ArtifactUploadService`` instance bound to the
            request session. The MCP server (file_server.py) constructs
            it from ``tool_context.db_session`` plus the singleton
            storage client.

    Returns:
        ``ToolResult`` with ``status="executed"`` and a payload carrying
        ``artifact_id``, ``filename``, ``mime_type``, ``size_bytes``,
        ``format``.

    Raises:
        FileGenerationError: ``UNSUPPORTED_FORMAT``, ``EMPTY_FILE``,
            ``FILE_TOO_LARGE``, or ``NO_USER`` (missing user context).
    """
    if format not in FORMAT_MIME_MAP:
        raise FileGenerationError(
            f"Unsupported format: {format!r}. Supported: md, html.",
            code="UNSUPPORTED_FORMAT",
        )

    data = content.encode("utf-8")
    if len(data) == 0:
        raise FileGenerationError(
            "Cannot create an empty file.",
            code="EMPTY_FILE",
        )
    if len(data) > _MAX_BYTES:
        raise FileGenerationError(
            f"Content exceeds 10 MB limit ({len(data)} bytes).",
            code="FILE_TOO_LARGE",
        )

    mime = FORMAT_MIME_MAP[format]
    safe_filename = _sanitize_filename(filename, format)

    workspace_uuid = UUID(tool_context.workspace_id)
    if tool_context.user_id is None:
        raise FileGenerationError(
            "Authenticated user context is required to create a file.",
            code="NO_USER",
        )
    user_uuid = UUID(tool_context.user_id)

    artifact = await upload_service.upload(
        file_data=data,
        filename=safe_filename,
        content_type=mime,
        workspace_id=workspace_uuid,
        project_id=None,  # AI-generated — Plan 87.1-01 enabled this branch
        user_id=user_uuid,
    )

    # Telemetry — never log signed URLs nor file content.
    logger.info(
        "ai_file_generated",
        workspace_id=str(workspace_uuid),
        user_id=str(user_uuid),
        format=format,
        size_bytes=len(data),
        artifact_id=str(artifact.id),
        success=True,
    )

    return ToolResult(
        tool="create_file",
        operation="generate",
        status="executed",
        approval_level=ToolApprovalLevel.AUTO_EXECUTE,
        payload={
            "artifact_id": str(artifact.id),
            "filename": safe_filename,
            "mime_type": mime,
            "size_bytes": len(data),
            "format": format,
        },
    )


__all__ = [
    "FORMAT_EXTENSION_MAP",
    "FORMAT_MIME_MAP",
    "create_file",
]
