# Phase 24: Page Tree Data Model - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Add tree columns (`parent_id`, `depth`, `position`) to the existing `notes` table, classify notes into project pages vs personal pages, migrate existing data, and update RLS policies to enforce personal page owner-only visibility. No new tables. No API changes (Phase 25). No frontend changes (Phase 26).

</domain>

<decisions>
## Implementation Decisions

### Data Migration Strategy
- All existing notes with `project_id` set become project pages: assign `depth=0`, `parent_id=NULL`, `position` assigned sequentially by `created_at` within each project (position = row_number * 1000)
- All existing notes without `project_id` become personal pages: `owner_id` already NOT NULL on the model, so every note has a creator. Set `depth=0`, `parent_id=NULL`, `position` assigned sequentially by `created_at` per owner within workspace
- No orphan risk: `owner_id` is NOT NULL with CASCADE on delete — every note has a valid creator
- Migration is a single `UPDATE` statement per category (project pages, personal pages) — no row-by-row processing
- After migration, workspace-level notes (project_id NULL + not classified as personal) should not exist. The migration covers all rows: if project_id is set → project page; if project_id is NULL → personal page (owner = existing owner_id)

### RLS Policy Design
- **Replace** the existing single `notes_workspace_member` policy with two policies:
  1. `notes_project_page_policy` — project pages (`project_id IS NOT NULL`): visible to all workspace members (same as current behavior). Uses existing workspace_members join.
  2. `notes_personal_page_policy` — personal pages (`project_id IS NULL`): visible ONLY to `owner_id = current_setting('app.current_user_id')::uuid`
- **Service role bypass** policy retained for backend operations
- No role-based differentiation within project pages (guests see all project pages if they're workspace members — existing RBAC controls workspace access, not page-level access). Per-page ACL is explicitly out of scope per REQUIREMENTS.md
- DROP old policy + CREATE new policies in a single transaction to avoid a window of no protection

### Position Field Semantics
- **Integer with gaps**: positions assigned as multiples of 1000 (1000, 2000, 3000...)
- Reason: allows easy insertion between siblings without rebalancing (insert between 1000 and 2000 → use 1500). Phase 25's reorder API benefits from this
- When gaps exhaust (position collision), Phase 25's reorder endpoint will do a full rebalance of siblings. This phase only sets initial positions.
- Position is per-parent: siblings share the same `parent_id` (or NULL for root pages) and are ordered by `position` ASC
- Column type: `INTEGER NOT NULL DEFAULT 0` with server_default

### Soft-Delete + Tree Integrity
- **Cascade soft-delete to children**: when a parent page is soft-deleted (`is_deleted=true`), all descendant pages are also soft-deleted. This prevents orphaned visible pages in the tree
- Enforcement: application-level (in the service layer, Phase 25), not DB trigger. Reason: soft-delete is already application-level (`is_deleted` flag, not actual DELETE), and recursive CTE triggers add complexity without benefit for 3-level max depth
- `parent_id` FK constraint uses `ON DELETE SET NULL` — if a parent is hard-deleted (which only happens via data retention purge), children become root pages rather than being destroyed. This is a safety net, not normal flow.
- CHECK constraint on `depth`: `CHECK (depth >= 0 AND depth <= 2)` — enforced at DB level, cannot be bypassed
- CHECK constraint on self-reference: `CHECK (parent_id != id)` — page cannot be its own parent
- No CHECK for circular references beyond self (3-level max + parent_id validation in service layer is sufficient)

### Column Additions to `notes` Table
- `parent_id UUID NULL` — FK to `notes.id`, ON DELETE SET NULL. NULL means root page.
- `depth INTEGER NOT NULL DEFAULT 0` — CHECK (depth >= 0 AND depth <= 2). 0=root, 1=child, 2=grandchild.
- `position INTEGER NOT NULL DEFAULT 0` — ordering among siblings. server_default=0.

### Index Strategy
- `ix_notes_parent_id` on `parent_id` — tree traversal queries
- `ix_notes_parent_position` on `(parent_id, position)` — sibling ordering queries
- `ix_notes_depth` on `depth` — filter by tree level
- `ix_notes_owner_workspace` on `(owner_id, workspace_id)` — personal pages listing (used by new RLS policy)

### Claude's Discretion
- Exact migration revision number (next after 078)
- Whether to add a `page_type` computed/stored column or rely on `project_id IS NULL` check
- Alembic migration internal structure (single file vs split)

</decisions>

<specifics>
## Specific Ideas

- Position gaps of 1000 match the pattern used by Linear and Notion for fractional-free integer ordering
- The 3-level depth limit (0-2) maps to: Project > Section > Page > Sub-page as described in TREE-01
- Personal pages should feel like "my drafts" — private by default, no workspace visibility

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Note` model (`backend/src/pilot_space/infrastructure/database/models/note.py`): already has `owner_id` (NOT NULL) and `project_id` (nullable) — tree columns add to existing model
- `WorkspaceScopedModel` base class: provides `workspace_id`, `is_deleted`, `created_at`, `updated_at` — tree columns inherit these
- `BaseRepository[Note]`: provides `get_by_id`, `create`, `update`, `delete` (soft), `paginate` — no changes needed for migration
- `get_workspace_rls_policy_sql()` in `infrastructure/database/rls.py`: template for generating RLS policies

### Established Patterns
- Alembic migrations: sequential numbering (current head: 078), immutable once committed
- RLS policies: workspace membership check via `workspace_members` join + `current_setting('app.current_user_id')`
- Soft delete: `is_deleted` boolean flag, application-level enforcement
- All columns use `mapped_column()` with explicit `nullable`, `default`, and `server_default`

### Integration Points
- Migration 005 created original notes table + RLS — new migration must DROP old policy and CREATE replacements
- `NoteRepository` will need tree query methods in Phase 25 (not this phase)
- Frontend `NoteStore` and `notesApi` unaffected in this phase (data model only)

</code_context>

<deferred>
## Deferred Ideas

- Materialized path (`/project/section/page`) for breadcrumb rendering — Phase 26 can compute from parent chain
- `page_type` enum column (PROJECT_PAGE, PERSONAL_PAGE) — can derive from `project_id IS NULL` check, add if performance demands it later
- Recursive CTE helper functions for tree traversal — Phase 25 (API layer)

</deferred>

---

*Phase: 24-page-tree-data-model*
*Context gathered: 2026-03-12*
