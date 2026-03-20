# Phase 4: AI Governance - Research

**Researched:** 2026-03-08
**Domain:** AI approval policy matrix, audit trail extension, artifact rollback, BYOK enforcement, cost dashboard, rationale display
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**AIGOV-01: AI Policy Granularity**
- New table `workspace_ai_policy`: `(workspace_id, role [WorkspaceRole enum: OWNER|ADMIN|MEMBER|GUEST], action_type [ActionType enum], requires_approval bool)`
- ALWAYS_REQUIRE actions remain hardcoded and non-configurable
- Owner role is always auto-execute for DEFAULT_REQUIRE actions — hardcoded
- `ApprovalService.check_approval_required()` gains `user_role: WorkspaceRole` parameter; queries `workspace_ai_policy` first, falls back to CONSERVATIVE/BALANCED/AUTONOMOUS
- Admin UI: Settings > AI Governance — matrix table with action types as rows (grouped by category) and roles (Admin, Member, Guest) as columns. Each cell toggles "Auto" | "Approval". Owner column always "Auto" (greyed out). ALWAYS_REQUIRE rows show "Always" locked.
- Default state: no rows in `workspace_ai_policy` → current hardcoded behavior (backward compatible)

**AIGOV-02: Approval Queue UX**
- New route `/[workspaceSlug]/approvals` — dedicated page accessible from sidebar
- Sidebar nav item: "Approvals" with badge showing pending count; Owner/Admin only; badge hidden when count = 0
- Triggering user: "Awaiting approval" badge state + toast "Your request has been sent for approval"
- Reviewer experience: Table with Action type, Requested by, AI agent, Context preview (100 chars), Time requested. Row expansion shows full payload + rationale. Approve/Reject buttons. Single-item only (no bulk).
- After approval: action executes immediately; both parties notified
- After rejection: action discarded; triggering user notified with optional rejection reason text
- Expiration: existing `DEFAULT_EXPIRATION_HOURS = 24` unchanged; expired → "Expired" status tab
- No changes to `AIApprovalRequest` model or `ApprovalRepository`

**AIGOV-03: AI Audit Trail**
- Extend existing `AuditSettingsPage` (not a new page)
- Add `actor_type = AI` filter option in Actor Type dropdown
- AI row expansion: show Model, Token cost, AI rationale (if present)
- Approval chain link: AI audit rows with associated `AIApprovalRequest` show "View approval" link
- No new backend endpoints — existing audit API already returns AI fields

**AIGOV-04: AI Artifact Rollback**
- New endpoint: `POST /workspaces/{slug}/audit/{entry_id}/rollback`
- Reads `audit_log.payload.before` and dispatches write to appropriate service based on `resource_type`
- Rollback-able: only entries where `actor_type = AI` AND (action ends in `.create` or `.update`)
- Not rollback-able: AI deletions, user-initiated actions
- Rollback creates new audit entry: `action = "ai.rollback"`, `actor_type = USER`
- UI: "Rollback" button in audit row expansion, only when row is rollback-able. Confirmation dialog shows what will be restored.
- Permission: Owner and Admin only

**AIGOV-05: BYOK Strict Enforcement**
- Remove fallback path in `ProviderSelector` for workspace-scoped AI calls: if no valid `WorkspaceAPIKey` found → raise `AINotConfiguredError` (HTTP 503, error code `AI_BYOK_REQUIRED`)
- Platform env keys (`anthropic_api_key` in config.py) remain as `_SYSTEM_ONLY`
- New status endpoint: `GET /workspaces/{slug}/settings/ai-status` → `{"byok_configured": bool, "providers": ["anthropic"]}`
- Frontend when `byok_configured: false`: `AiNotConfiguredBanner` at top of workspace layout (Owner only; dismissable per session); all AI triggers show `disabled` + tooltip "AI not available — configure an API key in Settings"; non-Owner members see no banner, AI controls simply disabled

**AIGOV-06: Cost Dashboard — "By Feature" Dimension**
- New column on `ai_cost_records`: `operation_type` (nullable string, values from `AIOperation` enum in `telemetry.py`)
- Migration: nullable column with no default; existing rows get NULL
- New API filter: `GET /workspaces/{slug}/costs/summary?group_by=operation_type` returns `by_feature: dict[str, float]`
- Frontend: New "By Feature" tab on existing `cost-dashboard-page.tsx` using existing `CostByAgentChart` shape
- Fix `CostTracker` singleton bug: make `CostTracker` a request-scoped `providers.Factory` (same as Phase 2 `AuditLogHook` pattern)

**AIGOV-07: AI Rationale Display**
- Issue extraction (`ExtractionReviewPanel`): "ⓘ" icon button on each card → Radix `Popover` with `ai_rationale` text; fetched lazily on click
- PR review comments: expandable "AI reasoning" disclosure section using shadcn/ui `Collapsible`; rationale embedded in review comment response
- Approval queue items: rationale shown directly in row expansion (always visible)
- Ghost text completions: NO rationale (latency-critical)
- Data source: `audit_log.ai_rationale` via `GET /workspaces/{slug}/audit?actor_type=AI&resource_id={id}`

