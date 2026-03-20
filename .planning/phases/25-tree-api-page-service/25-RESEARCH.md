# Phase 25: Tree API & Page Service - Research

**Researched:** 2026-03-12
**Domain:** FastAPI CQRS-lite service + SQLAlchemy adjacency-list tree operations
**Confidence:** HIGH

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TREE-02 | User can move a page to a different parent within the same project (re-parent) | MovePageService handles parent reassignment, depth recalculation for subtree, and depth-limit enforcement |
| TREE-03 | User can reorder pages among siblings via position field | ReorderPageService shifts sibling positions using gap arithmetic on the existing `position` (gap-1000) column |
</phase_requirements>

---

## Summary

Phase 25 adds two tree-mutation services on top of the Phase 24 schema (`parent_id`, `depth`, `position` on `notes`). Both operations require careful handling of the adjacency-list invariants already enforced by DB constraints: depth in [0,2] (`chk_notes_depth_range`) and no self-parent (`chk_notes_no_self_parent`).

**Move (re-parent)** is the more complex of the two. It must (a) validate the new parent exists and belongs to the same project/workspace, (b) verify that placing the node under the new parent would not push it or any of its children beyond depth 2, (c) update `parent_id` and `depth` on the moved node, and (d) cascade the depth delta to all descendants. Because the ORM has no `children` relationship on `Note` (deliberate Phase 24 decision to avoid lazy-load N+1), all descendant queries must be explicit `WHERE parent_id = ?` fetches or recursive CTEs.

**Reorder (position)** adjusts a page's `position` among its siblings. The migration used `ROW_NUMBER() * 1000` gap positioning, so a simple approach is to compute a new position as the midpoint between the two neighbors or re-sequence if no gap remains. Because the depth max is 2 and project trees are small (<100 siblings expected), full sibling re-sequence on gap exhaustion is acceptable.

**Primary recommendation:** Two new services (`MovePageService`, `ReorderPageService`) following the frozen-dataclass payload pattern, two new endpoints (`POST /{workspace_id}/notes/{note_id}/move`, `POST /{workspace_id}/notes/{note_id}/reorder`) on the existing `workspace_notes` router, tree queries added to `NoteRepository`, and a Pydantic schema for each request. DI wiring follows the established `providers.Factory` pattern in `container.py`.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SQLAlchemy async | already in project | Tree queries (select children, CTE descendants) | Project standard |
| FastAPI | already in project | REST endpoints for move/reorder | Project standard |
| Pydantic v2 | already in project | Request/response schemas with validation | Project standard |
| dependency-injector | already in project | DI wiring for new services | Project standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| sqlalchemy `text()` + `with_recursive` | stdlib | Recursive CTE for descendant fetch | Move service needs all descendants to cascade depth |
| pytest + pytest-asyncio | already in project | Unit and integration tests | Coverage gate at 80% with branch=true |

**Installation:** No new dependencies. All libraries already in `backend/pyproject.toml`.

---

## Architecture Patterns

### Recommended Project Structure

New files follow the established note-service layout exactly:

```
backend/src/pilot_space/
  application/services/note/
    move_page_service.py          # New: MovePageService
    reorder_page_service.py       # New: ReorderPageService
  infrastructure/database/repositories/
    note_repository.py            # Modified: add tree query methods
  api/v1/
    schemas/note.py               # Modified: add MovePageRequest, ReorderPageRequest
    routers/workspace_notes.py    # Modified: add move/reorder endpoints
    dependencies.py               # Modified: add MovePageServiceDep, ReorderPageServiceDep
  container/
    container.py                  # Modified: register move/reorder service factories

backend/tests/unit/services/
  test_move_page_service.py       # New: unit tests
  test_reorder_page_service.py    # New: unit tests
backend/tests/unit/repositories/
  test_note_repository_tree.py    # New: repository query tests
```

### Pattern 1: Frozen-Dataclass Payload + Result

Every existing service uses `@dataclass(frozen=True, slots=True)` for payload and result. Phase 25 must follow the same convention:

