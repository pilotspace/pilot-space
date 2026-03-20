"""Pydantic schemas and SSRF validation for workspace MCP server endpoints.

Extracted from workspace_mcp_servers.py to stay within the 700-line limit.

Extended in Phase 25 to support:
- McpServerType / McpTransport / McpStatus type enums
- WorkspaceMcpServerUpdate (partial PATCH)
- Extended WorkspaceMcpServerCreate with new fields
- WorkspaceMcpServerResponse with boolean secret presence flags
- Command injection validation for NPX/UVX url_or_command values
- Bulk import request/response schemas
- Connection test response schema
"""

from __future__ import annotations

import ipaddress
import re
import socket
import urllib.parse
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from pilot_space.infrastructure.database.models.workspace_mcp_server import (
    McpAuthType,
    McpServerType,
    McpStatus,
    McpTransport,
)

# ---------------------------------------------------------------------------
# Private IP / SSRF blocklist for URL validation (SEC-H3)
# ---------------------------------------------------------------------------

WORKSPACE_SLUG_RE = re.compile(r"^[a-z0-9-]+$")

# Shell metacharacters disallowed in NPX/UVX commands (command injection prevention)
_SHELL_METACHAR_RE = re.compile(r"[;&|$`(){}<>]")

# Relaxed variant for command_args: allows $ for env var references ($VAR_NAME syntax)
# Still blocks shell chaining/redirection/subshell metacharacters
_SHELL_METACHAR_ARGS_RE = re.compile(r"[;&|`(){}<>]")

# Private, loopback, link-local and cloud-metadata CIDR ranges to block
_BLOCKED_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),  # RFC 1918
    ipaddress.ip_network("172.16.0.0/12"),  # RFC 1918
    ipaddress.ip_network("192.168.0.0/16"),  # RFC 1918
    ipaddress.ip_network("127.0.0.0/8"),  # Loopback
    ipaddress.ip_network("169.254.0.0/16"),  # Link-local / AWS metadata
    ipaddress.ip_network("100.64.0.0/10"),  # Shared address space (RFC 6598)
    ipaddress.ip_network("::1/128"),  # IPv6 loopback
    ipaddress.ip_network("fc00::/7"),  # IPv6 unique local
    ipaddress.ip_network("fe80::/10"),  # IPv6 link-local
]


