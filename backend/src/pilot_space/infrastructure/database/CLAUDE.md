# Database Layer Reference - Pilot Space

**For parent layer overview, see [infrastructure/CLAUDE.md](../../infrastructure/CLAUDE.md)**

---

## Overview

The database infrastructure provides async SQLAlchemy 2.0 models, type-safe repositories with RLS enforcement, connection pooling, and Alembic migrations. All data access flows through repositories that enforce workspace isolation at both the application and database levels.

---

## SQLAlchemy Models (35 Total)

### Model Inheritance Hierarchy

```
Base (SQLAlchemy DeclarativeBase)
+-- BaseModel (UUID PK, timestamps, soft delete)
|   +-- WorkspaceScopedModel (BaseModel + workspace_id FK)
|   |   +-- Workspace, Project, Issue, Note, Cycle, Module
|   |   +-- Activity, Label, AIContext, AISession, AIConfiguration
|   |   +-- Integration, NoteAnnotation, NoteIssueLink
|   |   +-- ThreadedDiscussion, DiscussionComment, IssueLink
|   |   +-- Embedding, StateTemplate, UserRoleSkill
|   |   +-- WorkspaceDigest, DigestDismissal, WorkspaceOnboarding
|   |   +-- AIApprovalRequest, AICostRecord, AITask
|   |
|   +-- User (global user, not workspace-scoped)
|
+-- WorkspaceMember (composite: user + workspace + role)
   WorkspaceInvitation, WorkspaceAPIKey, State
   IssueLabel, AIMessage, AIToolCall
```

### Model Features

**Base Mixins**:

```python
# TimestampMixin - Auto timestamps
class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), onupdate=func.now()
    )

# SoftDeleteMixin - Mark as deleted instead of removing
class SoftDeleteMixin:
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    def soft_delete(self) -> None:
        self.is_deleted = True
        self.deleted_at = datetime.now(tz=UTC)

    def restore(self) -> None:
        self.is_deleted = False
        self.deleted_at = None

# WorkspaceScopedMixin - Workspace isolation for RLS
class WorkspaceScopedMixin:
    @declared_attr
    def workspace_id(cls) -> Mapped[uuid.UUID]:
        return mapped_column(
            UUID(as_uuid=True),
            ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
            index=True,  # Essential for RLS filtering
        )
```

### Composite Key Pattern (WorkspaceMember)

```python
class WorkspaceMember(Base, TimestampMixin):
    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id"), primary_key=True
    )
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id"), primary_key=True
    )
    role: Mapped[Role] = mapped_column(SQLEnum(Role), default=Role.MEMBER)

    __table_args__ = (
        UniqueConstraint("workspace_id", "user_id", name="uq_workspace_user"),
    )
```

---

## Key Models

### Issue Model

```python
class Issue(WorkspaceScopedModel):
    """Work item tracking.
    State machine: Backlog -> Todo -> In Progress -> In Review -> Done
    Identifier: {PROJECT.identifier}-{sequence_id} (e.g., PILOT-123)
    """

    sequence_id: Mapped[int]               # Project-scoped auto-increment
    name: Mapped[str]                      # Title (1-255 chars)
    description: Mapped[str | None]        # Markdown
    description_html: Mapped[str | None]   # Pre-rendered HTML
    priority: Mapped[IssuePriority]        # none, low, medium, high, urgent

    # Foreign keys
    state_id: Mapped[UUID] = mapped_column(ForeignKey("states.id"))
    project_id: Mapped[UUID] = mapped_column(ForeignKey("projects.id"))
    assignee_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id"))
    reporter_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    cycle_id: Mapped[UUID | None] = mapped_column(ForeignKey("cycles.id"))
    module_id: Mapped[UUID | None] = mapped_column(ForeignKey("modules.id"))
    parent_id: Mapped[UUID | None] = mapped_column(ForeignKey("issues.id"))

    # Planning
    estimate_points: Mapped[float | None]
    start_date: Mapped[date | None]
    target_date: Mapped[date | None]
    sort_order: Mapped[int] = mapped_column(default=0)

    # AI metadata (JSONB)
    ai_metadata: Mapped[dict[str, Any]] = mapped_column(JSONBCompat, default={})

    # Relationships
    state: Mapped[State] = relationship(lazy="select")
    project: Mapped[Project] = relationship(lazy="select")
    assignee: Mapped[User | None] = relationship(foreign_keys=[assignee_id], lazy="select")
    reporter: Mapped[User] = relationship(foreign_keys=[reporter_id], lazy="select")
    labels: Mapped[list[Label]] = relationship(secondary=issue_labels, lazy="select")
    sub_issues: Mapped[list[Issue]] = relationship(primaryjoin=parent_id, ...)
    note_links: Mapped[list[NoteIssueLink]] = relationship(lazy="select")
    activities: Mapped[list[Activity]] = relationship(lazy="select")
```