```python
# Source: application/services/note/create_note_service.py
@dataclass(frozen=True, slots=True)
class MovePagePayload:
    note_id: UUID
    new_parent_id: UUID | None   # None = promote to root
    workspace_id: UUID
    actor_id: UUID

@dataclass(frozen=True, slots=True)
class MovePageResult:
    note: Note
    depth_delta: int             # for logging/response
```

### Pattern 2: NoteRepository Tree Methods (explicit queries, no lazy-load)

No ORM `children` relationship exists on `Note` (enforced Phase 24 decision). All tree queries must be explicit:

```python
# Get direct children, ordered by position
async def get_children(self, parent_id: UUID) -> Sequence[Note]:
    query = (
        select(Note)
        .where(Note.parent_id == parent_id, Note.is_deleted == False)
        .order_by(Note.position.asc())
    )
    result = await self.session.execute(query)
    return result.scalars().all()

# Get all descendants using recursive CTE (PostgreSQL)
async def get_descendants(self, note_id: UUID) -> Sequence[Note]:
    from sqlalchemy import text
    cte_sql = text("""
        WITH RECURSIVE descendants AS (
            SELECT id, parent_id, depth, position FROM notes
            WHERE parent_id = :root_id AND is_deleted = false
            UNION ALL
            SELECT n.id, n.parent_id, n.depth, n.position FROM notes n
            JOIN descendants d ON n.parent_id = d.id
            WHERE n.is_deleted = false
        )
        SELECT * FROM descendants
    """).bindparams(root_id=note_id)
    result = await self.session.execute(cte_sql)
    return result.mappings().all()

# Get siblings (other children of same parent), ordered by position
async def get_siblings(
    self,
    parent_id: UUID | None,
    workspace_id: UUID,
    project_id: UUID | None,
    exclude_note_id: UUID,
) -> Sequence[Note]:
    query = (
        select(Note)
        .where(
            Note.parent_id == parent_id,
            Note.workspace_id == workspace_id,
            Note.project_id == project_id,
            Note.id != exclude_note_id,
            Note.is_deleted == False,
        )
        .order_by(Note.position.asc())
    )
    result = await self.session.execute(query)
    return result.scalars().all()
```

### Pattern 3: Move Service Logic

```python
class MovePageService:
    async def execute(self, payload: MovePagePayload) -> MovePageResult:
        note = await self._note_repo.get_by_id(payload.note_id)
        if not note or note.workspace_id != payload.workspace_id:
            raise ValueError("Note not found")

        new_parent_depth = 0  # root
        if payload.new_parent_id is not None:
            new_parent = await self._note_repo.get_by_id(payload.new_parent_id)
            if not new_parent or new_parent.workspace_id != payload.workspace_id:
                raise ValueError("Target parent not found")
            if new_parent.project_id != note.project_id:
                raise ValueError("Cannot move page to a different project")
            new_parent_depth = new_parent.depth

        new_depth = new_parent_depth + 1 if payload.new_parent_id else 0

        # Depth-limit check: note itself
        if new_depth > 2:
            raise ValueError("Move would exceed the 3-level depth limit")

        # Depth-limit check: deepest descendant
        descendants = await self._note_repo.get_descendants(payload.note_id)
        if descendants:
            max_descendant_depth_offset = max(d["depth"] - note.depth for d in descendants)
            if new_depth + max_descendant_depth_offset > 2:
                raise ValueError(
                    "Move would push a descendant beyond the 3-level depth limit"
                )

        # Apply move
        depth_delta = new_depth - note.depth
        note.parent_id = payload.new_parent_id
        note.depth = new_depth
        # Assign tail position among new siblings
        note.position = await self._compute_tail_position(payload.new_parent_id, payload.workspace_id, note.project_id)
        await self._session.flush()

        # Cascade depth delta to descendants
        if descendants and depth_delta != 0:
            for desc in descendants:
                await self._session.execute(
                    update(Note)
                    .where(Note.id == desc["id"])
                    .values(depth=desc["depth"] + depth_delta)
                )
            await self._session.flush()

        await self._session.refresh(note)
        return MovePageResult(note=note, depth_delta=depth_delta)
```

