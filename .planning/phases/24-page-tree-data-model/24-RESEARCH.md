# Phase 24: Page Tree Data Model - Research

**Researched:** 2026-03-12
**Domain:** PostgreSQL schema migration, SQLAlchemy model extension, RLS policy replacement
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Phase Boundary**
Add tree columns (`parent_id`, `depth`, `position`) to the existing `notes` table, classify notes into project pages vs personal pages, migrate existing data, and update RLS policies to enforce personal page owner-only visibility. No new tables. No API changes (Phase 25). No frontend changes (Phase 26).

**Data Migration Strategy**
- All existing notes with `project_id` set become project pages: assign `depth=0`, `parent_id=NULL`, `position` assigned sequentially by `created_at` within each project (position = row_number * 1000)
- All existing notes without `project_id` become personal pages: `owner_id` already NOT NULL on the model, so every note has a creator. Set `depth=0`, `parent_id=NULL`, `position` assigned sequentially by `created_at` per owner within workspace
- No orphan risk: `owner_id` is NOT NULL with CASCADE on delete — every note has a valid creator
- Migration is a single `UPDATE` statement per category (project pages, personal pages) — no row-by-row processing
- After migration, workspace-level notes (project_id NULL + not classified as personal) should not exist. The migration covers all rows: if project_id is set → project page; if project_id is NULL → personal page (owner = existing owner_id)

**RLS Policy Design**
- **Replace** the existing single `notes_workspace_member` policy with two policies:
  1. `notes_project_page_policy` — project pages (`project_id IS NOT NULL`): visible to all workspace members (same as current behavior). Uses existing workspace_members join.
  2. `notes_personal_page_policy` — personal pages (`project_id IS NULL`): visible ONLY to `owner_id = current_setting('app.current_user_id')::uuid`
