"""In-process SDK MCP server exposing the ``create_file`` tool.

Phase 87.1 Plan 02. Wraps :func:`pilot_space.ai.tools.file_generation.create_file`
into an MCP tool the Claude Agent SDK can invoke. The server builds a
fresh ``ArtifactUploadService`` per call from the request-scoped
``ToolContext.db_session`` plus the singleton ``SupabaseStorageClient``
from the DI container — mirroring the pattern in ``memory_server.py``.

This server is registered unconditionally (no feature toggle) — file
generation is a core agent capability per CONTEXT.md.

Approval is handled statically: ``create_file`` is in
``TOOL_APPROVAL_MAP`` as ``AUTO_EXECUTE``, so the SDK emits ``tool_use``
and ``tool_result`` events automatically and there is no approval flow
needing an :class:`EventPublisher`.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

from claude_agent_sdk import McpSdkServerConfig, create_sdk_mcp_server, tool

from pilot_space.ai.exceptions import FileGenerationError
from pilot_space.ai.tools.file_generation import FORMAT_MIME_MAP, create_file
from pilot_space.infrastructure.logging import get_logger

if TYPE_CHECKING:
    from pilot_space.ai.tools.mcp_server import ToolContext

logger = get_logger(__name__)

# MCP server name — used in allowed_tools as mcp__pilot-files__{tool_name}.
SERVER_NAME = "pilot-files"

# All tool names for allowed_tools configuration.
TOOL_NAMES = [
    f"mcp__{SERVER_NAME}__create_file",
]


def _text_result(text: str) -> dict[str, Any]:
    return {"content": [{"type": "text", "text": text}]}


def create_file_tools_server(
    *,
    tool_context: ToolContext | None = None,
) -> McpSdkServerConfig:
    """Create an SDK MCP server registering the ``create_file`` tool.

    Args:
        tool_context: Active request context. Provides ``db_session``
            for repository construction, plus ``workspace_id`` /
            ``user_id`` for the file_generation handler. ``None`` is
            tolerated only so the SDK can introspect the schema; actual
            invocations without a context return a typed error.
    """

    @tool(
        "create_file",
        (
            "Generate a downloadable file artifact (Markdown or HTML) and "
            "attach it to the chat as a download card. Use 'md' for "
            "editable / portable text (specs, summaries, READMEs, meeting "
            "notes). Use 'html' for styled / print-ready output (reports, "
            "embedded inline CSS, tabular layouts). The filename is "
            "sanitised server-side and the extension is forced based on "
            "format. Max 10 MB."
        ),
        {
            "type": "object",
            "properties": {
                "filename": {
                    "type": "string",
                    "description": (
                        "Suggested filename. Path components are "
                        "stripped server-side; the extension is "
                        "overwritten to match 'format'."
                    ),
                },
                "content": {
                    "type": "string",
                    "description": (
                        "UTF-8 text body. Must be non-empty and fit in "
                        "10 MB once encoded."
                    ),
                },
                "format": {
                    "type": "string",
                    "enum": list(FORMAT_MIME_MAP.keys()),
                    "description": (
                        "'md' (text/markdown) or 'html' (text/html). "
                        "Server-controlled MIME map; cannot be "
                        "overridden by the model."
                    ),
                },
            },
            "required": ["filename", "content", "format"],
        },
    )
    async def create_file_tool(args: dict[str, Any]) -> dict[str, Any]:
        if tool_context is None:
            return _text_result(
                "Error: tool_context not available for create_file"
            )

        # Lazy import to avoid hard coupling at module import time and
        # to mirror the pattern used in note_server.py / memory_server.py.
        from pilot_space.application.services.artifact.artifact_upload_service import (
            ArtifactUploadService,
        )
        from pilot_space.container.container import get_container
        from pilot_space.infrastructure.database.repositories.artifact_repository import (
            ArtifactRepository,
        )

        try:
            storage_client = get_container().storage_client()
        except Exception:
            logger.exception("create_file_storage_resolve_failed")
            return _text_result(
                "Error: storage client is not configured. Contact your "
                "administrator."
            )

        artifact_repo = ArtifactRepository(tool_context.db_session)
        upload_service = ArtifactUploadService(
            session=tool_context.db_session,
            storage_client=storage_client,
            artifact_repo=artifact_repo,
        )

        try:
            result = await create_file(
                filename=args["filename"],
                content=args["content"],
                format=args["format"],
                tool_context=tool_context,
                upload_service=upload_service,
            )
        except FileGenerationError as exc:
            # Surface a typed error to the agent so it can recover. We
            # return a tool_result rather than raising so the SDK does
            # not abort the conversation.
            logger.info(
                "ai_file_generated",
                workspace_id=tool_context.workspace_id,
                user_id=tool_context.user_id,
                format=args.get("format"),
                size_bytes=len((args.get("content") or "").encode("utf-8")),
                error_code=exc.code,
                success=False,
            )
            return _text_result(
                json.dumps(
                    {
                        "error": True,
                        "error_code": exc.code,
                        "message": exc.message,
                    }
                )
            )

        return _text_result(json.dumps({"ok": True, **result.payload}))

    return create_sdk_mcp_server(
        name=SERVER_NAME,
        version="1.0.0",
        tools=[create_file_tool],
    )


__all__ = ["SERVER_NAME", "TOOL_NAMES", "create_file_tools_server"]