### Claude's Discretion
- Exact Alembic migration ordering for `workspace_ai_policy` table and `ai_cost_records.operation_type` column
- RLS policies on `workspace_ai_policy` (standard workspace isolation pattern)
- `ProviderSelector` internal refactor to thread workspace_id through key resolution
- Exact HTTP error shape for `AINotConfiguredError` (follow existing RFC 7807 `application/problem+json` pattern)
- Whether to use Radix `Tooltip` or `Popover` for rationale on PR review (Popover preferred)
- Sidebar "Approvals" nav item placement (after "Settings", before workspace-level items)

### Deferred Ideas (OUT OF SCOPE)
- Per-project AI governance policy overrides
- AI cost budgeting with auto-disable when monthly budget is reached
- Rollback of AI-deleted artifacts
- Bulk approve/reject in the approval queue
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AIGOV-01 | Admin can configure AI action policies: which action types auto-execute vs. require human approval, per role | New `workspace_ai_policy` table + `ApprovalService.check_approval_required()` extension + matrix UI in Settings |
| AIGOV-02 | When an AI action requires approval, it is queued and presented to an authorized human reviewer before execution | New `/approvals` route + sidebar badge + existing `ai_approvals.py` endpoints |
| AIGOV-03 | Admin can view a full AI audit trail: all AI actions with input, output, rationale, model, cost, and approval chain | Extend existing `AuditSettingsPage` + `actor_type` filter param added to audit router + `list_filtered()` extension |
| AIGOV-04 | Admin can rollback any AI-created or AI-modified artifact to its pre-AI state | New rollback endpoint using `audit_log.payload.before` + confirmation UI in audit row expansion |
| AIGOV-05 | AI features are fully disabled for a workspace if no valid BYOK API key is configured — no fallback to Pilot Space keys | Remove env fallback in `_get_api_key()` across agents + new AI status endpoint + `AiNotConfiguredBanner` |
| AIGOV-06 | Admin can view per-workspace AI cost dashboard: token usage by model, by feature, by time period | Add `operation_type` column to `ai_cost_records` + fix CostTracker singleton + "By Feature" tab on cost dashboard |
| AIGOV-07 | Users can see the AI rationale for any AI-generated suggestion, review comment, or extracted issue | Rationale popovers/collapsibles in `ExtractionReviewPanel`, PR review tab, and approval queue UI |
</phase_requirements>

---

## Summary

Phase 4 implements AI governance controls for the Pilot Space platform. The work is primarily additive — extending existing infrastructure (approval service, audit log, cost tracker, provider selector) rather than replacing it. The most significant structural changes are: upgrading `ApprovalService.check_approval_required()` from workspace-level CONSERVATIVE/BALANCED/AUTONOMOUS to a per-role × per-action-type DB-backed policy matrix; fixing the `CostTracker` singleton bug that silently drops cost records; and removing the BYOK env fallback that allows platform keys to be used for workspace AI calls.

The frontend work is similarly additive: a new `/approvals` route with a sidebar badge, a "By Feature" tab on the existing cost dashboard, actor-type filtering on the existing audit settings page, and rationale popovers in extraction review and PR review panels. No new frontend infrastructure is needed — all components follow established patterns (plain React, TanStack Query, shadcn/ui, Radix primitives).

The most complex new backend component is the rollback endpoint, which must dispatch service-layer writes based on `resource_type` from the audit log — this requires a dispatch table that maps resource types to their respective service `update()` methods.

**Primary recommendation:** Implement in waves: (1) DB/model layer (workspace_ai_policy table + operation_type column + migration), (2) backend service/API layer (ApprovalService extension, CostTracker fix, BYOK enforcement, rollback endpoint, actor_type filter), (3) frontend layer (approvals page, audit filter, cost tab, rationale display).

---

## Standard Stack

