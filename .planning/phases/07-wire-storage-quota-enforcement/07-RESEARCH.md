# Phase 7: Wire Storage Quota Enforcement - Research

**Researched:** 2026-03-09
**Domain:** FastAPI service layer wiring — storage quota integration across write paths
**Confidence:** HIGH

## Summary

Phase 3 delivered the storage quota infrastructure: the `Workspace` model has `storage_quota_mb` and `storage_used_bytes` columns (migration 067), and `workspace_quota.py` exposes two helpers — `_check_storage_quota()` (pre-write gate) and `_update_storage_usage()` (post-write atomic delta update). However, neither helper is called from any write path. The quota columns exist and the UI displays them, but no write operation ever blocks or updates storage.

Phase 7 is purely a wiring phase. No new infrastructure is needed. The task is to import the two helpers into four existing service files and two router files, call them at the correct points in each write flow, and test the resulting behavior (507 on overflow, `X-Storage-Warning` header at 80%+).

The primary technical decision is **where** to call the helpers: in the service layer (requires passing `workspace_id` to services that currently receive it via payload), or in the router layer (has `session` and `workspace.id` available immediately after `_resolve_workspace`). The router layer is the correct integration point for quota checks because it already resolves the workspace and holds the session — inserting quota calls there mirrors how the audit log's `check_permission` and RLS context are wired at the router level without contaminating service business logic.

**Primary recommendation:** Wire `_check_storage_quota` and `_update_storage_usage` at the router level in `workspace_issues.py` and `workspace_notes.py` for create/update write paths, and in `attachment_upload_service.py` for media uploads. Add a new test file `tests/unit/services/test_storage_quota_wiring.py` covering the 507 and warning header behaviors.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TENANT-03 | Admin can set per-workspace API rate limits and storage quotas | Rate limiting wired in Phase 6. Storage quota enforcement (this phase) completes the requirement. Both helpers exist in workspace_quota.py — this phase wires them into create/update/upload write paths. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| FastAPI | project-pinned | HTTP routing and response headers | Already in use |
| SQLAlchemy async | project-pinned | `update()` expression for atomic delta | Already in use — `_update_storage_usage` already uses this |
| pytest-asyncio | project-pinned | Async unit tests | Already in use across all service tests |

### No New Dependencies
This phase adds zero new packages. All required primitives (`_check_storage_quota`, `_update_storage_usage`, `HTTPException`, `Response`, FastAPI `status`) already exist in the codebase.

## Architecture Patterns

### Integration Point: Router Layer vs Service Layer

**Decision: Wire at router layer for create, at service layer for update (where `workspace_id` is already available).**

For issue/note **create** operations, the router already resolves `workspace` before calling the service (`workspace.id` is available). The quota check naturally lives at the router between `_resolve_workspace` and `service.execute()`.

For issue/note **update** operations, the service receives `issue_id` or `note_id` — not `workspace_id` directly. The router resolves workspace before calling the service, so quota wiring also belongs in the router for updates.

For **attachment upload** (`AttachmentUploadService.upload()`), `workspace_id` is passed as a parameter — the quota call fits inside the service's `upload()` method just before the storage upload.

### Pattern 1: Router-level Quota Gate (Issues and Notes)

```python
# Source: workspace_quota.py (existing helpers)
from pilot_space.api.v1.routers.workspace_quota import (
    _check_storage_quota,
    _update_storage_usage,
)

# Inside create_workspace_issue / create_workspace_note:
delta_bytes = len((issue_data.description or "").encode())
allowed, warning_pct = await _check_storage_quota(session, workspace.id, delta_bytes)
if not allowed:
    raise HTTPException(status_code=status.HTTP_507_INSUFFICIENT_STORAGE,
                        detail="Storage quota exceeded")

result = await create_service.execute(payload)

await _update_storage_usage(session, workspace.id, delta_bytes)

# Build response, attach warning header if needed
response = IssueResponse.from_issue(result.issue)
if warning_pct is not None:
    # Caller must accept Response as parameter to set headers
    # FastAPI pattern: inject Response object as parameter
    pass
```

**Warning Header Pattern — FastAPI Response injection:**

FastAPI allows injecting a `Response` object as a route parameter to set headers without replacing the return model:

```python
from fastapi import Response

async def create_workspace_issue(
    ...
    response: Response,   # injected by FastAPI, does not appear in schema
) -> IssueResponse:
    ...
    if warning_pct is not None:
        response.headers["X-Storage-Warning"] = str(round(warning_pct, 4))
    return issue_response
```

This is the standard FastAPI pattern for setting response headers while keeping typed response models. Source: FastAPI docs on "Response Headers" (verified as current behavior for FastAPI >= 0.95).

