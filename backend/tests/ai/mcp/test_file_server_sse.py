"""Phase 87.1 Plan 03 — RED tests for file_server SSE artifact_created emission.

Verifies that ``create_file_tools_server`` accepts an ``EventPublisher``,
and that on a successful ``create_file`` invocation the publisher emits
an ``artifact_created`` SSE frame carrying ``artifact_id``, ``filename``,
``mime_type``, ``size_bytes``, ``format``.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from pilot_space.ai.mcp.event_publisher import EventPublisher
from pilot_space.ai.mcp.file_server import create_file_tools_server


@pytest.fixture
def queue() -> asyncio.Queue[str]:
    return asyncio.Queue()


@pytest.fixture
def publisher(queue: asyncio.Queue[str]) -> EventPublisher:
    return EventPublisher(queue)


@pytest.fixture
def fake_tool_context() -> MagicMock:
    ctx = MagicMock()
    ctx.workspace_id = "11111111-1111-1111-1111-111111111111"
    ctx.user_id = "22222222-2222-2222-2222-222222222222"
    ctx.db_session = MagicMock()
    return ctx


@pytest.mark.asyncio
async def test_create_file_emits_artifact_created_sse(
    publisher: EventPublisher,
    queue: asyncio.Queue[str],
    fake_tool_context: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Successful create_file invocation publishes artifact_created frame."""
    artifact_id = "33333333-3333-3333-3333-333333333333"

    # Stub the tool-level create_file so we don't hit the upload service.
    async def fake_create_file(**_: Any) -> Any:
        from pilot_space.ai.tools.mcp_server import ToolApprovalLevel, ToolResult

        return ToolResult(
            tool="create_file",
            operation="generate",
            status="executed",
            approval_level=ToolApprovalLevel.AUTO_EXECUTE,
            payload={
                "artifact_id": artifact_id,
                "filename": "report.md",
                "mime_type": "text/markdown",
                "size_bytes": 24,
                "format": "md",
            },
        )

    monkeypatch.setattr(
        "pilot_space.ai.mcp.file_server.create_file",
        fake_create_file,
    )
    # Stub container.storage_client so the lazy import path returns a sentinel.
    fake_container = MagicMock()
    fake_container.storage_client.return_value = MagicMock()
    monkeypatch.setattr(
        "pilot_space.container.container.get_container",
        lambda: fake_container,
    )
    # Stub ArtifactRepository / ArtifactUploadService — never executed because
    # the tool-level create_file is itself stubbed above; just need the import
    # paths to be cheap.

    # Build the server WITH a publisher (signature change required for plan).
    server = create_file_tools_server(
        publisher=publisher,
        tool_context=fake_tool_context,
    )
    assert server is not None  # smoke

    # Resolve the tool callable. The SDK exposes registered tools via the
    # ``tools`` attr — we shortcut by looking up the create_file_tool the
    # decorator returned via the closure. The simplest invariant we can
    # assert without coupling to claude_agent_sdk internals is that the
    # publisher saw the frame after the tool ran. We invoke the inner
    # create_file_tool directly by reaching into the server config's
    # registered tool list. Fall back to forcing a publish via the
    # documented `publish` API + the build helper if introspection is
    # brittle in CI.
    from claude_agent_sdk import create_sdk_mcp_server  # noqa: F401  (presence check)

    # Find the registered tool function in the server config.
    # SdkMcpServerConfig is opaque-ish; the test focuses on the publisher
    # behaviour. The implementation under test must call publisher.publish
    # exactly once with an "artifact_created" frame after delegating to
    # create_file. We trigger that by calling the tool through the public
    # path: create_file_tool(args).
    #
    # Internal layout: create_file_tools_server creates ``create_file_tool``
    # and registers it via @tool — the function is captured in closures and
    # not directly accessible. To keep the test stable we replace the
    # publisher with an AsyncMock-wrapped version that records calls and
    # patch ``EventPublisher.publish`` itself for this fixture.
    publish_mock = AsyncMock()
    monkeypatch.setattr(EventPublisher, "publish", publish_mock)

    # Now construct the server again so the closure captures the patched
    # publisher API.
    create_file_tools_server(
        publisher=publisher,
        tool_context=fake_tool_context,
    )

    # Invoke the tool by reaching into the SDK-registered list. The SDK
    # adds tools onto ``server["tools"]`` as a list of decorated handlers.
    # We grab the most recently registered one and call it.
    # If the SDK's exact internals shift, this loop self-discovers via the
    # tool name attribute set by the @tool decorator.
    def _invoke(server_obj: Any) -> Any:
        tools_attr = getattr(server_obj, "tools", None) or server_obj.get("tools", None)
        if tools_attr:
            for t in tools_attr:
                if getattr(t, "name", None) == "create_file" or callable(t):
                    return t
        return None

    # Direct path: construct the helper-built server and look at the ``server``
    # attribute. Claude Agent SDK exposes ``McpSdkServerConfig`` as a TypedDict
    # — search for the inner @tool-decorated function via the module instead.

    # Simpler test path: just assert the publisher API contract — the
    # implementation MUST call ``publisher.publish(build_sse_frame(
    # StreamEvent.ARTIFACT_CREATED, ...))``. We invoke the tool by
    # importing and calling the underlying handler from create_file_tools_server
    # via the in-module accessor we add for tests.
    from pilot_space.ai.mcp import file_server as fs_mod

    # The implementation MUST expose a callable that executes the tool body
    # for testing — either via _create_file_handler factory or by re-exporting
    # the inner closure. The plan documents that file_server gains an
    # EventPublisher; the test asserts on the publisher API.
    handler = fs_mod._build_create_file_handler(  # type: ignore[attr-defined]
        publisher=publisher,
        tool_context=fake_tool_context,
    )
    result = await handler(
        {
            "filename": "report.md",
            "content": "# hello",
            "format": "md",
        }
    )
    assert result is not None

    # Drain queue or assert publish call — both shapes are acceptable since
    # we monkey-patched EventPublisher.publish above.
    assert publish_mock.await_count >= 1
    frame_arg = publish_mock.await_args_list[0].args[0]
    assert "event: artifact_created" in frame_arg
    body_str = frame_arg.split("data: ", 1)[1].strip()
    body = json.loads(body_str)
    assert body == {
        "artifact_id": artifact_id,
        "filename": "report.md",
        "mime_type": "text/markdown",
        "size_bytes": 24,
        "format": "md",
    }


@pytest.mark.asyncio
async def test_create_file_does_not_emit_on_error(
    publisher: EventPublisher,
    fake_tool_context: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from pilot_space.ai.exceptions import FileGenerationError

    async def fake_create_file(**_: Any) -> Any:
        raise FileGenerationError("nope", code="EMPTY_FILE")

    monkeypatch.setattr(
        "pilot_space.ai.mcp.file_server.create_file",
        fake_create_file,
    )
    fake_container = MagicMock()
    fake_container.storage_client.return_value = MagicMock()
    monkeypatch.setattr(
        "pilot_space.container.container.get_container",
        lambda: fake_container,
    )

    publish_mock = AsyncMock()
    monkeypatch.setattr(EventPublisher, "publish", publish_mock)

    from pilot_space.ai.mcp import file_server as fs_mod

    handler = fs_mod._build_create_file_handler(  # type: ignore[attr-defined]
        publisher=publisher,
        tool_context=fake_tool_context,
    )
    result = await handler(
        {
            "filename": "x.md",
            "content": "",
            "format": "md",
        }
    )
    # Tool returns a structured error result, NOT raising.
    assert result is not None
    # No SSE frame on the error path — the SDK handles tool_result event
    # automatically.
    assert publish_mock.await_count == 0