### Core (verified by reading existing codebase)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SQLAlchemy async | `2.x` (via `uv`) | ORM for `workspace_ai_policy` model and `ai_cost_records` migration | Established in all existing models |
| Alembic | Current | DB migrations for new table + column | Existing migration chain (currently at `067_*`) |
| FastAPI | Current | New rollback endpoint + AI status endpoint + actor_type filter | All existing API routes use FastAPI |
| dependency-injector | Current | Change `CostTracker` from Singleton to Factory in `container.py` | Phase 2 `AuditLogHook` used same pattern |
| shadcn/ui | Current | Matrix toggle UI, confirmation dialog, Collapsible for rationale | All existing settings pages use shadcn/ui |
| Radix Popover | Current | Lazy rationale popover in `ExtractionReviewPanel` | Property block view, existing selector components |
| TanStack Query | Current | Data fetching on all new frontend pages/components | All settings pages use TanStack Query |
| Recharts | Current | "By Feature" bar chart (reuse `CostByAgentChart` shape) | Existing cost dashboard uses Recharts |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Radix Collapsible | Current | "AI reasoning" expandable section in PR review | More content than a tooltip; needs to persist open |
| Sonner (toast) | Current | "Your request has been sent for approval" toast | Existing toast pattern in workspace UI |
| Lucide React | Current | Icons for Approvals nav item, badge, rollback button | All existing sidebar and button icons |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Radix Popover for rationale | Tooltip | Tooltip content is limited; rationale text can be long; Popover is dismissable |
| Factory pattern for CostTracker | Session injection at call site | Factory is cleaner and mirrors AuditLogHook pattern from Phase 2 |
| New audit page for AIGOV-03 | Extend existing AuditSettingsPage | Extension avoids duplication; existing page already has the filter UI structure |

---

## Architecture Patterns

### Recommended Project Structure

New files follow existing feature-folder conventions:

```
backend/src/pilot_space/
├── infrastructure/database/models/
│   └── workspace_ai_policy.py          # NEW: WorkspaceAIPolicy model
├── infrastructure/database/repositories/
│   └── workspace_ai_policy_repository.py  # NEW: CRUD for policy rows
├── api/v1/routers/
│   └── ai_governance.py                # NEW: policy CRUD + rollback endpoint
│   └── workspace_ai_settings.py        # EXTEND: add ai-status endpoint
│   └── ai_costs.py                     # EXTEND: add group_by=operation_type
│   └── audit.py                        # EXTEND: add actor_type filter param
├── ai/infrastructure/
│   └── approval.py                     # EXTEND: check_approval_required() + user_role param
│   └── cost_tracker.py                 # EXTEND: add operation_type param to track()
├── ai/providers/
│   └── provider_selector.py            # EXTEND: add workspace_id param, remove env fallback
├── container/
│   └── container.py                    # EXTEND: CostTracker Singleton→Factory
└── alembic/versions/
    └── 068_add_workspace_ai_policy.py  # NEW: workspace_ai_policy table
    └── 069_add_operation_type_to_costs.py  # NEW: operation_type column

frontend/src/
├── app/(workspace)/[workspaceSlug]/
│   └── approvals/
│       └── page.tsx                    # NEW: Approvals queue route
├── features/approvals/                 # NEW: feature folder
│   ├── pages/approvals-page.tsx
│   ├── components/approval-row.tsx
│   └── hooks/use-approvals.ts
├── features/settings/pages/
│   └── audit-settings-page.tsx         # EXTEND: actor_type filter + AI row expansion
│   └── ai-governance-settings-page.tsx # NEW: policy matrix settings page
├── features/costs/pages/
│   └── cost-dashboard-page.tsx         # EXTEND: "By Feature" tab
├── features/notes/components/
│   └── ExtractionReviewPanel.tsx       # EXTEND: rationale popover per card
└── components/layout/
    └── sidebar.tsx                     # EXTEND: Approvals nav item + badge
```

### Pattern 1: ApprovalService Role-Aware Policy Check

**What:** `check_approval_required()` gains `user_role: WorkspaceRole` and `workspace_id: UUID` parameters. It queries `workspace_ai_policy` first; falls back to existing CONSERVATIVE/BALANCED/AUTONOMOUS logic if no row exists.

**When to use:** Every call site of `check_approval_required()` — agents, skill executors, action handlers.

**Example:**
```python
# Before (existing)
def check_approval_required(
    self,
    action_type: ActionType,
    project_settings: ProjectSettings | None = None,
) -> bool: ...

# After (Phase 4)
async def check_approval_required(
    self,
    action_type: ActionType,
    workspace_id: uuid.UUID,
    user_role: WorkspaceRole,
    project_settings: ProjectSettings | None = None,
) -> bool:
    # 1. ALWAYS_REQUIRE: hardcoded, never configurable
    if action_type in self.ALWAYS_REQUIRE_ACTIONS:
        return True

    # 2. Owner: always auto-execute for DEFAULT_REQUIRE (hardcoded)
    if user_role == WorkspaceRole.OWNER:
        if action_type not in self.ALWAYS_REQUIRE_ACTIONS:
            return False

    # 3. Query workspace_ai_policy table
    policy_row = await self._policy_repo.get(workspace_id, user_role, action_type)
    if policy_row is not None:
        return policy_row.requires_approval

    # 4. Fall back to existing level logic
    settings = project_settings or ProjectSettings()
    ...
```

**Note:** This method becomes `async` due to DB lookup. All callers must be updated with `await`.

### Pattern 2: CostTracker Factory (fixing singleton bug)

**What:** `CostTracker` in `container.py` currently uses `providers.Callable(lambda: None)` as a workaround — it is a singleton with `session=None` that silently drops all cost records. Fix: make it a `providers.Factory` that receives the request-scoped session.