### Note Model

```python
class Note(WorkspaceScopedModel):
    """Block-based collaborative document (TipTap JSON). Home view in Note-First workflow."""

    title: Mapped[str]
    content: Mapped[dict[str, Any]] = mapped_column(JSONBCompat)  # TipTap JSON

    annotations: Mapped[list[NoteAnnotation]] = relationship(lazy="select")
    issue_links: Mapped[list[NoteIssueLink]] = relationship(lazy="select")
    discussions: Mapped[list[ThreadedDiscussion]] = relationship(lazy="select")
```

### AIContext Model

```python
class AIContext(WorkspaceScopedModel):
    """Aggregated issue context for AI processing. Cached for 24h."""

    issue_id: Mapped[UUID] = mapped_column(ForeignKey("issues.id"), unique=True)
    context_json: Mapped[dict[str, Any]] = mapped_column(JSONBCompat)
    cache_expires_at: Mapped[datetime]
    related_issues: Mapped[list[UUID]] = mapped_column(JSONBCompat)
    last_generated_at: Mapped[datetime] = mapped_column(server_default=func.now())
```

### AISession & AIMessage

```python
class AISession(WorkspaceScopedModel):
    """Multi-turn conversation. Redis hot cache (30-min) + PostgreSQL durable (24h TTL)."""

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    session_context: Mapped[dict[str, Any]] = mapped_column(JSONBCompat, default={})
    last_activity_at: Mapped[datetime] = mapped_column(server_default=func.now())
    expires_at: Mapped[datetime]
    messages: Mapped[list[AIMessage]] = relationship(lazy="select")

class AIMessage(Base, TimestampMixin, SoftDeleteMixin):
    """Conversational message (user or assistant). Stores tool calls + token usage."""

    session_id: Mapped[UUID] = mapped_column(ForeignKey("ai_sessions.id"), index=True)
    role: Mapped[MessageRole]
    content: Mapped[str]
    tool_calls: Mapped[list[AIToolCall]] = relationship(lazy="select")
    token_usage: Mapped[dict[str, int]] = mapped_column(JSONBCompat)
```

---

## Repository Pattern

### BaseRepository[T] - Generic CRUD

**File**: `repositories/base.py`

```python
class BaseRepository[T: BaseModel]:
    def __init__(self, session: AsyncSession, model_class: type[T]):
        self.session = session
        self.model_class = model_class
```

**Core Methods** (14):

| Method | Purpose | Notes |
|--------|---------|-------|
| `get_by_id(id)` | Fetch single by PK | Skips soft-deleted by default |
| `get_by_id_scalar(id)` | Fetch without relationships | Overrides eager loading for validation |
| `get_all(limit, offset)` | Fetch all with pagination | Ordered by `created_at desc` |
| `create(entity)` | Insert new entity | Returns with generated ID |
| `update(entity)` | Persist changes | Must fetch + modify + flush |
| `delete(id, hard=False)` | Mark deleted or hard delete | Soft delete by default |
| `restore(entity)` | Undo soft delete | Clears `deleted_at` |
| `count(filters)` | Count matching | Excludes soft-deleted |
| `exists(id)` | Check existence | Boolean return |
| `find_by(**kwargs)` | Find by attributes | Returns list, AND logic |
| `find_one_by(**kwargs)` | Find first match | Returns single or None |
| `search(term, columns)` | Full-text search | ILIKE pattern matching |
| `paginate(cursor, page_size, sort_by, sort_order, filters)` | Cursor pagination | Returns CursorPage |