### Pattern 4: Reorder Service Logic

```python
class ReorderPageService:
    async def execute(self, payload: ReorderPagePayload) -> ReorderPageResult:
        note = await self._note_repo.get_by_id(payload.note_id)
        if not note or note.workspace_id != payload.workspace_id:
            raise ValueError("Note not found")

        siblings = await self._note_repo.get_siblings(
            note.parent_id, payload.workspace_id, note.project_id, note.id
        )
        # siblings is ordered by position asc, insert_after_id is the anchor
        # If insert_after_id is None, prepend (position = first_sibling.position // 2 or 500)
        # Compute midpoint; if gap < 2, re-sequence all siblings with gap 1000
        new_position = self._compute_insert_position(siblings, payload.insert_after_id)
        note.position = new_position
        await self._session.flush()
        await self._session.refresh(note)
        return ReorderPageResult(note=note)
```

### Pattern 5: API Endpoints (empty-string root pattern)

```python
# Source: project CLAUDE.md + existing workspace_notes.py pattern
@router.post(
    "/{workspace_id}/notes/{note_id}/move",
    response_model=NoteResponse,
    tags=["workspace-notes"],
)
async def move_page(
    workspace_id: WorkspaceIdOrSlug,
    note_id: NoteIdPath,
    body: MovePageRequest,
    current_user_id: CurrentUserId,
    session: SessionDep,
    move_service: MovePageServiceDep,
    workspace_repo: WorkspaceRepositoryDep,
) -> NoteResponse: ...

@router.post(
    "/{workspace_id}/notes/{note_id}/reorder",
    response_model=NoteResponse,
    tags=["workspace-notes"],
)
async def reorder_page(...) -> NoteResponse: ...
```

### Pattern 6: DI Registration

```python
# container.py additions
move_page_service = providers.Factory(
    MovePageService,
    session=providers.Callable(get_current_session),
    note_repository=InfraContainer.note_repository,
)

reorder_page_service = providers.Factory(
    ReorderPageService,
    session=providers.Callable(get_current_session),
    note_repository=InfraContainer.note_repository,
)
```

```python
# dependencies.py additions (follow exact pattern for other note services)
@inject
def _get_move_page_service(
    svc: MovePageService = Depends(Provide[Container.move_page_service]),
) -> MovePageService:
    return svc

MovePageServiceDep = Annotated[MovePageService, Depends(_get_move_page_service)]
```

### Anti-Patterns to Avoid

- **Lazy-loading children via ORM relationship**: Phase 24 deliberately omitted a `children` relationship to prevent N+1. Use explicit `get_children()` / `get_descendants()` repository methods.
- **SQLAlchemy `update()` in a loop without flush**: Execute bulk depth updates as a single `UPDATE ... WHERE id IN (...)` or use `session.execute(update(Note).where(Note.id.in_([...])).values(...))` — not individual ORM attribute sets on detached objects.
- **Using `"/"` as route suffix**: Per CLAUDE.md FastAPI routing gotcha — use `""` for collection roots. For sub-resources like `/move`, the leading slash is in the path string, not the prefix; this is fine.
- **Not calling `set_rls_context()` in repository queries**: All workspace-scoped queries must call the RLS context setter before querying. The `NoteRepository` session has RLS context set by the DI session provider; do not bypass.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Recursive descendant fetch | Custom Python BFS/DFS loop | PostgreSQL recursive CTE via `text()` | One round-trip vs. O(depth) queries; max depth 2 means at most 3 levels but CTE is correct regardless |
| Position gap arithmetic | Custom linked-list logic | Simple midpoint with re-sequence fallback | Position is an integer; midpoint between neighbors is sufficient; re-sequence all siblings when gap < 2 |
| Depth validation | Custom tree walker | Use `max descendant depth offset + new_depth <= 2` check | Simpler than traversal; works with adjacency list |
| Auth / workspace check | Inline permission logic in service | Existing `note.workspace_id != payload.workspace_id` guard pattern | Consistent with all other note services |