### Pattern 2: Service-level Quota Gate (Attachment Upload)

`AttachmentUploadService.upload()` already receives `workspace_id` and `session`. The quota check fits directly inside `upload()` before `self._storage.upload_object()`:

```python
# In attachment_upload_service.py upload() method
from pilot_space.api.v1.routers.workspace_quota import (
    _check_storage_quota,
    _update_storage_usage,
)

file_size = len(file_data)
allowed, warning_pct = await _check_storage_quota(self._session, workspace_id, file_size)
if not allowed:
    raise ValueError("STORAGE_QUOTA_EXCEEDED")

await self._storage.upload_object(...)
await _update_storage_usage(self._session, workspace_id, file_size)
```

The attachment router then reads `warning_pct` from the service response and sets the header. However, `AttachmentUploadService.upload()` currently returns `AttachmentUploadResponse` — it cannot return a warning pct alongside. The cleanest approach: **raise ValueError("STORAGE_QUOTA_EXCEEDED")** inside the service for the 507 case, and handle the warning header at the router level by calling `_check_storage_quota` separately in the router before delegating to the service.

**Simpler alternative:** Wire quota check directly in the attachment upload router (`ai_attachments.py`) before calling `service.upload()`, same as issues/notes pattern. This keeps services free of quota-specific header concerns.

### Anti-Patterns to Avoid

- **Calling `_update_storage_usage` before the write commits:** The update must happen after `session.flush()` or after the service's `create()` call. If the service raises an exception, the storage counter must not increment. Since `_update_storage_usage` issues a SQL UPDATE (not commit), it participates in the same transaction as the service write — this is correct behavior.
- **Calling `_check_storage_quota` after the write:** Pre-write check must precede service execution, not follow it.
- **Setting `X-Storage-Warning` for the 507 case:** Only set the warning header when write is allowed (pct >= 0.80 but < 1.0). Blocked writes return 507 with no warning header.
- **Ignoring `delta_bytes` size for updates:** For issue/note updates, delta = new content size minus old content size. For creates, delta = new content size. Negative delta is fine (content shrinks). For attachment upload, delta = file size bytes.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Quota check logic | Custom quota gate | `_check_storage_quota` in workspace_quota.py | Already handles NULL quota (unlimited), 80%/100% thresholds, workspace lookup |
| Atomic storage counter update | Custom SQL | `_update_storage_usage` in workspace_quota.py | Already uses `Workspace.storage_used_bytes + delta` expression to avoid race conditions |
| Response header injection | Custom middleware | FastAPI `Response` parameter injection | FastAPI-native; no middleware needed for per-endpoint header |

## Common Pitfalls

### Pitfall 1: Delta Calculation for Updates
**What goes wrong:** Passing `len(new_description.encode())` as delta without subtracting the old value means storage counter grows on every update even if content shrinks.
**Why it happens:** Create path is simple (no old value), update path requires fetching the existing record first.
**How to avoid:** For update paths, compute `delta_bytes = len(new_bytes) - len(old_bytes)`. Both `UpdateIssueService.execute()` and `UpdateNoteService.execute()` fetch the existing record first (`issue = await self._issue_repo.get_by_id_with_relations(...)`) — `old_description` is available at that point.
**Warning signs:** `storage_used_bytes` exceeding actual content size in recalculate endpoint.

### Pitfall 2: workspace_issues.py at 640 Lines
**What goes wrong:** workspace_issues.py is already at 640 lines, 60 lines under the 700-line pre-commit limit. Adding quota wiring imports and logic to all write endpoints risks hitting the limit.
**Why it happens:** The file handles many endpoints (list, get, create, update, delete, state update, notes list, relations).
**How to avoid:** Keep quota imports concise. Each endpoint needs ~5-8 lines of quota wiring. Total addition is ~20-25 lines — stays safely under 700. Confirm line count after implementation.

### Pitfall 3: workspace_notes.py Response Signature
**What goes wrong:** `create_workspace_note` and `update_workspace_note` do not currently accept a `Response` parameter. Adding it changes the function signature.
**Why it happens:** FastAPI `Response` injection requires the parameter to be declared in the function signature; it is not automatically available.
**How to avoid:** Add `response: Response` as a function parameter. FastAPI injects it automatically; it does not appear in OpenAPI schema and does not affect existing clients.

### Pitfall 4: 507 Not in FastAPI Default Status Codes
**What goes wrong:** `status.HTTP_507_INSUFFICIENT_STORAGE` may not be listed in FastAPI's default `status` module.
**Why it happens:** FastAPI re-exports starlette's status codes; 507 IS defined as `HTTP_507_INSUFFICIENT_STORAGE` in starlette.
**How to avoid:** Use `status.HTTP_507_INSUFFICIENT_STORAGE` (value 507). Verified: starlette includes it.