### Cursor Pagination

```python
@dataclass
class CursorPage[T: BaseModel]:
    items: Sequence[T]
    total: int
    next_cursor: str | None = None
    prev_cursor: str | None = None
    has_next: bool = False
    has_prev: bool = False
    page_size: int = 20
    filters: dict[str, Any] = field(default_factory=dict)
```

### Specialized Repositories

**IssueRepository** (21 methods):

```python
# Eager loading with relationships
async def get_by_id_with_relations(issue_id: UUID) -> Issue | None:
    """Load issue with project, state, assignee, labels, etc."""
    return select(Issue).options(
        joinedload(Issue.project), joinedload(Issue.state),
        joinedload(Issue.assignee), joinedload(Issue.reporter),
        selectinload(Issue.labels), selectinload(Issue.sub_issues),
        selectinload(Issue.note_links),
    )

# Workspace-scoped queries
async def find_by_workspace(workspace_id: UUID, filters: IssueFilters | None) -> list[Issue]
    """Filters: state_ids, assignee_ids, label_ids, cycle_id, module_id, date ranges."""

# Sequence ID generation (race-safe)
async def get_next_sequence_id(project_id: UUID) -> int
    """SELECT max(sequence_id) + 1 with FOR UPDATE."""

# Bulk label assignment
async def bulk_update_labels(issue_id: UUID, label_ids: list[UUID]) -> None
    """Single transaction for multiple labels."""
```

**NoteRepository** (15+ methods):

```python
async def get_by_id_with_annotations(note_id: UUID) -> Note | None
async def find_by_workspace_paginated(workspace_id: UUID, cursor, page_size) -> CursorPage[Note]
async def search_content(workspace_id: UUID, search_term: str) -> list[Note]
```

**AIContextRepository** (10+ methods):

```python
async def get_cached(issue_id: UUID) -> AIContext | None
async def invalidate_cache(issue_id: UUID) -> None
async def get_or_generate(issue_id: UUID, cache_ttl: int = 86400) -> AIContext
```

### Repository Best Practices

```python
# Always eager load relationships
# BAD - N+1 queries
issues = await repo.get_all()
for issue in issues:
    assignee = issue.assignee  # Triggers query per issue

# GOOD - Loaded in single query
issues = await session.execute(
    select(Issue).options(
        joinedload(Issue.assignee),
        joinedload(Issue.project),
        selectinload(Issue.labels),
    )
)

# Always filter by workspace_id explicitly
# BAD - No workspace scoping (RLS violation)
issues = await session.execute(select(Issue))

# GOOD - Explicit workspace scope
issues = await session.execute(
    select(Issue).where(Issue.workspace_id == workspace_id)
)

# Use soft delete by default
await repo.delete(issue)  # Sets is_deleted=True, deleted_at=now()
await repo.delete(issue, hard=True)  # Hard delete only for cleanup (rare)
```

---

## Database Connection & Session Management

### Engine Configuration (`engine.py`)

```python
def create_engine(settings: Settings | None = None) -> AsyncEngine:
    return create_async_engine(
        settings.database_url.get_secret_value(),
        pool_size=5,           # Base pool size
        max_overflow=10,       # Overflow connections
        pool_timeout=30.0,     # Wait timeout
        pool_pre_ping=True,    # Verify connections before use
    )
```

### Connection Pool Constants

| Setting | Value | Rationale |
|---------|-------|-----------|
| `pool_size` | 5 | Base connections for concurrent requests |
| `max_overflow` | 10 | Burst handling (peak load) |
| `pool_timeout` | 30s | Wait time before timeout |
| `pool_pre_ping` | True | Verify connections (prevent stale) |

### Session Management

**Context manager for automatic cleanup**:

```python
@asynccontextmanager
async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    session_factory = get_session_factory()
    async with session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
```

