---
phase: quick-04
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/src/pilot_space/infrastructure/database/models/custom_role.py
  - backend/src/pilot_space/container/container.py
  - backend/src/pilot_space/container/_factories.py
  - backend/tests/unit/test_workspace_service.py
  - backend/tests/routers/test_implement_context_router.py
  - backend/tests/integration/ai/test_content_update_pipeline.py
  - backend/tests/integration/ai/test_note_sync_integration.py
  - backend/tests/unit/ai/sdk/test_approval_waiter.py
  - backend/tests/unit/schemas/test_issue_response_note_links.py
autonomous: true
requirements: [QUICK-04]
must_haves:
  truths:
    - "All pytest unit tests pass (excluding integration tests requiring PostgreSQL)"
    - "No duplicate index errors during SQLite test DB creation"
    - "Container wiring matches actual constructor signatures"
    - "Test fixtures provide all required constructor arguments"
  artifacts:
    - path: "backend/src/pilot_space/infrastructure/database/models/custom_role.py"
      provides: "CustomRole model without duplicate workspace_id index"
    - path: "backend/src/pilot_space/container/container.py"
      provides: "Container wiring with correct kwargs for all services"
  key_links:
    - from: "backend/tests/conftest.py"
      to: "backend/src/pilot_space/infrastructure/database/base.py"
      via: "SQLAlchemy create_all"
      pattern: "create_all"
---

<objective>
Fix all preexisting pytest failures by addressing root causes in production code and test fixtures.

Purpose: Restore green test suite so CI is unblocked and quality gates pass.
Output: All unit tests pass; integration tests requiring PostgreSQL are properly skipped.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@backend/src/pilot_space/infrastructure/database/models/custom_role.py
@backend/src/pilot_space/infrastructure/database/base.py
@backend/src/pilot_space/container/container.py
@backend/src/pilot_space/container/_factories.py
@backend/src/pilot_space/ai/agents/pilotspace_agent.py
@backend/src/pilot_space/application/services/workspace.py
@backend/src/pilot_space/application/services/note/ai_update_service.py
@backend/src/pilot_space/api/v1/dependencies_pilot.py
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix production code causing test DB creation and DI wiring failures</name>
  <files>
    backend/src/pilot_space/infrastructure/database/models/custom_role.py
    backend/src/pilot_space/container/container.py
  </files>
  <action>
**Root cause 1 — Duplicate index (~94 tests):**
`CustomRole.__table_args__` defines `Index("ix_custom_roles_workspace_id", "workspace_id")` but `WorkspaceScopedModel` (base class) already defines `workspace_id` with `index=True` (line 93 of base.py). SQLAlchemy generates two identical indexes, and SQLite fails on the duplicate.

Fix: Remove the explicit `Index("ix_custom_roles_workspace_id", "workspace_id")` from `CustomRole.__table_args__`. The base class already creates this index. Keep the `UniqueConstraint` — only remove the redundant `Index`.

**Root cause 2 — Container wiring `activity_repository` on NoteAIUpdateService:**
`container.py` line 277 passes `activity_repository=InfraContainer.activity_repository` to `NoteAIUpdateService`, but the constructor (ai_update_service.py:91-103) only accepts `session` and `note_repository`. This causes `TypeError` at DI resolution time.

Fix: Remove `activity_repository=InfraContainer.activity_repository` from the `ai_update_note_service` Factory in `container.py` (line 277).

No other production code changes needed — the remaining failures are test fixture issues.
  </action>
  <verify>
    <automated>cd /Users/tindang/workspaces/tind-repo/pilot-space/backend && uv run python -c "from pilot_space.infrastructure.database.models.custom_role import CustomRole; print('CustomRole OK')" && uv run python -c "
from sqlalchemy import create_engine
from pilot_space.infrastructure.database.base import Base
engine = create_engine('sqlite://')
Base.metadata.create_all(engine)
print('Schema creation OK — no duplicate index')
"</automated>
  </verify>
  <done>SQLite test DB creates without errors; container wiring matches NoteAIUpdateService constructor</done>
</task>

<task type="auto">
  <name>Task 2: Fix all broken test fixtures and stale test references</name>
  <files>
    backend/tests/unit/test_workspace_service.py
    backend/tests/routers/test_implement_context_router.py
    backend/tests/integration/ai/test_content_update_pipeline.py
    backend/tests/integration/ai/test_note_sync_integration.py
    backend/tests/unit/ai/sdk/test_approval_waiter.py
    backend/tests/unit/schemas/test_issue_response_note_links.py
  </files>
  <action>
Fix each test file's root cause. Review the test, understand what it is testing, and fix appropriately:

**Fix 1 — WorkspaceService missing `label_repo` (~9 tests):**
In `tests/unit/test_workspace_service.py`, the `workspace_service` fixture creates `WorkspaceService(workspace_repo, user_repo, invitation_repo)` but the constructor now requires `label_repo: LabelRepository`. Add `label_repo=AsyncMock()` to the fixture.

**Fix 2 — `_get_implement_context_service` import path (~14 tests):**
In `tests/routers/test_implement_context_router.py`, the test imports `from pilot_space.api.v1.dependencies import _get_implement_context_service` but the function lives in `pilot_space.api.v1.dependencies_pilot`. Fix the import path and update `dependency_overrides` key accordingly.

**Fix 3 — `skill_registry` kwarg in PilotSpaceAgent test mocks (~30 tests):**
In `tests/integration/ai/test_content_update_pipeline.py` and `tests/integration/ai/test_note_sync_integration.py`, test fixtures pass `"skill_registry": MagicMock()` when constructing `PilotSpaceAgent`. The constructor no longer accepts `skill_registry` (skills are now loaded from filesystem per DD-086). Remove `"skill_registry"` from all mock kwargs in these files.

**Fix 4 — `NoteIssueLinkBriefSchema` validation errors (~11 tests):**
In `tests/unit/schemas/test_issue_response_note_links.py`, review the schema `NoteIssueLinkBriefSchema` fields (`id`, `note_id`, `issue_id`, `link_type`, `note_title`) and ensure test data provides all required fields with correct types.

**Fix 5 — `test_approval_waiter.py` assertion failures:**
In `tests/unit/ai/sdk/test_approval_waiter.py`, the `test_update_issue_success` test expects `result["status"] == "executed"` but gets `"skipped"`. Read the `ApprovalActionExecutor.execute()` implementation to understand the current behavior, then fix the test expectation or the mock setup so the test validates the actual contract.

**General approach for each file:**
1. Read the test file to understand intent
2. Read the production code being tested to understand current contract
3. Fix the test to match the current production contract
4. Do NOT change production code to match stale tests
  </action>
  <verify>
    <automated>cd /Users/tindang/workspaces/tind-repo/pilot-space/backend && uv run pytest tests/unit/ -x -q --timeout=30 2>&1 | tail -20</automated>
  </verify>
  <done>All unit tests pass. No TypeError or ImportError from stale fixtures.</done>
</task>

<task type="auto">
  <name>Task 3: Verify full test suite and handle remaining edge cases</name>
  <files>
    backend/tests/conftest.py
  </files>
  <action>
Run the full pytest suite (excluding integration tests needing PostgreSQL) and fix any remaining failures:

1. Run `cd backend && uv run pytest tests/unit/ tests/routers/ -q --timeout=60` to see remaining failures
2. For each remaining failure, diagnose the root cause:
   - If constructor signature mismatch: fix the test fixture to match current constructor
   - If missing import: fix import path
   - If schema validation error: provide required fields in test data
   - If assertion mismatch: read production code and fix test expectation
3. For tests requiring PostgreSQL (port 15432): verify they are in `tests/integration/` or `tests/security/` and marked with `@pytest.mark.integration` or similar. If unmarked tests accidentally need PostgreSQL, add `@pytest.mark.skipif` with appropriate condition.
4. For 429 rate limit errors in tests: check if `RateLimitMiddleware` is active in test client setup. If the test `app` fixture adds middleware, ensure `enabled=False` is passed or the middleware is excluded for test runs.

Run the quality gate: `make quality-gates-backend` (or the subset: `cd backend && uv run ruff check && uv run pyright && uv run pytest tests/unit/ tests/routers/ -q`)
  </action>
  <verify>
    <automated>cd /Users/tindang/workspaces/tind-repo/pilot-space/backend && uv run pytest tests/unit/ tests/routers/ -q --timeout=60 2>&1 | tail -5</automated>
  </verify>
  <done>All non-integration tests pass. No preexisting failures remain in unit and router tests.</done>
</task>

</tasks>

<verification>
1. `cd backend && uv run pytest tests/unit/ -q --timeout=60` — all pass
2. `cd backend && uv run pytest tests/routers/ -q --timeout=60` — all pass
3. `cd backend && uv run ruff check` — no lint errors introduced
4. `cd backend && uv run pyright` — no type errors introduced
</verification>

<success_criteria>
- Zero pytest failures in unit and router tests
- No production behavior changes (only removing dead code: duplicate index, stale DI kwarg)
- Test fixtures match current production constructors
- Quality gates pass
</success_criteria>

<output>
After completion, create `.planning/quick/4-checkout-new-branch-from-main-then-fix-a/004-SUMMARY.md`
</output>