**When to use:** Phase 4 is the designated fix point (flagged in STATE.md).

**Example (container.py):**
```python
# Before (broken)
cost_tracker=providers.Callable(lambda: None),  # Cost tracker requires request-scoped session

# After (Phase 4)
cost_tracker = providers.Factory(
    CostTracker,
    session=providers.Callable(get_current_session),
)
```

All service definitions that receive `cost_tracker` as a parameter must be updated to use `cost_tracker` instead of the lambda.

### Pattern 3: workspace_ai_policy Table (RLS)

**What:** New table with standard workspace isolation RLS. Admin read = OWNER + ADMIN; write = OWNER only.

**When to use:** Template for the new `WorkspaceAIPolicy` SQLAlchemy model.

**Example (migration SQL):**
```sql
-- Use get_workspace_rls_policy_sql() template for base isolation
-- Then add write restriction (OWNER only):
CREATE POLICY "workspace_ai_policy_write_owner_only"
ON workspace_ai_policy
FOR INSERT UPDATE DELETE
USING (
    workspace_id IN (
        SELECT wm.workspace_id FROM workspace_members wm
        WHERE wm.user_id = current_setting('app.current_user_id', true)::uuid
        AND wm.role = 'OWNER'
        AND wm.is_deleted = false
    )
);
```

### Pattern 4: Rollback Endpoint Dispatch Table

**What:** `POST /workspaces/{slug}/audit/{entry_id}/rollback` reads `payload.before` and dispatches to the appropriate service.

**When to use:** Only `actor_type = AI` + action ends in `.create` or `.update`.

**Example:**
```python
ROLLBACK_DISPATCH: dict[str, str] = {
    "issue": "IssueService",
    "note": "NoteService",
    # Add more as needed
}

async def rollback(entry_id: UUID, session: AsyncSession, actor_id: UUID) -> None:
    entry = await audit_repo.get_by_id(entry_id)
    if not _is_rollback_eligible(entry):
        raise HTTPException(400, "Entry is not rollback-eligible")

    before_state = entry.payload.get("before", {})
    service = ROLLBACK_DISPATCH[entry.resource_type](session)
    await service.update(entry.resource_id, before_state)

    # Write rollback audit entry
    await audit_repo.write(
        action="ai.rollback",
        actor_type=ActorType.USER,
        actor_id=actor_id,
        resource_type=entry.resource_type,
        resource_id=entry.resource_id,
        payload={"before": current_state, "after": before_state},
    )
```

### Pattern 5: BYOK Enforcement in Agents

**What:** Remove the `os.getenv("ANTHROPIC_API_KEY")` fallback in `_get_api_key()`. All agents have their own `_get_api_key()` method — each must be updated.

**Affected files (confirmed by grep):**
- `ai/agents/pilotspace_agent.py` — primary (line 156-173)
- `ai/agents/subagents/pr_review_subagent.py` (line 224)
- `ai/agents/subagents/doc_generator_subagent.py` (line 155)
- `ai/agents/ai_context_agent.py` (delegates to pilotspace_agent)
- `ai/agents/plan_generation_agent.py` (delegates to pilotspace_agent)
- `ai/agents/pilotspace_stream_utils.py` (line 616, for OpenAI key)

**Example (pilotspace_agent.py after fix):**
```python
async def _get_api_key(self, workspace_id: UUID | None) -> str:
    if workspace_id and self._key_storage:
        key = await self._key_storage.get_api_key(workspace_id, "anthropic")
        if key:
            return key
    # No fallback — raise AINotConfiguredError
    raise AINotConfiguredError(workspace_id=workspace_id)
```

`AINotConfiguredError` maps to HTTP 503 with RFC 7807 body:
```json
{
  "type": "about:blank",
  "title": "AI Not Configured",
  "status": 503,
  "detail": "No BYOK API key configured for this workspace. Configure a key in Settings > API Keys.",
  "error_code": "AI_BYOK_REQUIRED"
}
```

### Pattern 6: Frontend Settings Pages (Plain React)

**What:** All settings pages are plain React (NOT `observer()`). TanStack Query handles data. This is a project-wide convention.

**When to use:** `AIGovernanceSettingsPage`, `ApprovalsPage` — both must follow this pattern.

**Example:**
```tsx
// NOT observer() — plain React component
function AIGovernanceSettingsPage() {
  const { workspaceSlug } = useParams();
  const { data: policy, isLoading } = useAIPolicy(workspaceSlug);
  // ...
}
```

Exception: `CostDashboardPage` already uses `observer()` (it accesses MobX store for date range). The "By Feature" tab extends this existing component without changing its observer status.

### Anti-Patterns to Avoid