---

## Common Pitfalls

### Pitfall 1: Cross-Project Move (Must Reject)

**What goes wrong:** Moving a note to a parent in a different `project_id` silently corrupts the tree — the note appears under a new parent but `project_id` is stale, breaking all project-tree queries.

**Why it happens:** The adjacency list stores only `parent_id`; `project_id` is a separate FK. They can become inconsistent.

**How to avoid:** In `MovePageService`, assert `new_parent.project_id == note.project_id` before any mutation. Return HTTP 422 with a clear error message.

**Warning signs:** Note appears in one project's tree but is returned by another project's list query.

---

### Pitfall 2: Depth Limit Not Checked on Descendants

**What goes wrong:** Moving a depth-1 node with a depth-2 child under another depth-1 node would push the grandchild to depth 3, violating `chk_notes_depth_range`. The DB constraint catches this but raises an IntegrityError, not a useful user message.

**Why it happens:** Checking only the moved node's new depth misses descendant depth propagation.

**How to avoid:** Compute `max_descendant_relative_depth = max(d.depth - note.depth for d in descendants)`. Assert `new_depth + max_descendant_relative_depth <= 2` before mutating.

**Warning signs:** `IntegrityError: new row for relation "notes" violates check constraint "chk_notes_depth_range"`.

---

### Pitfall 3: Depth Delta Not Cascaded to Descendants

**What goes wrong:** Moving a subtree updates `parent_id` and `depth` on the root node but leaves all descendants with stale `depth` values. Sidebar rendering and depth-limit checks become wrong for the entire subtree.

**Why it happens:** No ORM cascade on `depth`; must be done explicitly.

**How to avoid:** After computing `depth_delta`, execute bulk update `UPDATE notes SET depth = depth + :delta WHERE id IN (:desc_ids)` in a single statement.

---

### Pitfall 4: Position Gap Exhaustion

**What goes wrong:** After many reorders, sibling positions collapse to consecutive integers. The midpoint formula `(a + b) // 2` yields `a` or `b` (no room), causing reorder to silently no-op or place nodes at the same position.

**Why it happens:** Integer gap shrinks to zero with repeated midpoint splits.

**How to avoid:** Check if computed new position equals an existing sibling's position. If so, trigger full re-sequence: assign positions `1000, 2000, 3000...` to all siblings ordered by current position, then insert the moved node at the correct slot.

---

### Pitfall 5: Missing `session: SessionDep` in New Route Signatures

**What goes wrong:** `get_current_session()` raises `RuntimeError: No session in current context` on the first DB access.

**Why it happens:** Documented CLAUDE.md gotcha — every route using DI services must declare `session: SessionDep`.

**How to avoid:** Both new endpoints (`move_page`, `reorder_page`) must include `session: SessionDep` in their signature.

---

### Pitfall 6: SQLite in Unit Tests Cannot Run Recursive CTEs

**What goes wrong:** `WITH RECURSIVE` is not supported in SQLite in-memory test databases used by `tests/unit/services/conftest.py`.

**Why it happens:** `get_descendants()` uses a recursive CTE that is PostgreSQL-compatible but not SQLite-compatible.

**How to avoid:** Unit tests for `MovePageService` must mock `note_repo.get_descendants()` rather than hitting a real DB. Integration tests that need the real CTE must set `TEST_DATABASE_URL` to PostgreSQL. The `conftest.py` pattern for `tests/unit/services/` uses a SQLite DDL approach — follow it but mock the CTE method.

Alternatively: for the `get_descendants` repository method itself, test it in `tests/unit/repositories/test_note_repository_tree.py` using the full PostgreSQL `conftest.py` (top-level `tests/conftest.py` uses aiosqlite by default, so use `db_session_committed` with `TEST_DATABASE_URL`).

---

### Pitfall 7: Stale `project_id` on Personal Pages

**What goes wrong:** Personal pages have `project_id = NULL`. The cross-project check `new_parent.project_id == note.project_id` would pass if both are `NULL`, allowing mixing of workspace/owner contexts.

