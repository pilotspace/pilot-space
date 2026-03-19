---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: Planned
stopped_at: Completed 35-01-PLAN.md
last_updated: "2026-03-19T22:39:38.398Z"
progress:
  total_phases: 6
  completed_phases: 3
  total_plans: 15
  completed_plans: 12
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-19)

**Core value:** Enterprise teams can adopt AI-augmented SDLC workflows without sacrificing data sovereignty, compliance, or human control.
**Current focus:** Phase 35 — MCP Server Catalog (planned, ready to execute)

## Current Position

Phase: 35 of 35 (MCP Server Catalog)
Plan: Planning complete — 35-01 and 35-02 created, not yet executed
Status: Planned

Next: Execute Phase 35 starting with 35-01 (wave 1 — backend data layer + API), then 35-02 (wave 2 — frontend UI).

## Wave Structure for Phase 35

| Wave | Plans | Parallelizable | Dependencies |
|------|-------|----------------|--------------|
| 1 | 35-01 (backend: migrations 095+096 + ORM + repository + GET /mcp-catalog + schema extensions + tests) | Solo | None |
| 2 | 35-02 (frontend: mcpCatalogApi + MCPCatalogStore + catalog card + tab content + MCPServersSettingsPage Tabs + checkpoint) | Solo | Depends on 35-01 endpoint contract |

Note: 35-02 depends on 35-01 for the endpoint URL (/api/v1/mcp-catalog), response shape (McpCatalogEntry), and WorkspaceMcpServerResponse new fields (catalog_entry_id, installed_catalog_version). Wave 2 runs after wave 1 is committed and tests pass.

## Milestone History