- **Singleton CostTracker with session=None:** Already causes silent data loss. Phase 4 MUST fix this before adding `operation_type` tracking, otherwise new fields will also be silently dropped.
- **Wrapping approval/governance pages in `observer()`:** No MobX observables needed. TanStack Query covers all data needs.
- **Adding `actor_type` filter only to the API but not the repository:** The `list_filtered()` method in `AuditLogRepository` does not currently accept `actor_type` as a filter parameter. Both the router and repository must be updated together.
- **Calling check_approval_required() synchronously after making it async:** All call sites must be audited and awaited.
- **Adding rollback to immutable-enforced entries:** The audit_log table has a DB trigger preventing modifications. Rollback creates a NEW entry, never modifies the original.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Audit log immutability | Custom soft-delete or flag | Existing DB trigger + new audit entry for rollback | Existing trigger enforces immutability at DB level |
| Workspace isolation on new table | Custom per-row WHERE | `get_workspace_rls_policy_sql()` template in `rls.py` | Standard pattern across all 10+ workspace-scoped tables |
| Policy toggle UI | Custom toggle component | shadcn/ui `Switch` or `Toggle` | Existing settings pages use these primitives |
| Rationale popover | Custom tooltip overlay | Radix `Popover` + shadcn/ui `Popover` | Already used by PropertyBlockView; handles complex content |
| Approval expiration | Background polling | Existing `expire_stale_requests()` method in `ApprovalService` | Already implemented; called by hourly background job |
| Cost "By Feature" chart | New chart component | Reuse `CostByAgentChart` with different `dataKey` | Component already takes configurable dataKey |
| Error format | Custom error body | RFC 7807 `application/problem+json` via `ApiError` | All backend errors use this format; frontend `ApiError.fromAxiosError` handles it |

**Key insight:** Phase 4 adds governance controls to an AI system that already has most of the required infrastructure (approval service, cost tracker, audit log). The work is wiring and configuration, not building new primitives.

---

## Common Pitfalls

### Pitfall 1: check_approval_required() Becoming Async

**What goes wrong:** All existing call sites call `check_approval_required()` synchronously. Making it `async` (required for DB policy lookup) without updating all callers causes `RuntimeWarning: coroutine was never awaited` — the approval check silently passes without actually checking.

**Why it happens:** Python doesn't raise a TypeError when you call an async function without await — it returns a coroutine object, which is truthy, so `if check_approval_required(...)` always passes.

**How to avoid:** Before changing the signature, grep all call sites: `grep -rn "check_approval_required" backend/`. Update every call site simultaneously. Add a test that asserts the awaited result.

**Warning signs:** Approval checks that always return False (auto-execute) after the change.

### Pitfall 2: CostTracker Factory Breaks Existing Service Definitions

**What goes wrong:** Multiple services in `container.py` currently receive `cost_tracker=providers.Callable(lambda: None)` as a workaround. Changing `cost_tracker` to a proper Factory means its type changes from `None` to `CostTracker`. Any service that type-checks `if cost_tracker is None` or uses it with `Optional[CostTracker]` hints will break.

**Why it happens:** The lambda workaround masked the bug; services were never called with a real tracker.

**How to avoid:** After fixing the container, run `pnpm type-check` (backend: `uv run pyright`). Check all service constructors that accept `cost_tracker` parameter for `None` guards.

### Pitfall 3: Alembic Migration Head Conflicts

**What goes wrong:** Creating migrations `068` and `069` out of order, or with incorrect `Revises:` references. The current head is `067_workspace_encryption_and_quota.py`.

**Why it happens:** Known project bug (three `022_*` files had conflicting parent references). See migration rules.

**How to avoid:**
```bash
cd backend && alembic heads   # Must show single head: 067_*
# Then create 068 with Revises: <067_revision_id>
# Then create 069 with Revises: <068_revision_id>
cd backend && alembic check   # Verify head matches models
```

### Pitfall 4: actor_type Filter Not Plumbed Through Repository

**What goes wrong:** Adding `actor_type` query parameter to the audit router but not updating `AuditLogRepository.list_filtered()`. The filter silently does nothing.

**Why it happens:** The audit router builds the WHERE clause by calling `repo.list_filtered()`. The repository doesn't accept `actor_type` today (confirmed by reading the signature — `actor_id`, `action`, `resource_type`, `start_date`, `end_date` are the current params, but `actor_type` is not).

**How to avoid:** Update `AuditLogRepository.list_filtered()` signature and WHERE clause at the same time as the router.

### Pitfall 5: BYOK Enforcement Breaks System-Only Operations

**What goes wrong:** Removing the env key fallback globally also breaks system-level operations (admin metrics aggregation, background tasks) that legitimately use the platform key.

**Why it happens:** `_get_api_key()` is called for all workspace-scoped and system operations through the same code path.

**How to avoid:** The fix is scoped: only workspace-scoped AI calls (those with `workspace_id`) should raise `AINotConfiguredError`. System-only operations (no `workspace_id`) continue to use `os.getenv("ANTHROPIC_API_KEY")` — but this branch must be clearly marked `_SYSTEM_ONLY` in comments. The decision is to make this separation explicit in `_get_api_key()`.