def _validate_mcp_url(url: str) -> str:
    """Validate MCP server URL to prevent SSRF attacks.

    Enforces:
    - HTTPS scheme only
    - Hostname must not resolve to private/loopback/link-local/metadata IPs

    Note: Hostname resolution happens at validation time via getaddrinfo.
    The runtime probe uses follow_redirects=False to prevent redirect-based bypass.

    Args:
        url: URL string to validate.

    Returns:
        The validated URL string.

    Raises:
        ValueError: If the URL fails any validation check.
    """
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https":
        raise ValueError("MCP server URL must use HTTPS")
    hostname = parsed.hostname
    if not hostname:
        raise ValueError("MCP server URL must have a valid hostname")

    # Resolve hostname to IP addresses and check against blocked ranges
    try:
        addr_infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        # If hostname cannot be resolved at validation time, allow it through;
        # the runtime probe will fail safely with follow_redirects=False.
        return url

    for addr_info in addr_infos:
        ip_str = addr_info[4][0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            continue
        for blocked in _BLOCKED_NETWORKS:
            if ip in blocked:
                raise ValueError(
                    f"MCP server URL resolves to a private or restricted IP address: {ip_str}"
                )

    return url


def _validate_npx_uvx_command(command: str, server_type: McpServerType) -> str:
    """Validate NPX or UVX command to prevent command injection.

    Enforces:
    - Must not be empty.
    - Must not contain shell metacharacters: ; & | $ ` ( ) { } < >

    Args:
        command: The url_or_command string for a Command-type server.
        server_type: McpServerType.NPX or McpServerType.UVX.

    Returns:
        The validated command string.

    Raises:
        ValueError: If the command fails any validation check.
    """
    if not command.strip():
        raise ValueError("Command must not be empty")
    if _SHELL_METACHAR_RE.search(command):
        raise ValueError(
            f"Command for {server_type.value} server contains disallowed shell metacharacters"
        )
    return command


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class WorkspaceMcpServerCreate(BaseModel):
    """Request body for registering a new MCP server.

    Supports all three server types (remote, npx, uvx) with appropriate
    validation rules for each type.
    """

    display_name: str = Field(..., max_length=128, description="Human-readable label")

    # Legacy field — kept for backward compat; url_or_command takes precedence
    url: str | None = Field(
        default=None,
        max_length=512,
        description="Legacy remote URL field (use url_or_command instead)",
    )

    # Phase 25 primary fields
    server_type: McpServerType = Field(
        default=McpServerType.REMOTE,
        description="Server type: remote, npx, or uvx",
    )
    transport: McpTransport = Field(
        default=McpTransport.SSE,
        description="Transport protocol: sse, stdio, or streamable_http",
    )
    url_or_command: str | None = Field(
        default=None,
        max_length=1024,
        description="HTTPS URL for remote, or launch command for NPX/UVX",
    )
    command_args: str | None = Field(
        default=None,
        max_length=512,
        description="Extra CLI arguments for NPX/UVX launch (npx/uvx only)",
    )
    headers: dict[str, str] | None = Field(
        default=None,
        description="HTTP headers to inject (will be encrypted at rest)",
    )
    env_vars: dict[str, str] | None = Field(
        default=None,
        description="Environment variables for NPX/UVX launch (will be encrypted at rest)",
    )

    # Auth fields
    auth_type: McpAuthType = Field(default=McpAuthType.NONE)
    auth_token: str | None = Field(
        default=None, description="Bearer token (will be encrypted at rest)"
    )
    oauth_client_id: str | None = Field(default=None, max_length=256)
    oauth_auth_url: str | None = Field(default=None, max_length=512)
    oauth_token_url: str | None = Field(default=None, max_length=512)
    oauth_scopes: str | None = Field(default=None, max_length=512)

    @model_validator(mode="after")
    def validate_url_or_command(self) -> WorkspaceMcpServerCreate:
        """Ensure url_or_command is set, defaulting from url for backward compat.

        Also validates URL/command format based on server_type.
        """
        # Resolve effective url_or_command
        effective = self.url_or_command or self.url
        if not effective:
            raise ValueError("url_or_command is required")

        if self.server_type == McpServerType.REMOTE:
            _validate_mcp_url(effective)
        elif self.server_type in (McpServerType.NPX, McpServerType.UVX):
            _validate_npx_uvx_command(effective, self.server_type)

        # Always populate url_or_command so downstream code has one source of truth
        self.url_or_command = effective
        # Keep url in sync for backward compat with AI agent hot-loader
        self.url = effective[:512]  # truncate to url column length

        return self

    @field_validator("oauth_auth_url", "oauth_token_url")
    @classmethod
    def validate_oauth_urls(cls, v: str | None) -> str | None:
        """Validate OAuth URLs against SSRF blocklist."""
        if v is None:
            return v
        return _validate_mcp_url(v)

    @field_validator("command_args")
    @classmethod
    def validate_command_args(cls, v: str | None) -> str | None:
        """Validate command_args for shell metacharacters.

        $ is permitted to allow $VAR_NAME env var references (e.g. --api-key $API_KEY).
        Shell chaining operators (;, &, |) and subshell/redirect chars remain blocked.
        """
        if v is not None and _SHELL_METACHAR_ARGS_RE.search(v):
            raise ValueError("command_args contains disallowed shell metacharacters")
        return v

    @field_validator("headers")
    @classmethod
    def validate_headers(cls, v: dict[str, str] | None) -> dict[str, str] | None:
        """Validate header keys are valid HTTP header name format."""
        if v is None:
            return v
        if len(v) > 10:
            raise ValueError("Maximum 10 HTTP headers allowed")
        header_key_re = re.compile(r"^[a-zA-Z0-9-]+$")
        for key in v:
            if not header_key_re.match(key):
                raise ValueError(
                    f"Invalid HTTP header name: {key!r} "
                    "(must contain only alphanumeric characters and hyphens)"
                )
        return v

    @field_validator("env_vars")
    @classmethod
    def validate_env_vars(cls, v: dict[str, str] | None) -> dict[str, str] | None:
        """Validate env var keys follow POSIX naming convention."""
        if v is None:
            return v
        if len(v) > 20:
            raise ValueError("Maximum 20 environment variables allowed")
        env_key_re = re.compile(r"^[A-Z_][A-Z0-9_]*$")
        for key in v:
            if not env_key_re.match(key):
                raise ValueError(
                    f"Invalid env var name: {key!r} "
                    "(must match [A-Z_][A-Z0-9_]*)"
                )
        return v


class WorkspaceMcpServerUpdate(BaseModel):
    """Request body for partial PATCH update of an MCP server.

    All fields are optional. Fields not included in the request are left
    unchanged. For secret fields (auth_token, headers, env_vars), omitting
    the field preserves the existing encrypted value.
    """

    display_name: str | None = Field(default=None, max_length=128)
    server_type: McpServerType | None = Field(default=None)
    transport: McpTransport | None = Field(default=None)
    url_or_command: str | None = Field(default=None, max_length=1024)
    command_args: str | None = Field(default=None, max_length=512)
    auth_type: McpAuthType | None = Field(default=None)

    # Secret fields: only update if non-None and non-empty
    auth_token: str | None = Field(default=None)
    headers: dict[str, str] | None = Field(default=None)
    env_vars: dict[str, str] | None = Field(default=None)

    # OAuth
    oauth_client_id: str | None = Field(default=None, max_length=256)
    oauth_auth_url: str | None = Field(default=None, max_length=512)
    oauth_token_url: str | None = Field(default=None, max_length=512)
    oauth_scopes: str | None = Field(default=None, max_length=512)

    @field_validator("command_args")
    @classmethod
    def validate_command_args(cls, v: str | None) -> str | None:
        """Validate command_args for shell metacharacters.

        $ is permitted to allow $VAR_NAME env var references (e.g. --api-key $API_KEY).
        Shell chaining operators (;, &, |) and subshell/redirect chars remain blocked.
        """
        if v is not None and _SHELL_METACHAR_ARGS_RE.search(v):
            raise ValueError("command_args contains disallowed shell metacharacters")
        return v

    @field_validator("headers")
    @classmethod
    def validate_headers(cls, v: dict[str, str] | None) -> dict[str, str] | None:
        """Validate header keys are valid HTTP header name format."""
        if v is None:
            return v
        if len(v) > 10:
            raise ValueError("Maximum 10 HTTP headers allowed")
        header_key_re = re.compile(r"^[a-zA-Z0-9-]+$")
        for key in v:
            if not header_key_re.match(key):
                raise ValueError(f"Invalid HTTP header name: {key!r}")
        return v

    @field_validator("env_vars")
    @classmethod
    def validate_env_vars(cls, v: dict[str, str] | None) -> dict[str, str] | None:
        """Validate env var keys follow POSIX naming convention."""
        if v is None:
            return v
        if len(v) > 20:
            raise ValueError("Maximum 20 environment variables allowed")
        env_key_re = re.compile(r"^[A-Z_][A-Z0-9_]*$")
        for key in v:
            if not env_key_re.match(key):
                raise ValueError(f"Invalid env var name: {key!r}")
        return v


class WorkspaceMcpServerResponse(BaseModel):
    """Response for a single MCP server.

    Secrets (auth_token_encrypted, env_vars_encrypted) are NEVER returned.
    Headers are stored as plaintext and returned in full.
    Env var keys (without values) are returned for edit form display.
    """

    id: UUID
    workspace_id: UUID
    display_name: str

    # Phase 25 fields
    server_type: McpServerType
    transport: McpTransport
    url_or_command: str | None
    command_args: str | None = None
    is_enabled: bool

    # Legacy field for backward compat
    url: str

    auth_type: McpAuthType

    # Boolean presence flags — raw secrets are NEVER returned
    has_auth_secret: bool = False
    has_headers_secret: bool = False
    has_env_secret: bool = False

    # Headers are NOT secret — returned in full for editing
    headers: dict[str, str] | None = None

    # Env var keys only (values are secret and never returned)
    env_var_keys: list[str] | None = None

    # OAuth metadata (read-only)
    oauth_client_id: str | None = None
    oauth_auth_url: str | None = None
    oauth_scopes: str | None = None

    last_status: McpStatus | None = None
    last_status_checked_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_model(
        cls, server: object
    ) -> WorkspaceMcpServerResponse:
        """Build response from ORM model, populating secret flags and visible data.

        Headers are returned in full (plaintext). Env var keys are extracted
        from the encrypted blob (values are never returned).
        """
        from pilot_space.infrastructure.database.models.workspace_mcp_server import (
            WorkspaceMcpServer as OrmModel,
        )

        assert isinstance(server, OrmModel)

        # Determine url_or_command — fallback to url for legacy rows
        uoc = server.url_or_command or server.url

        # Resolve headers — prefer headers_json, fallback to decrypting headers_encrypted
        headers_data: dict[str, str] | None = None
        if server.headers_json:
            import json

            try:
                headers_data = json.loads(server.headers_json)
            except (json.JSONDecodeError, TypeError):
                headers_data = None
        elif server.headers_encrypted:
            try:
                from pilot_space.infrastructure.encryption_kv import decrypt_kv

                headers_data = decrypt_kv(server.headers_encrypted)
            except Exception:
                headers_data = None

        # Extract env var keys (never values)
        env_keys: list[str] | None = None
        if server.env_vars_encrypted:
            try:
                from pilot_space.infrastructure.encryption_kv import decrypt_kv

                env_data = decrypt_kv(server.env_vars_encrypted)
                env_keys = sorted(env_data.keys())
            except Exception:
                env_keys = None

        return cls(
            id=server.id,
            workspace_id=server.workspace_id,
            display_name=server.display_name,
            server_type=server.server_type,
            transport=server.transport,
            url_or_command=uoc,
            command_args=server.command_args,
            is_enabled=server.is_enabled,
            url=server.url,
            auth_type=server.auth_type,
            has_auth_secret=bool(server.auth_token_encrypted),
            has_headers_secret=bool(server.headers_encrypted or server.headers_json),
            has_env_secret=bool(server.env_vars_encrypted),
            headers=headers_data,
            env_var_keys=env_keys,
            oauth_client_id=server.oauth_client_id,
            oauth_auth_url=server.oauth_auth_url,
            oauth_scopes=server.oauth_scopes,
            last_status=server.last_status,
            last_status_checked_at=server.last_status_checked_at,
            created_at=server.created_at,
        )

    @classmethod
    def model_validate(  # type: ignore[override]
        cls, obj: object, *args: object, **kwargs: object
    ) -> WorkspaceMcpServerResponse:
        """Override model_validate to use from_orm_model when obj is an ORM instance.

        Falls back to Pydantic's default model_validate for dict inputs.
        """
        from pilot_space.infrastructure.database.models.workspace_mcp_server import (
            WorkspaceMcpServer as OrmModel,
        )

        if isinstance(obj, OrmModel):
            return cls.from_orm_model(obj)
        return super().model_validate(obj, *args, **kwargs)


class WorkspaceMcpServerListResponse(BaseModel):
    """List response for workspace MCP servers."""

    items: list[WorkspaceMcpServerResponse]
    total: int


class McpServerStatusResponse(BaseModel):
    """Status probe result for an MCP server (legacy endpoint)."""

    server_id: UUID
    status: str  # "connected" | "failed" | "unknown"
    checked_at: datetime


class McpServerTestResponse(BaseModel):
    """Connection test result for an MCP server (Phase 25 test endpoint)."""

    server_id: UUID
    status: McpStatus
    latency_ms: int | None = None
    checked_at: datetime
    error_detail: str | None = None


class McpOAuthUrlResponse(BaseModel):
    """OAuth authorization URL for MCP server OAuth flow."""

    auth_url: str
    state: str


# ---------------------------------------------------------------------------
# Bulk import schemas
# ---------------------------------------------------------------------------


class ImportMcpServersRequest(BaseModel):
    """Request body for bulk MCP server import."""

    config_json: str = Field(..., description="Raw JSON config string in Claude/Cursor/VS Code format")


class ImportedServerEntry(BaseModel):
    """A successfully imported server entry in the import response."""

    name: str
    id: UUID


class SkippedServerEntry(BaseModel):
    """A skipped server entry in the import response."""

    name: str
    reason: str


class ErrorServerEntry(BaseModel):
    """An errored server entry in the import response."""

    name: str
    reason: str


class ImportMcpServersResponse(BaseModel):
    """Response for bulk MCP server import."""

    imported: list[ImportedServerEntry]
    skipped: list[SkippedServerEntry]
    errors: list[ErrorServerEntry]
