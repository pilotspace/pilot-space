---
phase: 31-mcp-infra-hardening
plan: 02
subsystem: backend/mcp
tags: [mcp, ssrf, security, transport, tests]
dependency_graph:
  requires: [31-01]
  provides: [validate_mcp_url, ssrf.py, _load_remote_mcp_servers hardening]
  affects: [_mcp_server_schemas.py, pilotspace_stream_utils.py]
tech_stack:
  added: [infrastructure/ssrf.py]
  patterns: [SSRF validation re-used via import alias, lazy imports with validate_mcp_url inside function, cast() for TypedDict union assignment]
key_files:
  created:
    - backend/src/pilot_space/infrastructure/ssrf.py
  modified:
    - backend/src/pilot_space/api/v1/routers/_mcp_server_schemas.py
    - backend/src/pilot_space/ai/agents/pilotspace_stream_utils.py
    - backend/tests/unit/ai/agents/test_pilotspace_stream_utils.py
decisions:
  - "Import alias `from ssrf import validate_mcp_url as _validate_mcp_url` means zero changes to existing field_validator call sites in _mcp_server_schemas.py"
  - "validate_mcp_url is a lazy import inside _load_remote_mcp_servers to avoid circular deps and allow patching at pilot_space.infrastructure.ssrf.validate_mcp_url in tests"
  - "cast('McpServerConfig', {...}) used for TypedDict union assignment — ruff TC006 requires quoted type arg"
  - "MCPI-03 guard placed first (cheapest check), MCPI-05 SSRF guard second, decrypt third — fail-fast ordering"
metrics:
  duration: "15 minutes"
  completed: "2026-03-20"
  tasks_completed: 2
  files_changed: 4
requirements:
  - MCPI-02
  - MCPI-03
  - MCPI-05
---

# Phase 31 Plan 02: SSRF Extraction and Session Load Hardening Summary

**One-liner:** Extracted SSRF validation to `infrastructure/ssrf.py` and hardened `_load_remote_mcp_servers` with health-check gating (MCPI-03), DNS re-validation (MCPI-05), and HTTP/SSE transport branching (MCPI-02).

## What Was Built

### Task 1: Extract SSRF logic to infrastructure/ssrf.py
Moved `_BLOCKED_NETWORKS` and `_validate_mcp_url` verbatim from `_mcp_server_schemas.py` to a new shared `infrastructure/ssrf.py` utility module. The function is renamed `validate_mcp_url` (public). `_mcp_server_schemas.py` now imports it via alias `from pilot_space.infrastructure.ssrf import validate_mcp_url as _validate_mcp_url` — all existing `field_validator` call sites are unchanged.

Removed the now-redundant `ipaddress`, `socket`, and `urllib.parse` imports from `_mcp_server_schemas.py`.

### Task 2: Harden _load_remote_mcp_servers with MCPI-02/03/05 guards + tests
Replaced the single-path for-loop body with three guards:

1. **MCPI-03 health-check gate**: `if server.last_status == "failed": continue` — servers that failed their last health probe are silently skipped with an INFO log. Prevents session load from connecting to known-broken servers.

2. **MCPI-05 DNS rebinding guard**: `validate_mcp_url(server.url)` called at connect time with `try/except ValueError → continue`. Re-validating at connect time catches DNS rebinding attacks where an IP was valid at registration but has since changed to a private range.

3. **MCPI-02 transport branching**: `server.transport_type == McpTransportType.HTTP` selects `{"type": "http", ...}` vs `{"type": "sse", ...}` config. Uses `cast("McpServerConfig", {...})` for TypedDict union assignment (pyright + ruff TC006 clean).

Added 5 new unit tests (TDD):
- `test_failed_server_skipped` — MCPI-03 guard
- `test_ssrf_blocked_at_connect` — MCPI-05 guard
- `test_http_transport_config` — MCPI-02 HTTP branch
- `test_sse_transport_config` — MCPI-02 SSE branch
- `test_failed_server_does_not_block_other_servers` — MCPI-03 non-blocking

## Verification

```
pyright: 0 errors, 0 warnings, 0 informations
ruff: All checks passed
pytest tests/unit/ai/agents/test_pilotspace_stream_utils.py: 41 passed (36 pre-existing + 5 new)
pytest tests/api/test_workspace_mcp_servers.py: all passed (6 xfail as expected)
```

## Deviations from Plan

None — plan executed exactly as written. The ruff TC006 auto-fix (quoting type args in `cast()`) was applied automatically via `ruff check --fix`.

## Commits

- `43ea4e7e` — `feat(mcp): harden session load — SSRF re-validation, health gating, HTTP transport (MCPI-02/03/05)` (commits `_mcp_server_schemas.py` change)
- `624785d4` — previous commit included `ssrf.py`, `pilotspace_stream_utils.py`, and new tests (bundled with MCPI-04 work)

## Self-Check: PASSED

- `backend/src/pilot_space/infrastructure/ssrf.py` — EXISTS
- `backend/src/pilot_space/api/v1/routers/_mcp_server_schemas.py` — imports from ssrf.py
- `backend/src/pilot_space/ai/agents/pilotspace_stream_utils.py` — contains MCPI-02/03/05 guards
- `backend/tests/unit/ai/agents/test_pilotspace_stream_utils.py` — 5 new tests present
- All 41 tests pass
- Pyright clean, ruff clean
