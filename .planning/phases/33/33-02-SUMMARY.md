---
phase: 33-remote-mcp-approval
plan: 02
subsystem: ai.sdk / ai.agents
tags: [mcp, approval, dd-003, can_use_tool, remote-mcp]
dependency_graph:
  requires: [33-01]
  provides: [remote-mcp-approval-callback, _build_stream_config-approval-wiring]
  affects: [pilotspace_agent, question_adapter, approval_waiter, approval_service]
tech_stack:
  added: []
  patterns: [lazy-import, DD-003-approval-flow, can_use_tool-callback-extension]
key_files:
  created: []
  modified:
    - backend/src/pilot_space/ai/sdk/question_adapter.py
    - backend/src/pilot_space/ai/agents/pilotspace_agent.py
    - backend/tests/unit/ai/sdk/test_question_adapter.py
decisions:
  - "Lazy imports inside _handle_remote_mcp_approval to avoid circular dependencies (matches existing pattern)"
  - "Server key format matches _load_remote_mcp_servers: f'remote_{server.id}' (UUID-based, not display_name)"
  - "Filter approval map to only servers that passed load guards (health, SSRF, auth) using 'if key in remote_servers'"
  - "File size limit (700 lines) required docstring trimming; function kept at 689 lines"
metrics:
  duration: "~25 minutes"
  completed: "2026-03-19"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 3
---

# Phase 33 Plan 02: Remote MCP Approval Callback Wiring Summary

Extended `create_can_use_tool_callback` with per-server DD-003 approval enforcement and wired `_build_stream_config` to pass the approval map at session startup.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend create_can_use_tool_callback + _handle_remote_mcp_approval | 1f6f9b92 | question_adapter.py, test_question_adapter.py |
| 2 | Wire remote_server_approval_map in _build_stream_config | 1f6f9b92 | pilotspace_agent.py |

## What Was Built

**`_handle_remote_mcp_approval`** (new module-level async function in `question_adapter.py`):
- Opens a fresh `get_db_session()` context
- Calls `ApprovalService.create_approval_request` with `ActionType.REMOTE_MCP_TOOL`
- Emits `approval_request` SSE event via `build_approval_sse_event` → `tool_event_queue`
- Blocks on `wait_for_approval(approval_id)` (polls DB every 2s, 5-min timeout)
- Returns `PermissionResultAllow` on "approved", `PermissionResultDeny` otherwise

**`create_can_use_tool_callback`** (extended signature):
- New optional params: `workspace_id: UUID | None = None`, `remote_server_approval_map: dict[str, tuple[str, str, UUID]] | None = None`
- Existing callers with `(queue, user_id)` continue to work unchanged (safe defaults)
- Detection: `tool_name.startswith("mcp__")` + `split("__", 2)` → extracts `server_key` + `bare_tool`
- Lookup in map: if `require_approval` and `workspace_id` not None → calls `_handle_remote_mcp_approval`
- Otherwise: `PermissionResultAllow` immediately

**`_build_stream_config`** (updated in `pilotspace_agent.py`):
- After `_load_remote_mcp_servers`, queries `WorkspaceMcpServerRepository.get_active_by_workspace`
- Builds `remote_server_approval_map = {f"remote_{s.id}": (s.approval_mode, s.display_name, s.id) for s in orm_servers if key in remote_servers}`
- Filters to only servers that passed `_load_remote_mcp_servers` guards (health/SSRF/auth)
- Passes `workspace_id=context.workspace_id` and `remote_server_approval_map` to `create_can_use_tool_callback`

## Unit Tests Added (5 new, all passing)

| Test | Scenario | Result |
|------|----------|--------|
| `test_remote_mcp_auto_approve` | Server in map with auto_approve | Allow; no DB call |
| `test_remote_mcp_require_approval_approved` | Server requires approval; wait returns "approved" | Allow |
| `test_remote_mcp_require_approval_rejected` | Server requires approval; wait returns "rejected" | Deny("rejected") |
| `test_non_mcp_tool_passthrough` | Local tool name with approval map present | Allow; no SSE |
| `test_remote_mcp_no_approval_map` | mcp__ tool, map=None | Allow (safe default) |

Total test run: 39 passed (34 pre-existing + 5 new).

## Deviations from Plan

**[Rule 1 - Bug] Fixed redundant `None` check for non-optional UUID**

- **Found during:** Task 2, pyright check
- **Issue:** `if context.workspace_id is not None` — pyright reported "condition always True" since `AgentContext.workspace_id: UUID` (non-optional)
- **Fix:** Simplified to `if remote_servers:` (only build map when servers exist)
- **Files modified:** `pilotspace_agent.py`
- **Commit:** 1f6f9b92

**[Rule 3 - Blocking] File size limit (700 lines) exceeded**

- **Found during:** Pre-commit hook
- **Issue:** `question_adapter.py` reached 722 lines after additions
- **Fix:** Trimmed docstrings in `_handle_remote_mcp_approval` and `create_can_use_tool_callback`; consolidated two logger.info calls into one; final count 689 lines
- **Files modified:** `question_adapter.py`
- **Commit:** 1f6f9b92

## Self-Check: PASSED

Files exist:
- `backend/src/pilot_space/ai/sdk/question_adapter.py` — FOUND (689 lines)
- `backend/src/pilot_space/ai/agents/pilotspace_agent.py` — FOUND
- `backend/tests/unit/ai/sdk/test_question_adapter.py` — FOUND

Commit exists: 1f6f9b92 — FOUND