**Session factory configuration**:

```python
async_sessionmaker(
    get_engine(),
    class_=AsyncSession,
    expire_on_commit=False,  # Keep objects in memory after commit
    autoflush=False,         # Manual flush control
)
```

**FastAPI integration**:

```python
@router.post("/issues")
async def create_issue(
    request: IssueCreateRequest,
    session: Annotated[AsyncSession, Depends(get_db_session)],
):
    service = CreateIssueService(session=session, ...)
    result = await service.execute(payload)
    return result
```

---

## Migrations (36+ via Alembic)

### Migration Strategy

Key migrations in `backend/alembic/versions/`:

| ID | Purpose |
|----|---------|
| 001 | Enable pgvector extension (768-dim embeddings) |
| 002 | Core entities (users, workspaces, projects, issues) |
| 003 | Project entities (State, StateGroup, Module) |
| 004 | RLS policies (enforcement at database level) |
| 005 | Note entities (canvas + blocks) |
| 006 | Issue entities (labels, links, cycles) |
| 010 | AIContext entity (cached context) |
| 011 | Performance indexes (workspace_id, state_id, etc.) |
| 012-017 | AI configurations, API keys, approvals, cost records, sessions |
| 020 | AI conversational tables (AIMessage, AIToolCall) |
| 028-035 | Digests, RLS refinements, role skills |

### Creating Migrations

```bash
# Auto-generate from model changes
alembic revision --autogenerate -m "Add issue_priority column"

# Apply migration
alembic upgrade head

# Rollback last migration
alembic downgrade -1

# Check current migration
alembic current
```

### Migration Anatomy

```python
"""Add issue_priority column."""
from alembic import op
import sqlalchemy as sa

def upgrade():
    op.execute(
        "CREATE TYPE issue_priority_enum AS ENUM ('none', 'low', 'medium', 'high', 'urgent')"
    )
    op.add_column(
        'issues',
        sa.Column('priority', sa.Enum(..., name='issue_priority_enum'),
                  nullable=False, server_default='none')
    )

def downgrade():
    op.drop_column('issues', 'priority')
    op.execute("DROP TYPE issue_priority_enum")
```

### RLS Migration Pattern

```python
"""Add RLS policy for issues table."""
from alembic import op

def upgrade():
    op.execute("""
    ALTER TABLE issues ENABLE ROW LEVEL SECURITY;
    ALTER TABLE issues FORCE ROW LEVEL SECURITY;

    CREATE POLICY "issues_workspace_isolation"
    ON issues FOR ALL
    USING (
        workspace_id IN (
            SELECT wm.workspace_id FROM workspace_members wm
            WHERE wm.user_id = current_setting('app.current_user_id', true)::uuid
            AND wm.is_deleted = false
        )
    );
    """)

def downgrade():
    op.execute("DROP POLICY IF EXISTS issues_workspace_isolation ON issues")
    op.execute("ALTER TABLE issues DISABLE ROW LEVEL SECURITY")
```

---

## Troubleshooting

**N+1 Query Detection**: Enable SQLAlchemy echo (`echo=True`). Look for repeated SELECT for same entity type. Fix with `.options(joinedload(...))`.

**Connection Pool Exhaustion**: "QueuePool Overflow" means `max_overflow` reached. Check pool stats with `engine.pool.checkedout()`. Increase `max_overflow` or reduce concurrent requests.

**Stale Connections**: `pool_pre_ping=True` verifies connections before use. If persistent issues, check PostgreSQL `idle_in_transaction_session_timeout`.

---

## Related Documentation

- **Parent layer**: [infrastructure/CLAUDE.md](../../infrastructure/CLAUDE.md) (cache, auth, search, queue, encryption)
- **RLS security**: [auth/CLAUDE.md](../auth/CLAUDE.md) (RLS policies, middleware, verification)
- **Domain entities**: [domain/models/CLAUDE.md](../../domain/models/CLAUDE.md)
- **Application services**: [application/services/CLAUDE.md](../../application/services/CLAUDE.md)