**Why it happens:** `None == None` is `True` in Python.

**How to avoid:** For personal pages (`project_id IS NULL`), additionally assert `new_parent.owner_id == note.owner_id`. Or simply disallow re-parenting across owner boundaries in the same check.

---

## Code Examples

### Bulk Depth Update (Single Statement)

```python
# Source: SQLAlchemy Core docs + project pattern from update_note_service.py
from sqlalchemy import update

await self._session.execute(
    update(Note)
    .where(Note.id.in_(desc_ids))
    .values(depth=Note.depth + depth_delta)
)
await self._session.flush()
```

### HTTP 422 Validation Error Pattern

```python
# Source: existing workspace_notes.py except ValueError -> HTTP 422
try:
    result = await move_service.execute(payload)
except ValueError as e:
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=str(e),
    ) from e
```

### Midpoint Position Computation

```python
def _compute_insert_position(
    siblings: Sequence[Note],
    insert_after_id: UUID | None,
) -> int:
    """Return position for note inserted after insert_after_id among siblings."""
    if not siblings:
        return 1000
    if insert_after_id is None:
        # Prepend: half of first sibling's position, floor 1
        first_pos = siblings[0].position
        return max(1, first_pos // 2)
    # Find anchor
    positions = [s.position for s in siblings]
    ids = [s.id for s in siblings]
    try:
        idx = ids.index(insert_after_id)
    except ValueError:
        # Anchor not found, append
        return siblings[-1].position + 1000
    if idx == len(siblings) - 1:
        return siblings[-1].position + 1000  # append
    mid = (positions[idx] + positions[idx + 1]) // 2
    if mid == positions[idx] or mid == positions[idx + 1]:
        # Gap exhausted — caller must re-sequence
        return -1  # sentinel; service triggers re-sequence
    return mid
```

### Pydantic Request Schemas

```python
class MovePageRequest(BaseSchema):
    new_parent_id: UUID | None = Field(
        default=None,
        description="Target parent note ID. None promotes to tree root."
    )

class ReorderPageRequest(BaseSchema):
    insert_after_id: UUID | None = Field(
        default=None,
        description="Sibling note ID to insert after. None prepends."
    )
```

### NoteResponse Extension for Tree Fields

The existing `NoteResponse` schema does not expose `parent_id`, `depth`, or `position`. The move/reorder endpoints should return an extended `PageTreeResponse` (or add the tree fields to `NoteResponse`) so callers can confirm the new position:

```python
class PageTreeResponse(NoteResponse):
    parent_id: UUID | None = Field(default=None)
    depth: int = Field(default=0)
    position: int = Field(default=0)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Workspace-level notes (flat) | Project pages + personal pages (tree) | Phase 24 (migration 079) | Tree API now required |
| No ORM `children` relationship (deliberate) | Explicit repository queries / CTEs | Phase 24 decision | Phase 25 must use explicit queries, not `note.children` |
| Notes router (`workspace_notes.py`) has no tree endpoints | Add `move` and `reorder` endpoints | Phase 25 | New endpoints on existing router |

**Deprecated/outdated:**
- Workspace-level note listing without `parent_id` filter: still works but Phase 26 sidebar will use tree queries.

---

## Open Questions

1. **Personal page re-parenting scope**
   - What we know: Personal pages have `project_id = NULL`, scoped by `owner_id`.
   - What's unclear: Should a user be able to nest a personal page under another personal page? The depth model supports it (same owner, `project_id IS NULL`), but TREE-02 says "within the same project". Does "same project" mean personal-page trees are also in-scope?
   - Recommendation: Implement only project-page re-parenting for TREE-02/TREE-03. Personal page tree mutations are not required by the current requirements. Guard with `if note.project_id is None: raise ValueError("Personal page re-parenting not yet supported")`.

2. **GET tree endpoint**
   - What we know: Phase 25 is move + reorder only. No GET tree endpoint is listed in TREE-02/TREE-03.
   - What's unclear: Does Phase 26 (sidebar) require a dedicated tree-fetch endpoint, or can it reuse the flat note list with `parent_id` filtering?
   - Recommendation: Phase 25 adds `NoteRepository.get_children()` and `NoteRepository.get_descendants()` as repository utilities. Phase 26 adds the API endpoint. Do not add a GET tree endpoint in Phase 25.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest + pytest-asyncio |
| Config file | `backend/pyproject.toml` (`[tool.pytest.ini_options]`) |
| Quick run command | `cd backend && uv run pytest tests/unit/services/test_move_page_service.py tests/unit/services/test_reorder_page_service.py -x -q` |
| Full suite command | `cd backend && uv run pytest --cov` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TREE-02 | Move page to new parent updates `parent_id` and `depth` | unit | `uv run pytest tests/unit/services/test_move_page_service.py -x` | Wave 0 |
| TREE-02 | Moving with max depth exceeded returns error | unit | `uv run pytest tests/unit/services/test_move_page_service.py::test_move_exceeds_depth -x` | Wave 0 |
| TREE-02 | Moving to different project returns error | unit | `uv run pytest tests/unit/services/test_move_page_service.py::test_move_cross_project -x` | Wave 0 |
| TREE-02 | Descendants get depth delta cascaded | unit | `uv run pytest tests/unit/services/test_move_page_service.py::test_move_cascades_depth -x` | Wave 0 |
| TREE-03 | Reorder page persists new position | unit | `uv run pytest tests/unit/services/test_reorder_page_service.py -x` | Wave 0 |
| TREE-03 | Reorder at head positions before first sibling | unit | `uv run pytest tests/unit/services/test_reorder_page_service.py::test_reorder_prepend -x` | Wave 0 |
| TREE-03 | Reorder at tail appends after last sibling | unit | `uv run pytest tests/unit/services/test_reorder_page_service.py::test_reorder_append -x` | Wave 0 |
| TREE-03 | Position gap exhaustion triggers re-sequence | unit | `uv run pytest tests/unit/services/test_reorder_page_service.py::test_reorder_gap_exhaustion -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && uv run pytest tests/unit/services/test_move_page_service.py tests/unit/services/test_reorder_page_service.py -x -q`
- **Per wave merge:** `cd backend && uv run pytest --cov`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/tests/unit/services/test_move_page_service.py` — covers TREE-02
- [ ] `backend/tests/unit/services/test_reorder_page_service.py` — covers TREE-03
- [ ] SQLite DDL additions in `backend/tests/unit/services/conftest.py` — `notes` table needs `parent_id`, `depth`, `position` columns added to `_CREATE_TABLES_SQL`

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `backend/src/pilot_space/infrastructure/database/models/note.py` — Phase 24 ORM with `parent_id`, `depth`, `position`, constraints
- Direct codebase inspection: `backend/alembic/versions/079_add_page_tree_columns.py` — DB schema with indexes and RLS
- Direct codebase inspection: `backend/src/pilot_space/application/services/note/create_note_service.py` — frozen-dataclass payload pattern
- Direct codebase inspection: `backend/src/pilot_space/api/v1/routers/workspace_notes.py` — existing note router patterns
- Direct codebase inspection: `backend/src/pilot_space/infrastructure/database/repositories/note_repository.py` — BaseRepository extension pattern
- Direct codebase inspection: `backend/src/pilot_space/container/container.py` — `providers.Factory` DI registration
- Direct codebase inspection: `backend/tests/unit/services/conftest.py` — SQLite in-memory test pattern
- Direct codebase inspection: `.planning/STATE.md` — "No ORM parent/children relationship on Note" decision

### Secondary (MEDIUM confidence)
- Phase 24 SUMMARY.md — confirmed `ondelete=SET NULL` on `parent_id`, position gap of 1000, personal page RLS

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in project, verified from source
- Architecture: HIGH — patterns directly observed from equivalent services in the codebase
- Pitfalls: HIGH — derived from explicit Phase 24 decisions and documented CLAUDE.md gotchas

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (stable patterns, no external dependencies)