| Milestone | Phases | Plans | Requirements | Shipped |
|-----------|--------|-------|-------------|---------|
| v1.0 Enterprise | 1–11 | 46 | 30/30 | 2026-03-09 |
| v1.0-alpha Pre-Production Launch | 12–23 | 37 | 39/39 + 7 gap items | 2026-03-12 |
| v1.0.0-alpha2 Notion-Style Restructure | 24–29 | 14 | 17/17 | 2026-03-12 |
| v1.1.0 MCP Platform Hardening | 30–35 | TBD | 0/19 | In progress |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
- [Phase quick-04]: Skip SQLite-incompatible execute tests with @pytest.mark.skip and TEST_DATABASE_URL hint
- [Phase quick-04]: Remove sys.modules module-level mocks that leak across test session
- [quick-260317-bch]: pilotspace_agent.py excluded from pre-commit 700-line check (orchestrator file)
- [quick-260317-hms]: WorkspaceLLMConfig is frozen dataclass in provider_selector.py (colocation avoids circular imports)
- [Phase 31]: _validate_mcp_url extracted to infrastructure/ssrf.py to avoid AI-layer → API-layer circular import
- [31-04]: Enforcement check in lifespan mirrors jwt_provider_validated pattern; non-production bypassed to preserve dev key fallback behavior
- [31-04]: Tests use extracted helper function matching lifespan logic, patching pilot_space.config.get_settings for get_encryption_service() override
- [Phase 31]: MCP_SERVER_CAP = 10 at module level makes constant importable by tests; cap check placed before WorkspaceMcpServer construction
- [31-02]: Import alias `from ssrf import validate_mcp_url as _validate_mcp_url` means zero changes to existing field_validator call sites
- [31-02]: cast("McpServerConfig", {...}) used for TypedDict union assignment — ruff TC006 requires quoted type arg
- [Phase 32]: _refresh_oauth_token placed in workspace_mcp_servers.py (alongside _exchange_oauth_code) and lazy-imported in stream utils to avoid circular deps
- [Phase 32]: token_expires_at uses naive-datetime guard (replace(tzinfo=UTC)) in _load_remote_mcp_servers for SQLite test compatibility
- [Phase 32]: refresh_token_encrypted is never echoed in WorkspaceMcpServerResponse — only token_expires_at is exposed to the frontend
- [32-01]: encrypt_api_key moved to module-level import in workspace_mcp_servers.py so tests can patch workspace_mcp_servers.encrypt_api_key directly
- [32-01]: _exchange_oauth_code returns None (not partial tuple) when access_token absent — preserves None sentinel for the error redirect path
- [32-03]: ExpiryBadge co-located in mcp-server-card.tsx (not a separate file) — follows existing AuthTypeBadge/StatusBadge pattern in same file
- [32-03]: Backend token_expires_at was already present from 32-01; Task 1 became verification-only
- [Phase 32]: _refresh_oauth_token extracted to _mcp_server_oauth_helpers.py — workspace_mcp_servers.py hit 690-line threshold
- [Phase 32]: Lazy import of _refresh_oauth_token inside _load_remote_mcp_servers avoids circular imports
- [33-01]: VARCHAR(16) + CHECK constraint used for approval_mode instead of DB enum — avoids Alembic enum migration complexity
- [33-01]: logger.info removed from PATCH /approval-mode handler to stay within 700-line pre-commit limit
- [33-01]: McpApprovalMode StrEnum placed in ORM model file (not approval.py) to keep column-level enums co-located with their model
- [Phase 33]: workspace_mcp_servers.py is at ~670 lines — PATCH /approval-mode endpoint must stay lean or extract to helper; check line count before writing
- [Phase 33]: can_use_tool callback uses lazy imports inside _handle_remote_mcp_approval to avoid circular imports (same pattern as existing lazy imports in question_adapter.py)
- [Phase 33]: MCPServerCard is NOT an observer — approval mode toggle uses onUpdateApprovalMode prop pattern, parent mcp-servers-settings-page.tsx (observer) owns the store call
- [Phase 33]: Server key format for approval map uses UUID from _load_remote_mcp_servers (remote_{id}), not display_name normalization
- [Phase 33]: approval_mode optional on MCPServer for backwards compat; Switch in server info column not actions column; MCPA-03 uses InlineApprovalCard GenericJSON fallback (no new component)
- [Phase 34]: mcp_usage.py new router registered under ai.py (include_router) so endpoint is at /api/v1/ai/mcp-usage — no main.py change needed
- [Phase 34]: display_name resolved at query time via LEFT JOIN workspace_mcp_servers (not stored at log time) — avoids async DB call in streaming hook
- [Phase 34]: func.json_extract_path_text used for JSONB GROUP BY (portable: works with both PostgreSQL and SQLite test DB)
- [Phase 34]: migration 094 adds partial index WHERE action='ai.mcp_tool_call' for dashboard query performance
- [Phase 34]: input_hash stored as full 64-char SHA-256 hex (not truncated prefix) in payload JSONB
- [34-02]: server_name (not server_key) used as chart label — display names over raw remote_<uuid> keys
- [34-02]: Compound label format "server_name: tool_name" used on Y-axis to distinguish tools across servers
- [Phase 35]: mcp_catalog_entries is a global table (BaseModel, not WorkspaceScopedModel) — no workspace_id, no RLS needed
- [Phase 35]: mcp_catalog router registered directly in main.py at /api/v1/mcp-catalog (not under ai.py) — catalog is not AI-specific
- [Phase 35]: Use create_type=False for McpTransportType and McpAuthType enum columns in migration 095 — types already exist from migrations 091/093
- [Phase 35]: Update badge (amber "Update Available") shown on MCPCatalogCard in Catalog tab only — not on mcp-server-card.tsx; avoids passing catalog entries into the server list component
- [Phase 35]: Version comparison is simple string inequality (installed_catalog_version !== catalog_version) — no semver parsing for MVP
- [Phase 35]: MCPCatalogCard is a plain component (not observer) — mirrors MCPServerCard pattern from Phase 33
- [Phase 35]: Global mcp_catalog_entries table (BaseModel, no workspace_id) — catalog is identical for all workspaces, no RLS needed
- [Phase 35]: MCP catalog seeded in migration 095 (static data — Context7 bearer/http + GitHub oauth2/http)

### Pending Todos

None.

### Blockers/Concerns

- MEDIUM confidence: `can_use_tool` SDK callback may not fire for native MCP tool calls. RESEARCH.md flags this as the key integration risk (Pitfall 2). Plan 33-02 Task 1 includes unit tests that mock the callback path, but a live integration test post-execution is recommended before shipping.

## Session Continuity

Last session: 2026-03-19T22:39:38.396Z
Stopped at: Completed 35-01-PLAN.md
Resume file: None
Next action: /gsd:execute-phase 35 (execute 35-01 then 35-02)