### Pitfall 5: `_update_storage_usage` Must be Non-Fatal for Updates
**What goes wrong:** If the storage counter update fails (e.g., session already closed), it blocks the primary write response.
**Why it happens:** `_update_storage_usage` is an async SQL execute — if the session is in a bad state, it raises.
**How to avoid:** Wrap `_update_storage_usage` in a try/except with logger.warning, same pattern as audit log writes. Storage counter inaccuracy is recoverable via the `/recalculate` endpoint; write path failure is not.

## Code Examples

### How _check_storage_quota Returns Values
```python
# Source: backend/src/pilot_space/api/v1/routers/workspace_quota.py lines 192-230
async def _check_storage_quota(
    session: AsyncSession,
    workspace_id: UUID,
    delta_bytes: int,
) -> tuple[bool, float | None]:
    # Returns:
    # (True, None)   — allowed, no warning
    # (True, pct)    — allowed, pct >= 0.80 (caller adds X-Storage-Warning header)
    # (False, None)  — blocked, caller raises HTTP 507
```

### Complete Router Integration Pattern
```python
# Source: pattern derived from workspace_quota.py + FastAPI Response injection docs
from fastapi import Response
from pilot_space.api.v1.routers.workspace_quota import (
    _check_storage_quota,
    _update_storage_usage,
)

@router.post("/{workspace_id}/issues", ...)
async def create_workspace_issue(
    ...,
    response: Response,   # FastAPI injects; not in OpenAPI schema
    session: DbSession,
) -> IssueResponse:
    workspace = await _resolve_workspace(workspace_id, workspace_repo)
    await set_rls_context(session, current_user_id, workspace.id)

    delta_bytes = len((issue_data.description or "").encode("utf-8"))
    allowed, warning_pct = await _check_storage_quota(session, workspace.id, delta_bytes)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_507_INSUFFICIENT_STORAGE,
            detail="Storage quota exceeded",
        )

    result = await create_service.execute(payload)

    try:
        await _update_storage_usage(session, workspace.id, delta_bytes)
    except Exception:
        logger.warning("Failed to update storage usage for workspace %s", workspace.id)

    if warning_pct is not None:
        response.headers["X-Storage-Warning"] = str(round(warning_pct, 4))

    return IssueResponse.from_issue(result.issue)
```

### Delta Calculation for Updates
```python
# For update paths — fetch old content before service call
# Note: service already fetches the existing record; router must do it separately
# or pass workspace_id + old content size through to the router.
# Simpler: call _check_storage_quota with delta = 0 (conservative: only check, not penalize)
# OR: load old content length from a quick scalar query before calling the service.
old_bytes_result = await session.execute(
    select(Issue.description).where(Issue.id == issue_id)
)
old_description = old_bytes_result.scalar_one_or_none() or ""
old_bytes = len(old_description.encode("utf-8"))
new_bytes = len((issue_data.description or "").encode("utf-8"))
delta_bytes = new_bytes - old_bytes
```