- **Service role bypass** policy retained for backend operations
- No role-based differentiation within project pages (guests see all project pages if they're workspace members — existing RBAC controls workspace access, not page-level access). Per-page ACL is explicitly out of scope per REQUIREMENTS.md
- DROP old policy + CREATE new policies in a single transaction to avoid a window of no protection

**Position Field Semantics**
- **Integer with gaps**: positions assigned as multiples of 1000 (1000, 2000, 3000...)
- Reason: allows easy insertion between siblings without rebalancing (insert between 1000 and 2000 → use 1500). Phase 25's reorder API benefits from this
- When gaps exhaust (position collision), Phase 25's reorder endpoint will do a full rebalance of siblings. This phase only sets initial positions.
- Position is per-parent: siblings share the same `parent_id` (or NULL for root pages) and are ordered by `position` ASC
- Column type: `INTEGER NOT NULL DEFAULT 0` with server_default

**Soft-Delete + Tree Integrity**
- **Cascade soft-delete to children**: when a parent page is soft-deleted (`is_deleted=true`), all descendant pages are also soft-deleted. This prevents orphaned visible pages in the tree
- Enforcement: application-level (in the service layer, Phase 25), not DB trigger. Reason: soft-delete is already application-level (`is_deleted` flag, not actual DELETE), and recursive CTE triggers add complexity without benefit for 3-level max depth
- `parent_id` FK constraint uses `ON DELETE SET NULL` — if a parent is hard-deleted (which only happens via data retention purge), children become root pages rather than being destroyed. This is a safety net, not normal flow.
- CHECK constraint on `depth`: `CHECK (depth >= 0 AND depth <= 2)` — enforced at DB level, cannot be bypassed
- CHECK constraint on self-reference: `CHECK (parent_id != id)` — page cannot be its own parent
- No CHECK for circular references beyond self (3-level max + parent_id validation in service layer is sufficient)

**Column Additions to `notes` Table**
- `parent_id UUID NULL` — FK to `notes.id`, ON DELETE SET NULL. NULL means root page.
- `depth INTEGER NOT NULL DEFAULT 0` — CHECK (depth >= 0 AND depth <= 2). 0=root, 1=child, 2=grandchild.
- `position INTEGER NOT NULL DEFAULT 0` — ordering among siblings. server_default=0.

**Index Strategy**
- `ix_notes_parent_id` on `parent_id` — tree traversal queries
- `ix_notes_parent_position` on `(parent_id, position)` — sibling ordering queries
- `ix_notes_depth` on `depth` — filter by tree level
- `ix_notes_owner_workspace` on `(owner_id, workspace_id)` — personal pages listing (used by new RLS policy)

### Claude's Discretion
- Exact migration revision number (next after 078)
- Whether to add a `page_type` computed/stored column or rely on `project_id IS NULL` check
- Alembic migration internal structure (single file vs split)

### Deferred Ideas (OUT OF SCOPE)
- Materialized path (`/project/section/page`) for breadcrumb rendering — Phase 26 can compute from parent chain
- `page_type` enum column (PROJECT_PAGE, PERSONAL_PAGE) — can derive from `project_id IS NULL` check, add if performance demands it later
- Recursive CTE helper functions for tree traversal — Phase 25 (API layer)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TREE-01 | User can create pages nested up to 3 levels within a project (Project > Section > Page > Sub-page) | DB CHECK constraint `depth >= 0 AND depth <= 2` enforces 3-level max; `parent_id` FK establishes adjacency list |
| TREE-04 | User can create personal pages owned by their account, independent of any project | `project_id IS NULL` + `owner_id NOT NULL` identifies personal pages; RLS `notes_personal_page_policy` enforces owner-only visibility |
| TREE-05 | Existing notes are migrated to project pages (if project_id set) or personal pages (if no project_id), workspace-level notes removed | Single-pass UPDATE statements classify all rows; no orphans because `owner_id` is NOT NULL on all existing rows |
</phase_requirements>

## Summary

Phase 24 extends the existing `notes` table with three columns (`parent_id`, `depth`, `position`) that implement an adjacency-list tree model. No new tables are created. The migration has three sequential concerns: (1) DDL — add columns with constraints and indexes, (2) DML — classify all existing rows into project pages or personal pages via two bulk UPDATE statements, and (3) RLS — replace the single `notes_workspace_member` policy with two targeted policies that enforce different visibility rules per page type.

All implementation primitives are already established in the codebase. Alembic migration 078 is the confirmed current head. The `Note` SQLAlchemy model uses `mapped_column()` with explicit nullability and server defaults. RLS policies follow the `get_workspace_rls_policy_sql()` template in `rls.py`, and the self-referencing FK + CHECK constraint pattern has precedent in graph node migrations (058). The RLS atomic replacement (DROP + CREATE in one `op.execute()` block) is the critical execution constraint.

The `NoteFactory` in `tests/factories.py` needs `parent_id`, `depth`, and `position` fields added so existing tests continue to work and new tree-specific tests can be written.

**Primary recommendation:** Single migration file `079_add_page_tree_columns.py` containing DDL, DML migration, and RLS replacement in one transaction. Rely on `project_id IS NULL` to distinguish page types (no `page_type` column needed).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Alembic | Matches project (`uv sync`) | Schema migrations | Project-standard; immutable migration files |
| SQLAlchemy | Async, matches project | ORM model extension | All models use `mapped_column()` with `WorkspaceScopedModel` |
| PostgreSQL | Supabase local | DB — CHECK constraints, self-ref FK, RLS | Required for RLS, pgvector, pgmq |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `sqlalchemy.text()` | — | Raw SQL in `op.execute()` for RLS policies | Required for DDL that Alembic can't express natively |
| `op.add_column()` | — | Add columns to existing table | Column additions without table rebuild |
| `op.create_index()` | — | Named indexes | Every new column that will appear in WHERE/ORDER BY |

**Installation:** No new packages — all dependencies already present.

## Architecture Patterns

### Recommended Migration Structure

Single file: `backend/alembic/versions/079_add_page_tree_columns.py`

```
upgrade():
  1. DDL: op.add_column() × 3 (parent_id, depth, position)
  2. DDL: op.add_column() FK constraint via op.create_foreign_key()
  3. DDL: op.execute(text("ALTER TABLE notes ADD CONSTRAINT ...")) × 2 CHECK constraints
  4. DDL: op.create_index() × 4
  5. DML: op.execute(text("UPDATE notes SET ...")) project pages
  6. DML: op.execute(text("UPDATE notes SET ...")) personal pages
  7. RLS: op.execute(text("DROP POLICY ... CREATE POLICY ... CREATE POLICY ..."))

downgrade():
  1. RLS: restore notes_workspace_member, drop two new policies
  2. DDL: drop indexes, drop FK, drop CHECK constraints, drop columns
```

### Pattern 1: Self-Referencing FK in Alembic

Alembic's `op.add_column()` does not accept a `ForeignKey()` directly for a self-referencing column on PostgreSQL. Use `op.create_foreign_key()` after column creation.

```python
# Source: Alembic docs + project pattern (migration 005)
op.add_column(
    "notes",
    sa.Column(
        "parent_id",
        postgresql.UUID(as_uuid=True),
        nullable=True,
    ),
)
op.create_foreign_key(
    "fk_notes_parent_id",
    "notes",   # source table
    "notes",   # referent table (self-referencing)
    ["parent_id"],
    ["id"],
    ondelete="SET NULL",
)
```

### Pattern 2: CHECK Constraints via op.execute(text())

Alembic's `op.create_check_constraint()` works but using `op.execute(text(...))` with explicit constraint names is the project standard for non-trivial constraints (precedent: migration 058).

```python
# Source: migrations/058_fix_graph_check_constraints.py
op.execute(
    text(
        "ALTER TABLE notes ADD CONSTRAINT chk_notes_depth_range "
        "CHECK (depth >= 0 AND depth <= 2)"
    )
)
op.execute(
    text(
        "ALTER TABLE notes ADD CONSTRAINT chk_notes_no_self_parent "
        "CHECK (parent_id != id)"
    )
)
```

### Pattern 3: Bulk DML in Upgrade — Position Assignment with ROW_NUMBER

```sql
-- Project pages: position = row_number() * 1000 within each project, ordered by created_at
UPDATE notes
SET depth = 0,
    parent_id = NULL,
    position = sub.pos
FROM (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY project_id
               ORDER BY created_at
           ) * 1000 AS pos
    FROM notes
    WHERE project_id IS NOT NULL
      AND is_deleted = false
) sub
WHERE notes.id = sub.id
  AND notes.project_id IS NOT NULL;

-- Personal pages: same logic, partition by owner_id, workspace_id
UPDATE notes
SET depth = 0,
    parent_id = NULL,
    position = sub.pos
FROM (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY owner_id, workspace_id
               ORDER BY created_at
           ) * 1000 AS pos
    FROM notes
    WHERE project_id IS NULL
) sub
WHERE notes.id = sub.id
  AND notes.project_id IS NULL;
```

### Pattern 4: Atomic RLS Policy Replacement

The existing `notes_workspace_member` policy must be dropped and replaced with two policies atomically to prevent a window of no protection. Single `op.execute(text(...))` with multiple statements separated by semicolons (PostgreSQL executes them in one transaction block).

```python
# Source: project pattern from migration 005 + 066 + 078
op.execute(
    text("""
        -- Drop old policy
        DROP POLICY IF EXISTS "notes_workspace_member" ON notes;

        -- Project pages: visible to all workspace members
        CREATE POLICY "notes_project_page_policy"
        ON notes
        FOR ALL
        USING (
            project_id IS NOT NULL
            AND workspace_id IN (
                SELECT wm.workspace_id
                FROM workspace_members wm
                WHERE wm.user_id = current_setting('app.current_user_id', true)::uuid
                AND wm.is_deleted = false
            )
        )
        WITH CHECK (
            project_id IS NOT NULL
            AND workspace_id IN (
                SELECT wm.workspace_id
                FROM workspace_members wm
                WHERE wm.user_id = current_setting('app.current_user_id', true)::uuid
                AND wm.is_deleted = false
            )
        );

        -- Personal pages: visible only to owner
        CREATE POLICY "notes_personal_page_policy"
        ON notes
        FOR ALL
        USING (
            project_id IS NULL
            AND owner_id = current_setting('app.current_user_id', true)::uuid
        )
        WITH CHECK (
            project_id IS NULL
            AND owner_id = current_setting('app.current_user_id', true)::uuid
        );
    """)
)
```

**CRITICAL:** The service role bypass policy (`notes_service_role`) created in migration 005 must NOT be dropped. It enables backend operations to bypass RLS. Only `notes_workspace_member` is being replaced.

### Pattern 5: SQLAlchemy Model Addition

```python
# Source: note.py existing pattern + base.py mapped_column conventions
from sqlalchemy import CheckConstraint, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

# In Note class:
parent_id: Mapped[uuid.UUID | None] = mapped_column(
    UUID(as_uuid=True),
    ForeignKey("notes.id", ondelete="SET NULL"),
    nullable=True,
)
depth: Mapped[int] = mapped_column(
    Integer,
    nullable=False,
    default=0,
    server_default=text("0"),
)
position: Mapped[int] = mapped_column(
    Integer,
    nullable=False,
    default=0,
    server_default=text("0"),
)

# In __table_args__:
CheckConstraint("depth >= 0 AND depth <= 2", name="chk_notes_depth_range"),
CheckConstraint("parent_id != id", name="chk_notes_no_self_parent"),
Index("ix_notes_parent_id", "parent_id"),
Index("ix_notes_parent_position", "parent_id", "position"),
Index("ix_notes_depth", "depth"),
Index("ix_notes_owner_workspace", "owner_id", "workspace_id"),
```

**Note:** `ix_notes_owner_workspace` may already partially overlap with `ix_notes_owner_id`. Add it anyway — the composite index is needed for personal page RLS performance (policy filters on both `owner_id` AND `workspace_id`).

### Pattern 6: NoteFactory Update

The `NoteFactory` in `tests/factories.py` must be updated to include the three new fields with sensible defaults. Without this, tests creating `Note` instances via factory will fail because `depth` and `position` are NOT NULL.

```python
# In NoteFactory (tests/factories.py)
parent_id: UUID | None = None
depth: int = 0
position: int = 0
```

### Anti-Patterns to Avoid
- **Dropping `notes_service_role` policy:** The service role bypass was created in migration 005 and is not named `notes_workspace_member`. It must be left intact. Only DROP `notes_workspace_member`.
- **Adding FK inline in `op.add_column()`:** PostgreSQL allows it but Alembic's `op.add_column` does not support FK on self-referencing tables reliably cross-dialect. Use `op.create_foreign_key()` separately.
- **Row-by-row Python migration loop:** The CONTEXT.md explicitly rules this out. Use `UPDATE ... FROM (SELECT ... ROW_NUMBER() ...)` for bulk classification.
- **Splitting DDL, DML, RLS into separate migrations:** This creates intermediate states where columns exist without constraints or where old RLS policy applies to partially migrated data. Single migration ensures atomicity.
- **Relying on `op.create_check_constraint()` with non-trivial expressions:** The migration 058 precedent shows that project standard is `op.execute(text("ALTER TABLE ... ADD CONSTRAINT ..."))` for CHECK constraints — this gives explicit naming and matches downgrade pattern.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sequential position assignment | Python loop iterating each note | SQL `ROW_NUMBER() OVER (PARTITION BY ...)` | Single UPDATE; correct under concurrency |
| Atomic policy swap | Two separate migrations | Single `op.execute()` with multiple statements | Prevents protection gap window |
| Self-ref FK integrity | Application-level parent validation only | PostgreSQL FK `ON DELETE SET NULL` | DB-level integrity is the safety net |
| Depth validation | Application CHECK before INSERT | PostgreSQL `CHECK (depth >= 0 AND depth <= 2)` | Cannot be bypassed by direct SQL |

**Key insight:** PostgreSQL CHECK constraints and FK cascade rules are not replaceable by application logic for data model correctness. The migration is the single source of truth.

## Common Pitfalls

### Pitfall 1: Dropping the Wrong RLS Policy Name

**What goes wrong:** Migration 005 created TWO policies on `notes`:
1. `notes_workspace_member` — the general access policy
2. `notes_service_role` — the service role bypass (created by `get_workspace_rls_policy_sql()` template pattern BUT migration 005 does not call that helper; it creates only `notes_workspace_member` explicitly)

**Verify:** Run `SELECT policyname FROM pg_policies WHERE tablename = 'notes'` to enumerate actual policy names before writing the DROP statement. The 005 migration code shows only `notes_workspace_member` is created — there is no separate service_role policy for notes in migration 005. The RLS is enabled (`ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`) but service_role bypass was NOT created for notes in migration 005.

**Impact:** If `notes_service_role` doesn't exist, no service bypass is in place for notes. The new migration should CREATE the service role bypass as part of the policy upgrade.

**How to avoid:** Check migration 005's `_create_rls_policies()` function (line 394-417) — it creates only `notes_workspace_member` for the notes table. There is no service_role bypass on notes currently. The new migration must add `notes_service_role` bypass alongside the two new policies.

### Pitfall 2: `is_deleted = false` Filter in DML vs RLS

**What goes wrong:** The bulk UPDATE in upgrade() might want to filter `WHERE is_deleted = false`, but the decision states "migration covers all rows." Soft-deleted notes should also get `depth=0` and `position` assigned — they are still data model rows. Filtering would leave `depth` and `position` at their `DEFAULT 0` (from `server_default`) which happens to be correct for depth, but positions would be non-sequential gaps for soft-deleted rows in the same project bucket.

**How to avoid:** Run the UPDATE for ALL rows regardless of `is_deleted` state. The position assignment among soft-deleted notes does not matter for Phase 25 (tree queries always filter `is_deleted = false`).

### Pitfall 3: `ix_notes_owner_workspace` Already Covered by Separate Indexes

**What goes wrong:** The notes table already has `ix_notes_owner_id` (single column). Adding `ix_notes_owner_workspace` as a composite index is correct for the RLS policy (which filters `owner_id = X AND workspace_id = Y`), but the name must not conflict with an existing index.

**How to avoid:** Check `__table_args__` in `note.py` — the existing index list is: `ix_notes_project_id`, `ix_notes_workspace_project`, `ix_notes_owner_id`, `ix_notes_template_id`, `ix_notes_is_pinned`, `ix_notes_is_deleted`, `ix_notes_is_guided_template`, `ix_notes_created_at`, `ix_notes_source_chat_session_id`. The composite `ix_notes_owner_workspace` does not conflict.

### Pitfall 4: Migration Revision Number Must Follow 078

**What goes wrong:** The migration chain has three conflicting `022_*` files (documented in MEMORY.md) — do not repeat this pattern.

**How to avoid:** The confirmed current head is `078_fix_rls_policies_and_missing_indexes`. New migration must use `revision = "079_add_page_tree_columns"` and `down_revision = "078_fix_rls_policies_and_missing_indexes"`. Verify with `alembic heads` after creating the file.

### Pitfall 5: SQLAlchemy Self-Referencing Relationship

**What goes wrong:** Adding a `parent: Mapped[Note | None]` relationship pointing back to the same model using `foreign_keys=[parent_id]` and a matching `children` relationship requires explicit `foreign_keys` and `back_populates` arguments. Forgetting `foreign_keys` causes `AmbiguousForeignKeysError` because SQLAlchemy sees two FKs from `notes` to `notes` (the self-ref `parent_id` and none others, but SQLAlchemy still requires disambiguation for clarity).

**How to avoid:** Either (a) omit the relationship entirely for this phase (Phase 25 service layer will traverse via repository queries, not ORM relationships), or (b) declare it with explicit `foreign_keys` and `lazy="noload"` to prevent accidental N+1 loads.

## Code Examples

### Complete upgrade() skeleton

```python
# Source: project patterns from migrations 030, 058, 005 + decisions in 24-CONTEXT.md
import sqlalchemy as sa
from sqlalchemy import text
from sqlalchemy.dialects import postgresql
from alembic import op

def upgrade() -> None:
    # 1. Add columns
    op.add_column(
        "notes",
        sa.Column("parent_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "notes",
        sa.Column("depth", sa.Integer(), server_default=sa.text("0"), nullable=False),
    )
    op.add_column(
        "notes",
        sa.Column("position", sa.Integer(), server_default=sa.text("0"), nullable=False),
    )

    # 2. Self-referencing FK
    op.create_foreign_key(
        "fk_notes_parent_id",
        "notes", "notes",
        ["parent_id"], ["id"],
        ondelete="SET NULL",
    )

    # 3. CHECK constraints
    op.execute(text(
        "ALTER TABLE notes ADD CONSTRAINT chk_notes_depth_range "
        "CHECK (depth >= 0 AND depth <= 2)"
    ))
    op.execute(text(
        "ALTER TABLE notes ADD CONSTRAINT chk_notes_no_self_parent "
        "CHECK (parent_id != id)"
    ))

    # 4. Indexes
    op.create_index("ix_notes_parent_id", "notes", ["parent_id"])
    op.create_index("ix_notes_parent_position", "notes", ["parent_id", "position"])
    op.create_index("ix_notes_depth", "notes", ["depth"])
    op.create_index("ix_notes_owner_workspace", "notes", ["owner_id", "workspace_id"])

    # 5. Data migration — project pages
    op.execute(text("""
        UPDATE notes
        SET depth = 0,
            parent_id = NULL,
            position = sub.pos
        FROM (
            SELECT id,
                   ROW_NUMBER() OVER (
                       PARTITION BY project_id
                       ORDER BY created_at
                   ) * 1000 AS pos
            FROM notes
            WHERE project_id IS NOT NULL
        ) sub
        WHERE notes.id = sub.id
          AND notes.project_id IS NOT NULL
    """))

    # 6. Data migration — personal pages
    op.execute(text("""
        UPDATE notes
        SET depth = 0,
            parent_id = NULL,
            position = sub.pos
        FROM (
            SELECT id,
                   ROW_NUMBER() OVER (
                       PARTITION BY owner_id, workspace_id
                       ORDER BY created_at
                   ) * 1000 AS pos
            FROM notes
            WHERE project_id IS NULL
        ) sub
        WHERE notes.id = sub.id
          AND notes.project_id IS NULL
    """))

    # 7. RLS replacement (atomic)
    op.execute(text("""
        DROP POLICY IF EXISTS "notes_workspace_member" ON notes;

        CREATE POLICY "notes_project_page_policy"
        ON notes FOR ALL
        USING (
            project_id IS NOT NULL
            AND workspace_id IN (
                SELECT wm.workspace_id FROM workspace_members wm
                WHERE wm.user_id = current_setting('app.current_user_id', true)::uuid
                AND wm.is_deleted = false
            )
        )
        WITH CHECK (
            project_id IS NOT NULL
            AND workspace_id IN (
                SELECT wm.workspace_id FROM workspace_members wm
                WHERE wm.user_id = current_setting('app.current_user_id', true)::uuid
                AND wm.is_deleted = false
            )
        );

        CREATE POLICY "notes_personal_page_policy"
        ON notes FOR ALL
        USING (
            project_id IS NULL
            AND owner_id = current_setting('app.current_user_id', true)::uuid
        )
        WITH CHECK (
            project_id IS NULL
            AND owner_id = current_setting('app.current_user_id', true)::uuid
        );

        CREATE POLICY "notes_service_role"
        ON notes FOR ALL TO service_role
        USING (true) WITH CHECK (true);
    """))
```

### Note model additions

```python
# In Note.__table_args__ — append to existing tuple:
CheckConstraint("depth >= 0 AND depth <= 2", name="chk_notes_depth_range"),
CheckConstraint("parent_id != id", name="chk_notes_no_self_parent"),
Index("ix_notes_parent_id", "parent_id"),
Index("ix_notes_parent_position", "parent_id", "position"),
Index("ix_notes_depth", "depth"),
Index("ix_notes_owner_workspace", "owner_id", "workspace_id"),
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Flat notes, no hierarchy | Adjacency list with `parent_id + depth + position` | Phase 24 | Enables 3-level page tree; breaks existing `notes_workspace_member` blanket policy |
| Single RLS policy for all notes | Two policies: project page vs personal page | Phase 24 | Personal pages become private by default; existing project notes remain workspace-visible |
| No position/ordering | `position INTEGER` with 1000-gap initial seeding | Phase 24 | Phase 25 reorder API can use midpoint insertion without bulk rebalancing |

**Deprecated/outdated after this phase:**
- `notes_workspace_member` policy: replaced by `notes_project_page_policy` + `notes_personal_page_policy` + `notes_service_role`
- "Workspace-level notes" (project_id NULL, no explicit owner classification): all notes are now either project-scoped or personal after migration

## Open Questions

1. **Does `notes_service_role` already exist on the `notes` table?**
   - What we know: Migration 005 creates only `notes_workspace_member` for the notes table (verified by reading the migration source). The `get_workspace_rls_policy_sql()` template creates both `{table}_workspace_isolation` and `{table}_service_role`, but migration 005 does NOT use this helper for the notes table — it uses inline SQL creating only `notes_workspace_member`.
   - What's unclear: Whether any subsequent migration (031 `homepage_rls_policies`, 034 `fix_homepage_rls_policies`) added a service_role bypass for notes.
   - Recommendation: Migration 079 should use `DROP POLICY IF EXISTS "notes_service_role" ON notes` before `CREATE POLICY "notes_service_role"` to be idempotent. This is safe: if it existed, it gets replaced; if not, the CREATE adds it fresh.

2. **Personal page RLS and workspace scoping**
   - What we know: Personal pages have `project_id IS NULL`. The `notes_personal_page_policy` as designed filters on `owner_id = current_setting('app.current_user_id')::uuid` only, without a workspace check.
   - What's unclear: If a user belongs to two workspaces and creates personal notes in each, this policy would return personal notes from ALL their workspaces (no workspace_id filter). This may be intentional ("my drafts" are user-global) or may leak data across workspace contexts.
   - Recommendation: Add `workspace_id = current_setting('app.current_workspace_id', true)::uuid` filter OR accept that personal notes are user-global across workspaces. The CONTEXT.md states "personal pages should feel like 'my drafts' — private by default, no workspace visibility." This implies user-global is acceptable. Keep policy as owner_id-only for now; Phase 25 API layer can add workspace scoping in the query filter if needed.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest + pytest-asyncio |
| Config file | `backend/pyproject.toml` ([tool.pytest.ini_options]) |
| Quick run command | `cd backend && uv run pytest tests/unit/ -q` |
| Full suite command | `cd backend && uv run pytest --cov -q` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TREE-01 | `Note` model accepts `depth` 0-2, rejects depth 3 | unit | `uv run pytest tests/unit/models/test_note_tree.py -x` | Wave 0 |
| TREE-01 | `Note` model rejects self-referencing `parent_id` | unit | `uv run pytest tests/unit/models/test_note_tree.py -x` | Wave 0 |
| TREE-04 | Personal note (project_id=None) is accepted by model | unit | `uv run pytest tests/unit/models/test_note_tree.py -x` | Wave 0 |
| TREE-05 | `NoteFactory` defaults include `depth=0, position=0, parent_id=None` | unit | `uv run pytest tests/unit/models/test_note_tree.py -x` | Wave 0 |
| TREE-05 | Alembic migration 079 produces single head after apply | integration | `uv run alembic heads` | N/A (manual) |

### Sampling Rate
- **Per task commit:** `cd backend && uv run pytest tests/unit/ -q`
- **Per wave merge:** `cd backend && uv run pytest --cov -q`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/tests/unit/models/test_note_tree.py` — covers TREE-01, TREE-04, TREE-05 model-level assertions
- [ ] `NoteFactory` update in `backend/tests/factories.py` — add `parent_id=None`, `depth=0`, `position=0`

## Sources

### Primary (HIGH confidence)
- Direct code read: `backend/src/pilot_space/infrastructure/database/models/note.py` — confirmed column list, `__table_args__`, existing indexes
- Direct code read: `backend/alembic/versions/005_note_entities.py` — confirmed `notes_workspace_member` policy name, no service_role bypass exists
- Direct code read: `backend/alembic/versions/078_fix_rls_policies_and_missing_indexes.py` — confirmed current head revision ID
- Direct code read: `backend/src/pilot_space/infrastructure/database/rls.py` — confirmed RLS policy template and `set_rls_context()` pattern
- Direct code read: `backend/src/pilot_space/infrastructure/database/base.py` — confirmed `WorkspaceScopedModel`, `mapped_column()` conventions
- Direct code read: `backend/alembic/versions/058_fix_graph_check_constraints.py` — confirmed project pattern for CHECK constraints via `op.execute(text(...))`
- Direct code read: `backend/alembic/versions/030_add_notes_source_chat_session.py` — confirmed pattern for `op.add_column()` + `op.create_index()`
- Direct code read: `backend/tests/factories.py` — confirmed `NoteFactory` fields, need to add tree fields
- Bash: `alembic heads` — confirmed `078_fix_rls_policies_and_missing_indexes` is current head

### Secondary (MEDIUM confidence)
- `.planning/phases/24-page-tree-data-model/24-CONTEXT.md` — locked decisions from user discussion session

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified against actual project codebase
- Architecture: HIGH — all patterns verified from existing migration files
- Pitfalls: HIGH (Pitfalls 1-4) / MEDIUM (Pitfall 5) — Pitfall 1 (service_role existence) noted as open question requiring runtime verification

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (stable domain — PostgreSQL schema migration patterns don't change frequently)
