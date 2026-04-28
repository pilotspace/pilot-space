"""TDD tests for the AI ``create_file`` tool (Phase 87.1 Plan 02).

RED phase — these tests assert the contract specified in
``.planning/phases/87.1-.../87.1-02-create-file-tool-and-skill-PLAN.md``:

* ``create_file(filename, content, format)`` returns a ``ToolResult`` with
  ``status="executed"``, ``approval_level=AUTO_EXECUTE``, and a payload
  carrying ``artifact_id``, ``filename``, ``mime_type``, ``size_bytes``,
  ``format``.
* ``format='md'`` -> ``mime_type='text/markdown'``;
  ``format='html'`` -> ``mime_type='text/html'``.
* Server-controlled MIME map (model cannot override).
* Filename is sanitised server-side: path-traversal segments are stripped
  (e.g. ``../etc/passwd`` -> ``passwd.md``).
* Content > 10 MB raises ``FileGenerationError`` with code ``FILE_TOO_LARGE``
  before any storage I/O.
* Empty content raises ``FileGenerationError`` with code ``EMPTY_FILE``.
* Unsupported format raises ``FileGenerationError`` with code
  ``UNSUPPORTED_FORMAT``.
* ``workspace_id`` and ``user_id`` are sourced from ``ToolContext``;
  ``project_id=None`` is forwarded to ``ArtifactUploadService.upload``.

All tests use a mocked ``ArtifactUploadService`` — no DB or storage.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest

from pilot_space.ai.exceptions import FileGenerationError
from pilot_space.ai.tools.file_generation import create_file
from pilot_space.ai.tools.mcp_server import ToolApprovalLevel, ToolContext
from pilot_space.api.v1.schemas.artifacts import ArtifactResponse

_MAX_BYTES = 10 * 1024 * 1024


def _make_tool_context() -> ToolContext:
    return ToolContext(
        db_session=AsyncMock(),
        workspace_id=str(uuid.uuid4()),
        user_id=str(uuid.uuid4()),
    )


def _make_upload_service(
    *,
    filename: str,
    mime_type: str,
    size_bytes: int,
    project_id: uuid.UUID | None = None,
) -> AsyncMock:
    """Mock ArtifactUploadService whose ``.upload`` returns a real ArtifactResponse."""
    svc = AsyncMock()
    svc.upload.return_value = ArtifactResponse(
        id=uuid.uuid4(),
        project_id=project_id,
        user_id=uuid.uuid4(),
        filename=filename,
        mime_type=mime_type,
        size_bytes=size_bytes,
        status="ready",
        created_at=datetime.now(tz=UTC),
    )
    return svc


class TestFormatDispatch:
    """MIME map is server-controlled."""

    @pytest.mark.asyncio
    async def test_md_format_produces_text_markdown_mime(self) -> None:
        ctx = _make_tool_context()
        svc = _make_upload_service(
            filename="report.md", mime_type="text/markdown", size_bytes=4
        )

        result = await create_file(
            filename="report.md",
            content="# hi",
            format="md",
            tool_context=ctx,
            upload_service=svc,
        )

        assert result.status == "executed"
        assert result.approval_level == ToolApprovalLevel.AUTO_EXECUTE
        assert result.tool == "create_file"
        assert result.payload["mime_type"] == "text/markdown"
        assert result.payload["format"] == "md"
        assert result.payload["filename"] == "report.md"
        assert result.payload["size_bytes"] == 4
        # artifact_id is a UUID string
        uuid.UUID(result.payload["artifact_id"])

    @pytest.mark.asyncio
    async def test_html_format_produces_text_html_mime(self) -> None:
        ctx = _make_tool_context()
        body = "<html><body>hi</body></html>"
        svc = _make_upload_service(
            filename="page.html",
            mime_type="text/html",
            size_bytes=len(body.encode("utf-8")),
        )

        result = await create_file(
            filename="page.html",
            content=body,
            format="html",
            tool_context=ctx,
            upload_service=svc,
        )

        assert result.payload["mime_type"] == "text/html"
        assert result.payload["format"] == "html"

    @pytest.mark.asyncio
    async def test_unsupported_format_raises_typed_error(self) -> None:
        ctx = _make_tool_context()
        svc = AsyncMock()  # must not be called

        with pytest.raises(FileGenerationError) as exc:
            await create_file(
                filename="x.pdf",
                content="ignored",
                format="pdf",
                tool_context=ctx,
                upload_service=svc,
            )

        assert exc.value.code == "UNSUPPORTED_FORMAT"
        svc.upload.assert_not_called()


class TestSizeAndContentValidation:
    """10 MB ceiling and empty-content guard run BEFORE storage I/O."""

    @pytest.mark.asyncio
    async def test_oversized_content_rejected_before_upload(self) -> None:
        ctx = _make_tool_context()
        svc = AsyncMock()
        # 10 MB + 1 byte (UTF-8 encodes ASCII char to 1 byte)
        oversized = "x" * (_MAX_BYTES + 1)

        with pytest.raises(FileGenerationError) as exc:
            await create_file(
                filename="huge.md",
                content=oversized,
                format="md",
                tool_context=ctx,
                upload_service=svc,
            )

        assert exc.value.code == "FILE_TOO_LARGE"
        svc.upload.assert_not_called()

    @pytest.mark.asyncio
    async def test_empty_content_rejected(self) -> None:
        ctx = _make_tool_context()
        svc = AsyncMock()

        with pytest.raises(FileGenerationError) as exc:
            await create_file(
                filename="empty.md",
                content="",
                format="md",
                tool_context=ctx,
                upload_service=svc,
            )

        assert exc.value.code == "EMPTY_FILE"
        svc.upload.assert_not_called()


class TestFilenameSanitization:
    """Path-traversal segments and unsafe characters are stripped server-side."""

    @pytest.mark.asyncio
    async def test_path_traversal_stripped(self) -> None:
        ctx = _make_tool_context()
        svc = _make_upload_service(
            filename="passwd.md", mime_type="text/markdown", size_bytes=4
        )

        result = await create_file(
            filename="../etc/passwd",
            content="data",
            format="md",
            tool_context=ctx,
            upload_service=svc,
        )

        # Sanitiser strips path components AND appends the format-correct extension.
        assert result.payload["filename"] == "passwd.md"
        # Service was called with the sanitised filename
        kwargs = svc.upload.call_args.kwargs
        assert kwargs["filename"] == "passwd.md"
        # Project_id forwarded as None (AI-generated)
        assert kwargs["project_id"] is None

    @pytest.mark.asyncio
    async def test_filename_without_extension_gets_format_extension(self) -> None:
        ctx = _make_tool_context()
        svc = _make_upload_service(
            filename="report.md", mime_type="text/markdown", size_bytes=2
        )

        result = await create_file(
            filename="report",
            content="hi",
            format="md",
            tool_context=ctx,
            upload_service=svc,
        )

        assert result.payload["filename"] == "report.md"


class TestContextWiring:
    """workspace_id and user_id flow from ToolContext into ArtifactUploadService."""

    @pytest.mark.asyncio
    async def test_workspace_and_user_passed_through_with_project_none(self) -> None:
        ws_id = uuid.uuid4()
        user_id = uuid.uuid4()
        ctx = ToolContext(
            db_session=AsyncMock(),
            workspace_id=str(ws_id),
            user_id=str(user_id),
        )
        svc = _make_upload_service(
            filename="x.md", mime_type="text/markdown", size_bytes=1
        )

        await create_file(
            filename="x.md",
            content="x",
            format="md",
            tool_context=ctx,
            upload_service=svc,
        )

        kwargs = svc.upload.call_args.kwargs
        assert kwargs["workspace_id"] == ws_id
        assert kwargs["user_id"] == user_id
        assert kwargs["project_id"] is None
        assert kwargs["content_type"] == "text/markdown"
        assert kwargs["file_data"] == b"x"