### Test Pattern for 507 and Warning Header
```python
# Source: pattern from tests/unit/test_storage_quota.py + FastAPI TestClient patterns
import pytest
from unittest.mock import AsyncMock, patch

@pytest.mark.asyncio
async def test_create_issue_blocked_at_quota():
    """507 raised when _check_storage_quota returns (False, None)."""
    with patch(
        "pilot_space.api.v1.routers.workspace_issues._check_storage_quota",
        return_value=(False, None),
    ):
        # Call router function or use TestClient
        with pytest.raises(HTTPException) as exc_info:
            await create_workspace_issue(...)
        assert exc_info.value.status_code == 507

@pytest.mark.asyncio
async def test_create_issue_warning_header_at_80_percent():
    """X-Storage-Warning header present when projected usage >= 80%."""
    with patch(
        "pilot_space.api.v1.routers.workspace_issues._check_storage_quota",
        return_value=(True, 0.85),
    ):
        mock_response = MagicMock()
        mock_response.headers = {}
        result = await create_workspace_issue(..., response=mock_response)
        assert "X-Storage-Warning" in mock_response.headers
        assert float(mock_response.headers["X-Storage-Warning"]) == pytest.approx(0.85, abs=0.01)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No quota enforcement on writes | Pre-check + post-update quota wiring | This phase | Storage limits actually enforce |
| `storage_used_bytes` always 0 | Delta-updated atomically per write | This phase | UI quota display becomes accurate |

**Infrastructure already complete (Phase 3):**
- Migration 067: `storage_quota_mb`, `storage_used_bytes` columns on `workspaces`
- `_check_storage_quota()` helper in `workspace_quota.py`
- `_update_storage_usage()` helper in `workspace_quota.py`
- `POST /settings/quota/recalculate` endpoint for full recount

## Open Questions

1. **Delta for note/issue content updates — how precise?**
   - What we know: `recalculate` uses `LENGTH(body)` and `LENGTH(description)` which counts UTF-8 bytes in PostgreSQL
   - What's unclear: whether title bytes should also count
   - Recommendation: Count only `description`/`body` bytes (matches recalculate logic). Title is small and bounded at 255 chars.

2. **Should attachment uploads count toward workspace storage?**
   - What we know: `recalculate` endpoint sums only notes.body + issues.description; chat attachments are NOT included
   - What's unclear: Whether the Phase 7 scope includes attachment quota enforcement
   - Recommendation: Based on the phase description ("media upload included"), wire quota for attachment uploads too. Delta = file byte size.

3. **Line count ceiling on workspace_issues.py (640 lines)**
   - What we know: File is 640/700 lines
   - What's unclear: Whether quota wiring pushes it over 700
   - Recommendation: Estimate ~25 additional lines (5 per endpoint × 4-5 endpoints + imports). Should stay under 700. Verify post-implementation.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest + pytest-asyncio |
| Config file | `backend/pyproject.toml` |
| Quick run command | `cd backend && uv run pytest tests/unit/services/test_storage_quota_wiring.py -x -q` |
| Full suite command | `make quality-gates-backend` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TENANT-03 | 507 returned when quota exceeded on issue create | unit | `pytest tests/unit/services/test_storage_quota_wiring.py::test_create_issue_507_when_quota_exceeded -x` | Wave 0 |
| TENANT-03 | 507 returned when quota exceeded on note create | unit | `pytest tests/unit/services/test_storage_quota_wiring.py::test_create_note_507_when_quota_exceeded -x` | Wave 0 |
| TENANT-03 | X-Storage-Warning header set at 80%+ on issue create | unit | `pytest tests/unit/services/test_storage_quota_wiring.py::test_create_issue_warning_header_at_80pct -x` | Wave 0 |
| TENANT-03 | X-Storage-Warning header set at 80%+ on note create | unit | `pytest tests/unit/services/test_storage_quota_wiring.py::test_create_note_warning_header_at_80pct -x` | Wave 0 |
| TENANT-03 | _update_storage_usage called after successful issue create | unit | `pytest tests/unit/services/test_storage_quota_wiring.py::test_update_storage_usage_called_after_create -x` | Wave 0 |
| TENANT-03 | NULL quota allows write (unlimited) | unit | `pytest tests/unit/test_storage_quota.py::TestCheckStorageQuota::test_null_quota_always_allows` | exists |
| TENANT-03 | Attachment upload blocked at quota | unit | `pytest tests/unit/services/test_storage_quota_wiring.py::test_attachment_upload_507_when_quota_exceeded -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && uv run pytest tests/unit/services/test_storage_quota_wiring.py tests/unit/test_storage_quota.py -x -q`
- **Per wave merge:** `make quality-gates-backend`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/services/test_storage_quota_wiring.py` — covers TENANT-03 router wiring tests (all new tests in this phase)

*(Existing `tests/unit/test_storage_quota.py` covers helper function behavior; new file covers router/service integration of those helpers)*

## Sources

### Primary (HIGH confidence)
- Direct code inspection — `backend/src/pilot_space/api/v1/routers/workspace_quota.py` — `_check_storage_quota` and `_update_storage_usage` signatures, return contracts, and existing tests in `tests/unit/test_storage_quota.py`
- Direct code inspection — `backend/src/pilot_space/api/v1/routers/workspace_issues.py` (640 lines) and `workspace_notes.py` (595 lines) — current write endpoint structure
- Direct code inspection — `backend/src/pilot_space/application/services/issue/create_issue_service.py`, `update_issue_service.py`, `note/create_note_service.py`, `note/update_note_service.py` — service signatures and payload shapes
- Direct code inspection — `backend/src/pilot_space/application/services/ai/attachment_upload_service.py` — upload method structure

### Secondary (MEDIUM confidence)
- FastAPI Response injection pattern for setting response headers — standard documented behavior; `response: Response` parameter in route function

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all primitives exist in codebase; no new dependencies
- Architecture: HIGH — integration points clearly identified from code inspection
- Pitfalls: HIGH — line count limits and delta calculation issues identified from direct code review

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable phase; no external dependencies to expire)