### Pitfall 6: Approval Queue Page Router Conflict

**What goes wrong:** The `/[workspaceSlug]/approvals` route may conflict with Next.js App Router folder conventions if there's an existing catch-all or parallel route at that level.

**Why it happens:** The current workspace routes are: `chat`, `costs`, `issues`, `members`, `notes`, `projects`, `roles`, `settings`. Adding `approvals` as a new peer route is safe — no conflicts.

**How to avoid:** Confirm by checking existing route structure (verified: no `approvals` folder exists currently).

---

## Code Examples

Verified patterns from existing codebase:

### WorkspaceScopedModel Pattern (for workspace_ai_policy)

```python
# Source: backend/src/pilot_space/infrastructure/database/models/ai_cost_record.py
class WorkspaceAIPolicy(WorkspaceScopedModel):
    __tablename__ = "workspace_ai_policy"

    role: Mapped[str] = mapped_column(String(20), nullable=False)
    action_type: Mapped[str] = mapped_column(String(100), nullable=False)
    requires_approval: Mapped[bool] = mapped_column(Boolean, nullable=False)

    __table_args__ = (
        UniqueConstraint("workspace_id", "role", "action_type",
                         name="uq_workspace_ai_policy_workspace_role_action"),
        Index("ix_workspace_ai_policy_workspace_role", "workspace_id", "role"),
    )
```

### AuditLogRepository.list_filtered() Extension (actor_type param)

```python
# Source: backend/src/pilot_space/infrastructure/database/repositories/audit_log_repository.py
# Current signature lacks actor_type. Add:
async def list_filtered(
    self,
    *,
    workspace_id: uuid.UUID,
    actor_id: uuid.UUID | None = None,
    actor_type: ActorType | None = None,   # NEW
    action: str | None = None,
    resource_type: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    cursor: str | None = None,
    page_size: int = 50,
) -> AuditLogPage:
    ...
    if actor_type is not None:
        stmt = stmt.where(AuditLog.actor_type == actor_type)
```

### ApprovalService.check_approval_required() — Current Signature

```python
# Source: backend/src/pilot_space/ai/infrastructure/approval.py (line 216)
def check_approval_required(
    self,
    action_type: ActionType,
    project_settings: ProjectSettings | None = None,
) -> bool:
```

Phase 4 changes this to `async def` with `workspace_id: uuid.UUID` and `user_role: WorkspaceRole` params.

### CostTracker.track() — Current Signature

```python
# Source: backend/src/pilot_space/ai/infrastructure/cost_tracker.py (line 179)
async def track(
    self,
    workspace_id: UUID,
    user_id: UUID,
    agent_name: str,
    provider: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
) -> CostRecord:
```

Phase 4 adds `operation_type: str | None = None` parameter. `AICostRecord` model gains `operation_type: Mapped[str | None]`.

### RFC 7807 Error Pattern (for AINotConfiguredError)

```python
# Source: CLAUDE.md — "All backend errors use Content-Type: application/problem+json"
# Pattern from existing error handling in backend:
from fastapi import HTTPException
from fastapi.responses import JSONResponse

class AINotConfiguredError(Exception):
    def __init__(self, workspace_id: UUID | None = None) -> None:
        self.workspace_id = workspace_id

# Exception handler registered in main.py:
@app.exception_handler(AINotConfiguredError)
async def ai_not_configured_handler(request, exc):
    return JSONResponse(
        status_code=503,
        content={
            "type": "about:blank",
            "title": "AI Not Configured",
            "status": 503,
            "detail": "No BYOK API key configured for this workspace.",
            "error_code": "AI_BYOK_REQUIRED",
        },
        headers={"Content-Type": "application/problem+json"},
    )
```

### Sidebar Nav with Badge Pattern

