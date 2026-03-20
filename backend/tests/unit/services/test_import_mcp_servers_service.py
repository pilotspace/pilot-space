"""Unit tests for ImportMcpServersService (T035).

Tests:
- Parse Claude Desktop format
- Parse VS Code / Cursor format
- Skip duplicate names
- Reject invalid SSRF URL
- Reject shell metacharacter in command
- Return correct imported/skipped/errors split
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from pilot_space.application.services.mcp.import_mcp_servers_service import (
    ImportMcpServersService,
    ParsedMcpServer,
)
from pilot_space.infrastructure.database.models.workspace_mcp_server import (
    McpServerType,
    McpStatus,
    McpTransport,
)


class TestParseConfigJson:
    """Tests for ImportMcpServersService.parse_config_json."""

    def test_parse_claude_format(self) -> None:
        """Parses Claude Desktop JSON config format correctly."""
        config = """{
            "mcpServers": {
                "my-remote": {
                    "url": "https://mcp.example.com/sse",
                    "transport": "sse"
                },
                "my-npx": {
                    "command": "npx",
                    "args": ["-y", "@my-pkg/mcp-server"]
                }
            }
        }"""
        result = ImportMcpServersService.parse_config_json(config)
        assert len(result) == 2

        remote = next(r for r in result if r.name == "my-remote")
        assert remote.server_type == McpServerType.REMOTE
        assert remote.url_or_command == "https://mcp.example.com/sse"
        assert remote.transport == McpTransport.SSE

        npx = next(r for r in result if r.name == "my-npx")
        assert npx.server_type == McpServerType.NPX
        assert npx.url_or_command.startswith("npx")
        assert "@my-pkg/mcp-server" in npx.url_or_command
        assert npx.transport == McpTransport.STDIO

    def test_parse_vscode_format(self) -> None:
        """Parses VS Code / Cursor MCP config format."""
        config = """{
            "mcpServers": {
                "uvx-server": {
                    "command": "uvx",
                    "args": ["my-mcp-tool"],
                    "env": {"API_KEY": "secret-value"}
                }
            }
        }"""
        result = ImportMcpServersService.parse_config_json(config)
        assert len(result) == 1
        entry = result[0]
        assert entry.name == "uvx-server"
        assert entry.server_type == McpServerType.UVX
        assert "my-mcp-tool" in entry.url_or_command
        assert entry.env_vars == {"API_KEY": "secret-value"}

    def test_parse_streamable_http_transport(self) -> None:
        """Recognises streamable_http transport."""
        config = """{
            "mcpServers": {
                "http-server": {
                    "url": "https://mcp.example.com/http",
                    "transport": "streamable_http"
                }
            }
        }"""
        result = ImportMcpServersService.parse_config_json(config)
        assert len(result) == 1
        assert result[0].transport == McpTransport.STREAMABLE_HTTP

    def test_invalid_json_raises(self) -> None:
        """Malformed JSON raises ValueError."""
        with pytest.raises(ValueError, match="Invalid JSON"):
            ImportMcpServersService.parse_config_json("{ invalid json }")

    def test_missing_mcp_servers_key_returns_empty(self) -> None:
        """Missing 'mcpServers' key returns empty list (no error)."""
        result = ImportMcpServersService.parse_config_json('{"other": "data"}')
        assert result == []

    def test_empty_mcp_servers(self) -> None:
        """Empty mcpServers object returns empty list."""
        result = ImportMcpServersService.parse_config_json('{"mcpServers": {}}')
        assert result == []


class TestImportServers:
    """Tests for ImportMcpServersService.import_servers."""

    def _make_repo(self, existing_names: list[str]) -> AsyncMock:
        """Create a mock repository with pre-existing server names."""
        repo = AsyncMock()

        existing_servers = []
        for name in existing_names:
            mock_server = MagicMock()
            mock_server.display_name = name
            existing_servers.append(mock_server)

        repo.get_active_by_workspace = AsyncMock(return_value=existing_servers)

        created_ids = []

        async def fake_create(server: Any) -> Any:
            server.id = uuid4()
            created_ids.append(server.id)
            return server

        repo.create = AsyncMock(side_effect=fake_create)
        return repo

    @pytest.mark.asyncio
    async def test_import_new_servers(self) -> None:
        """Successfully imports servers that don't already exist."""
        parsed = [
            ParsedMcpServer(
                name="new-server",
                server_type=McpServerType.REMOTE,
                transport=McpTransport.SSE,
                url_or_command="https://mcp.example.com/sse",
            )
        ]
        repo = self._make_repo([])
        workspace_id = uuid4()

        result = await ImportMcpServersService.import_servers(
            workspace_id=workspace_id,
            parsed=parsed,
            repo=repo,
        )

        assert len(result.imported) == 1
        assert result.imported[0].name == "new-server"
        assert len(result.skipped) == 0
        assert len(result.errors) == 0

    @pytest.mark.asyncio
    async def test_skip_duplicate_name(self) -> None:
        """Skips servers whose display_name already exists in workspace."""
        parsed = [
            ParsedMcpServer(
                name="Existing Server",
                server_type=McpServerType.REMOTE,
                transport=McpTransport.SSE,
                url_or_command="https://new-url.example.com/sse",
            )
        ]
        repo = self._make_repo(["existing server"])  # same after .lower()
        workspace_id = uuid4()

        result = await ImportMcpServersService.import_servers(
            workspace_id=workspace_id,
            parsed=parsed,
            repo=repo,
        )

        assert len(result.imported) == 0
        assert len(result.skipped) == 1
        assert result.skipped[0].name == "Existing Server"
        assert result.skipped[0].reason == "name_conflict"

    @pytest.mark.asyncio
    async def test_reject_http_url(self) -> None:
        """Rejects remote server with HTTP (not HTTPS) URL."""
        parsed = [
            ParsedMcpServer(
                name="insecure-server",
                server_type=McpServerType.REMOTE,
                transport=McpTransport.SSE,
                url_or_command="http://mcp.example.com/sse",  # HTTP not HTTPS
            )
        ]
        repo = self._make_repo([])
        workspace_id = uuid4()

        result = await ImportMcpServersService.import_servers(
            workspace_id=workspace_id,
            parsed=parsed,
            repo=repo,
        )

        assert len(result.imported) == 0
        assert len(result.errors) == 1
        assert "invalid_url" in result.errors[0].reason

    @pytest.mark.asyncio
    async def test_reject_shell_metachar_in_command(self) -> None:
        """Rejects NPX command with shell metacharacters."""
        parsed = [
            ParsedMcpServer(
                name="bad-server",
                server_type=McpServerType.NPX,
                transport=McpTransport.STDIO,
                url_or_command="npx my-pkg; rm -rf /",
            )
        ]
        repo = self._make_repo([])
        workspace_id = uuid4()

        result = await ImportMcpServersService.import_servers(
            workspace_id=workspace_id,
            parsed=parsed,
            repo=repo,
        )

        assert len(result.imported) == 0
        assert len(result.errors) == 1
        assert "metacharacter" in result.errors[0].reason

    @pytest.mark.asyncio
    async def test_mixed_import_result(self) -> None:
        """Returns correct split for mixed imported / skipped / errored."""
        parsed = [
            ParsedMcpServer(
                name="good-server",
                server_type=McpServerType.REMOTE,
                transport=McpTransport.SSE,
                url_or_command="https://good.example.com/sse",
            ),
            ParsedMcpServer(
                name="duplicate",
                server_type=McpServerType.REMOTE,
                transport=McpTransport.SSE,
                url_or_command="https://other.example.com/sse",
            ),
            ParsedMcpServer(
                name="bad",
                server_type=McpServerType.REMOTE,
                transport=McpTransport.SSE,
                url_or_command="http://insecure.example.com",
            ),
        ]
        repo = self._make_repo(["duplicate"])
        workspace_id = uuid4()

        result = await ImportMcpServersService.import_servers(
            workspace_id=workspace_id,
            parsed=parsed,
            repo=repo,
        )

        assert len(result.imported) == 1
        assert result.imported[0].name == "good-server"
        assert len(result.skipped) == 1
        assert result.skipped[0].name == "duplicate"
        assert len(result.errors) == 1
        assert result.errors[0].name == "bad"
