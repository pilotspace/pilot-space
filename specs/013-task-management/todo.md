# 013 Task Management — Remaining Architectural Fixes

**Branch**: `feat/task-management`
**Context**: Review found 8 issues, 8 fixed. These 4 deferred items require separate PRs.

---

## C-1: Refactor TaskService to CQRS-lite per-operation services

**Priority**: Critical (pattern violation)
**Effort**: 2-3h
**Why**: DD-064 requires one service class per operation (`Service.execute(Payload) -> Result`). Current `TaskService` is a monolithic class with 9 methods — inconsistent with every other service in the codebase.

**Current** (`task_service.py`):
```python
class TaskService:
    async def list_tasks(...)
    async def create_task(...)
    async def update_task(...)
    async def delete_task(...)
    async def update_status(...)
    async def reorder_tasks(...)
    async def export_context(...)
    async def create_tasks_from_decomposition(...)
```

**Target** — split into 8 service files under `application/services/task/`:
```
task/
├── __init__.py
├── create_task_service.py        # CreateTaskService.execute(CreateTaskPayload) -> CreateTaskResult
├── update_task_service.py        # UpdateTaskService.execute(UpdateTaskPayload) -> UpdateTaskResult
├── delete_task_service.py        # DeleteTaskService.execute(DeleteTaskPayload) -> None
├── list_tasks_service.py         # ListTasksService.execute(ListTasksPayload) -> ListTasksResult
├── update_task_status_service.py # UpdateTaskStatusService.execute(...) -> UpdateTaskStatusResult
├── reorder_tasks_service.py      # ReorderTasksService.execute(...) -> ReorderTasksResult
├── export_context_service.py     # ExportContextService.execute(...) -> ExportContextResult
└── decompose_tasks_service.py    # DecomposeTasksService.execute(...) -> DecomposeTasksResult
```

**Steps**:
1. Create `application/services/task/` directory
2. Extract each method into its own service class with `@dataclass` payload and result
3. Update DI container — replace single `TaskService` factory with 8 individual factories
4. Update `api/v1/dependencies.py` — add 8 type aliases (e.g., `CreateTaskServiceDep`)
5. Update `workspace_tasks.py` router — inject per-endpoint services instead of single `TaskServiceDep`
6. Update tests — adjust mocks to match new service classes
7. Delete `task_service.py`

**Files touched**: ~15 (8 new services, container, dependencies, router, tests)

---

## H-6: Move task data from MobX to TanStack Query

**Priority**: High (DD-065 violation)
**Effort**: 1-2h
**Why**: Project golden rule — "Store API responses in TanStack Query. Store UI state in MobX. Never store API data in MobX stores." `TaskStore.tasksByIssue` stores full `Task[]` arrays from the API.

**Current** (`TaskStore.ts`):
```typescript
class TaskStore {
  tasksByIssue: Map<string, Task[]> = new Map();  // ← server data in MobX
  isLoading = false;
  isDecomposing = false;
  error: string | null = null;
}
```

**Target** — TanStack Query hooks + minimal MobX:

```typescript
// hooks/use-tasks.ts (NEW)
export function useTasks(workspaceId: string, issueId: string) {
  return useQuery({
    queryKey: ['tasks', workspaceId, issueId],
    queryFn: () => tasksApi.list(workspaceId, issueId),
    staleTime: 30_000,
    enabled: !!workspaceId && !!issueId,
  });
}

// hooks/use-create-task.ts (NEW) — with optimistic update
// hooks/use-update-task.ts (NEW)
// hooks/use-delete-task.ts (NEW)
// hooks/use-reorder-tasks.ts (NEW)
// hooks/use-decompose-tasks.ts (NEW)

// TaskStore.ts — reduced to UI-only state
class TaskStore {
  editingTaskId: string | null = null;
  dragIndex: number | null = null;
  dragOverIndex: number | null = null;
}
```

**Steps**:
1. Create `features/issues/hooks/use-tasks.ts` with `useTasks` query hook
2. Create mutation hooks (`use-create-task.ts`, `use-update-task-status.ts`, etc.)
3. Add optimistic updates with snapshot+rollback pattern (match `use-update-issue.ts`)
4. Reduce `TaskStore` to UI-only state (editing, drag, decomposing flag)
5. Update `ai-tasks-section.tsx` to use query hooks instead of `taskStore.getTasksForIssue()`
6. Update tests to mock TanStack Query instead of MobX store

**Files touched**: ~10 (6 new hooks, reduced TaskStore, updated component, updated tests)

---

## H-2: Remove workspace_id from TaskResponse

**Priority**: Medium (consistency)
**Effort**: 15 min

**Why**: `TaskResponse` exposes `workspace_id: UUID` to the client. Other responses (`IssueResponse`) don't expose it — workspace is inferred from route context. Leaking tenant scoping is unnecessary.

**Steps**:
1. Remove `workspace_id` from `TaskResponse` schema
2. Remove from `from_task()` mapping
3. Remove from frontend `Task` type
4. Update tests

---

## H-3: Extract _resolve_workspace to shared dependency

**Priority**: Medium (DRY)
**Effort**: 30 min

**Why**: `_resolve_workspace()` in `workspace_tasks.py` duplicates workspace resolution logic. Other routers likely have similar patterns.

**Steps**:
1. Check existing workspace resolution in `dependencies.py` or other routers
2. Extract to shared utility (e.g., `ResolvedWorkspaceDep` Annotated type)
3. Replace local `_resolve_workspace` in `workspace_tasks.py`
4. Consider applying to other routers that duplicate this pattern

---

## Execution Order

```
C-1 (CQRS-lite refactor)  →  H-6 (TanStack migration)  →  H-2 + H-3 (cleanup)
         ↑ do first                    ↑ depends on C-1          ↑ independent
```

C-1 should go first because H-6 will touch the same files (hooks need to call services).
H-2 and H-3 are independent cleanups, can be done in any order.