```tsx
// Source: frontend/src/components/layout/sidebar.tsx (lines 80-93)
// Current AI section:
{
  label: 'AI',
  icon: Sparkles,
  items: [
    { name: 'Chat', path: 'chat', icon: MessageSquare, testId: 'nav-chat' },
    { name: 'Roles', path: 'roles', icon: UserCog, testId: 'nav-roles' },
    { name: 'Costs', path: 'costs', icon: DollarSign, testId: 'nav-costs' },
    // Phase 4: Add Approvals with badge (Owner/Admin only)
    // { name: 'Approvals', path: 'approvals', icon: CheckCircle, badge: pendingCount, adminOnly: true }
  ],
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Workspace-level CONSERVATIVE/BALANCED/AUTONOMOUS | Per-role × per-action-type policy matrix | Phase 4 | More granular control; backward compatible via fallback |
| CostTracker singleton with session=None (broken) | Request-scoped CostTracker Factory | Phase 4 | Cost records actually persisted; enables operation_type tracking |
| ANTHROPIC_API_KEY env fallback for all workspaces | Strict BYOK: no fallback for workspace calls | Phase 4 | BYOK billing model enforced; platform key isolated to system ops |
| Audit log without actor_type filter | actor_type = AI filter in list_filtered() | Phase 4 | Enables AI-specific audit trail view |

**Deprecated/outdated:**
- `providers.Callable(lambda: None)` for cost_tracker in container.py: replaced by `providers.Factory(CostTracker, session=...)`
- Synchronous `check_approval_required()`: becomes async in Phase 4; all call sites must be updated

---

## Open Questions

1. **Rollback service dispatch completeness**
   - What we know: `resource_type` values in audit log are `issue`, `note`, `cycle`, `project`, `member`, etc.
   - What's unclear: Not all resource types have services with an `update()` method that accepts the full `before` snapshot. Some fields in `payload.before` may be read-only or computed.
   - Recommendation: Scope rollback to `issue` and `note` resource types for v1 (the most common AI-created/modified artifacts). Other resource types can be added in v2.

2. **ExtractionReviewPanel rationale fetch timing**
   - What we know: Rationale is stored in `audit_log.ai_rationale` and fetched lazily on "ⓘ" icon click.
   - What's unclear: The `resource_id` linking the extracted issue card to its audit log entry may not always be available at the time the panel renders (issues may not yet be persisted).
   - Recommendation: Use the `AIApprovalRequest.id` or extraction job ID as a stable reference; fetch audit entry by `actor_type=AI&resource_id={extraction_session_id}` rather than individual issue ID.

3. **Actor_type filter on audit list_filtered() — also needed for export?**
   - What we know: Export endpoint (`GET /workspaces/{slug}/audit/export`) uses `list_for_export()` not `list_filtered()`. AIGOV-03 only mentions the list view.
   - What's unclear: Whether export should also support actor_type filter.
   - Recommendation: Add actor_type to both `list_filtered()` and `list_for_export()` for consistency. Low additional complexity.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 8.3+ with pytest-asyncio 0.24+ |
| Config file | `backend/pyproject.toml` (`[tool.pytest.ini_options]`) |
| Quick run command | `cd backend && uv run pytest tests/unit/ai/ -q` |
| Full suite command | `cd backend && uv run pytest --cov` |
| Coverage gate | 80% branch coverage (`fail_under = 80`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AIGOV-01 | `check_approval_required()` with user_role + DB policy lookup | unit | `pytest tests/unit/ai/infrastructure/test_approval_service.py -x` | ❌ Wave 0 |
| AIGOV-01 | Policy CRUD endpoints (GET/PUT /workspaces/{slug}/settings/ai-policy) | unit | `pytest tests/unit/routers/test_ai_governance.py -x` | ❌ Wave 0 |
| AIGOV-01 | Matrix UI renders correct toggles per role + action_type | manual | Browser smoke test | N/A |
| AIGOV-02 | Approval queue page lists pending requests | unit | `pytest tests/unit/routers/test_ai_governance.py::test_approval_list -x` | ❌ Wave 0 |
| AIGOV-02 | Resolve (approve/reject) updates status + executes action | unit | `pytest tests/unit/ai/sdk/test_approval_waiter.py -x` | ✅ exists |
| AIGOV-03 | `list_filtered()` with actor_type=AI filter | unit | `pytest tests/unit/repositories/test_audit_log_repository.py -x` | ❌ Wave 0 |
| AIGOV-03 | Audit API passes actor_type param to repository | unit | `pytest tests/unit/routers/test_audit.py -x` | ❌ Wave 0 |
| AIGOV-04 | Rollback endpoint reads payload.before and dispatches write | unit | `pytest tests/unit/routers/test_ai_governance.py::test_rollback -x` | ❌ Wave 0 |
| AIGOV-04 | Rollback creates new audit entry with actor_type=USER | unit | `pytest tests/unit/routers/test_ai_governance.py::test_rollback_audit -x` | ❌ Wave 0 |
| AIGOV-05 | _get_api_key() raises AINotConfiguredError when no workspace key | unit | `pytest tests/unit/ai/agents/test_pilotspace_agent.py::test_byok_enforcement -x` | ❌ Wave 0 |
| AIGOV-05 | GET /settings/ai-status returns byok_configured=True/False | unit | `pytest tests/unit/routers/test_ai_governance.py::test_ai_status -x` | ❌ Wave 0 |
| AIGOV-06 | CostTracker.track() accepts and persists operation_type | unit | `pytest tests/unit/ai/infrastructure/test_cost_tracker.py -x` | ❌ Wave 0 |
| AIGOV-06 | GET /costs/summary?group_by=operation_type returns by_feature | unit | `pytest tests/unit/routers/test_ai_costs.py -x` | ❌ Wave 0 |
| AIGOV-07 | Rationale popover renders on ExtractionReviewPanel card | unit (vitest) | `cd frontend && pnpm test -- ExtractionReviewPanel` | ✅ exists (extend) |

### Sampling Rate

- **Per task commit:** `cd backend && uv run pytest tests/unit/ai/ tests/unit/routers/ -q`
- **Per wave merge:** `cd backend && uv run pytest --cov && cd frontend && pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/unit/ai/infrastructure/test_approval_service.py` — covers AIGOV-01 (policy lookup + role check)
- [ ] `tests/unit/routers/test_ai_governance.py` — covers AIGOV-01 policy CRUD, AIGOV-02 approval page, AIGOV-04 rollback, AIGOV-05 ai-status
- [ ] `tests/unit/repositories/test_audit_log_repository.py` — covers AIGOV-03 actor_type filter
- [ ] `tests/unit/routers/test_audit.py` — covers actor_type query param passthrough
- [ ] `tests/unit/ai/infrastructure/test_cost_tracker.py` — covers AIGOV-06 operation_type tracking
- [ ] `tests/unit/routers/test_ai_costs.py` — covers group_by=operation_type filter
- [ ] `tests/unit/ai/agents/test_pilotspace_agent.py` — covers AIGOV-05 BYOK enforcement (missing env key path)
- [ ] `tests/unit/infrastructure/models/test_workspace_ai_policy.py` — model + unique constraint

---

## Sources

### Primary (HIGH confidence)
- Direct codebase reading — `backend/src/pilot_space/ai/infrastructure/approval.py` — ApprovalService structure, ActionType enum, ALWAYS_REQUIRE/DEFAULT_REQUIRE/AUTO_EXECUTE sets
- Direct codebase reading — `backend/src/pilot_space/ai/infrastructure/cost_tracker.py` — CostTracker.track() signature, existing breakdowns (by_provider, by_agent, by_model)
- Direct codebase reading — `backend/src/pilot_space/infrastructure/database/models/ai_cost_record.py` — AICostRecord fields (confirmed: no operation_type column today)
- Direct codebase reading — `backend/src/pilot_space/infrastructure/database/models/audit_log.py` — audit_log.payload JSONB structure with `before`/`after` keys; all AI fields present
- Direct codebase reading — `backend/src/pilot_space/infrastructure/database/repositories/audit_log_repository.py` — list_filtered() signature (confirmed: no actor_type param today)
- Direct codebase reading — `backend/src/pilot_space/ai/providers/provider_selector.py` — select() signature (no workspace_id param today)
- Direct codebase reading — `backend/src/pilot_space/ai/agents/pilotspace_agent.py` (lines 156-173) — env fallback present at `os.getenv("ANTHROPIC_API_KEY")`
- Direct codebase reading — `backend/src/pilot_space/container/container.py` (lines 341-355) — CostTracker Callable(lambda: None) bug confirmed
- Direct codebase reading — `backend/src/pilot_space/api/v1/routers/ai_approvals.py` — existing endpoints (list, get, resolve); `verify_workspace_admin()` helper
- Direct codebase reading — `backend/src/pilot_space/api/v1/routers/ai_costs.py` — existing summary, by-user, trends endpoints
- Direct codebase reading — `frontend/src/components/layout/sidebar.tsx` — existing AI section nav items; badge pattern to follow
- Direct codebase reading — `frontend/src/features/costs/pages/cost-dashboard-page.tsx` — observer() component; existing tab structure
- Direct codebase reading — `frontend/src/features/settings/pages/audit-settings-page.tsx` — plain React pattern; filter UI; no actor_type filter today
- Direct codebase reading — `backend/src/pilot_space/infrastructure/database/rls.py` — `get_workspace_rls_policy_sql()` template
- Direct codebase reading — `backend/alembic/versions/` — current head is `067_workspace_encryption_and_quota.py`
- Direct codebase reading — `backend/src/pilot_space/main.py` — router mount paths for approvals, costs, audit, workspace_ai_settings

### Secondary (MEDIUM confidence)
- CONTEXT.md (phase decisions document) — design choices for all 7 requirements; includes code context section with integration points
- STATE.md — CostTracker/ApprovalService singleton bug flagged explicitly; BYOK env fallback flagged as "blocking requirement for AIGOV-05"
- CLAUDE.md (project) — RFC 7807 error format requirement; 700-line file limit; MobX+TanStack Query pattern; plain React for settings pages

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified by reading existing source files
- Architecture: HIGH — patterns derived from existing code (Phase 2 AuditLogHook, settings page conventions, RLS template)
- Pitfalls: HIGH — all pitfalls derived from reading actual code (async check_approval_required, Callable(lambda: None) bug, missing actor_type in list_filtered)
- Migration ordering: HIGH — current head confirmed by reading alembic/versions/ directory

**Research date:** 2026-03-08
**Valid until:** 2026-04-08 (stable codebase; no external dependencies on rapidly-changing APIs)
