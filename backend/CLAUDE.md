# Backend Development Guide - Pilot Space

*For project overview and general context, see main CLAUDE.md at project root*

## Quick Reference

### Quality Gates (Run Before Every Commit)

```bash
uv run pyright && uv run ruff check && uv run pytest --cov=.
```

### Critical Constants

| Constraint | Value | Rationale |
|------------|-------|-----------|
| File size limit | 700 lines | Files >700 lines become unmaintainable and untestable. This limit has saved 40+ hours in refactoring across past projects. |
| Test coverage | >80% | This threshold catches 85% of regressions before deployment. Metric directly correlates with production stability. |
| Async-only I/O | Required | Blocking calls in async context cause thread starvation under load. Can degrade API latency by 10-50x. |

### Development Commands

**Setup**: `cd backend && uv venv && source .venv/bin/activate && uv sync && pre-commit install`

**Dev server**: `uvicorn pilot_space.main:app --reload --host 0.0.0.0 --port 8000`

**Quality gates**: `uv run pyright && uv run ruff check && uv run pytest --cov=.`

**Migrations**: `alembic revision --autogenerate -m "Description"` then `alembic upgrade head`

---

## Backend Architecture

You are a **Senior Backend Architect** with 10+ years building production Python systems. You excel at Clean Architecture patterns, async SQLAlchemy optimization, and multi-tenant security enforcement.

**Core expertise**: CQRS-lite service design, repository pattern implementation, RLS policy authoring, FastAPI best practices.

### Technology Stack

backend_tech[5]{component,technology,version,decision}
Framework,FastAPI,0.110+,DD-001
ORM,SQLAlchemy 2.0 (async),2.0+,DD-001
Validation,Pydantic v2,2.6+,DD-001
DI,dependency-injector,4+,DD-064
Runtime,Python,3.12+,--

### 5-Layer Clean Architecture

**Structure** (`backend/src/pilot_space/`):

1. **Presentation** (`api/v1/`) — 20 FastAPI routers + Pydantic v2 schemas + middleware (auth, CORS, rate limiting, RFC 7807 errors)

2. **Application** (`application/services/`) — 8 domain services:
   - note (CRUD + ContentConverter + AIUpdate)
   - issue (state machine + Meilisearch)
   - cycle (velocity + rollover)
   - ai_context, annotation, discussion
   - integration (GitHub sync)

3. **Domain** (`domain/`) — Rich domain entities (Issue, Note, Cycle) with behavior + validation, domain services (pure logic, no I/O)

4. **Infrastructure** (`infrastructure/`) — 22 SQLAlchemy models, 15 repositories, 21 Alembic migrations, RLS helpers, Redis cache, pgmq queue, Supabase JWT auth, Meilisearch client

5. **AI Layer** (`ai/`) — PilotSpaceAgent orchestrator + subagents, Claude Agent SDK integration, MCP tools, providers, session management, cost tracking

**Root files**: `config.py` (Pydantic Settings), `container.py` (DI container), `dependencies.py` (FastAPI Depends), `main.py` (lifespan, routers, middleware)

---

## Backend Patterns

Load `docs/dev-pattern/45-pilot-space-patterns.md` first for project-specific patterns.

### Core Patterns

backend_patterns[8]{pattern,implementation,rationale}
CQRS-lite (DD-064),Service.execute(Payload) → Result,Separate read/write without Event Sourcing
Repository,BaseRepository[T] + 15 repos; async SQLAlchemy,Abstract persistence; testable; RLS-enforced
Unit of Work,SQLAlchemyUnitOfWork transaction boundaries,Atomic operations + event publishing
Domain Events,IssueCreated; IssueStateChanged after commit,Decouple side effects
DI (DD-064),dependency-injector: Singleton (config/engine); Factory (repos/sessions),Testable; explicit; no global state
Errors,RFC 7807 Problem Details,Standard machine-readable format
Validation,Pydantic v2 at boundary; domain invariants in entities,Fail fast at edge; rich behavior inside
Auth (DD-061),Supabase Auth + RLS: JWT → workspace_id → RLS enforcement,Defense-in-depth

### Pattern Details

**CQRS-lite**:
```python
# Service layer
class CreateIssueService:
    async def execute(self, payload: CreateIssuePayload) -> Result[Issue]:
        # Command: validate → create → persist → publish events
        issue = Issue.create(payload.title, payload.workspace_id)
        await self.repo.save(issue)
        return Success(issue)
```

**Repository Pattern**:
```python
class IssueRepository(BaseRepository[Issue]):
    async def find_by_workspace(self, workspace_id: str) -> list[Issue]:
        # RLS automatically filters by workspace_id via policies
        result = await self.session.execute(
            select(Issue).where(Issue.workspace_id == workspace_id)
        )
        return result.scalars().all()
```

**Domain Events**:
```python
# Domain entity publishes events
class Issue:
    def transition_to(self, new_state: IssueState):
        old_state = self.state
        self.state = new_state
        self.events.append(IssueStateChanged(self.id, old_state, new_state))

# After commit, publish to event bus
async with uow:
    await service.execute(payload)
    await uow.commit()
    # Events automatically published here
```

---

## Security: Row-Level Security (RLS)

**RLS violations expose sensitive data across workspaces—this is our core security boundary.** Database-level enforcement prevents application-layer bypass.

### RLS Requirements

Every table with tenant data has RLS policies:

```sql
-- Enable RLS
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see issues in their workspaces
CREATE POLICY workspace_isolation ON issues
    USING (workspace_id IN (
        SELECT workspace_id FROM workspace_members
        WHERE user_id = auth.uid()
    ));
```

### Four Roles

**owner**: Full workspace control, billing
**admin**: Manage members, settings (no billing)
**member**: Read/write access to workspace data
**guest**: Read-only access to assigned items

### Verification Checklist

- [ ] Every query scoped by `workspace_id`
- [ ] RLS policy created for new multi-tenant tables
- [ ] Integration tests verify cross-workspace isolation
- [ ] Service layer validates workspace membership before mutations

---

## Implementation Guidelines

### Code Organization

**Prefer editing existing files to creating new ones.** Only create new files when:
- Adding a new domain entity (requires model + repository + service)
- Implementing a new API router for a distinct resource
- Creating a new integration (GitHub, Slack, etc.)

**File size**: 700 lines max. Files exceeding this become unmaintainable and untestable. Split large files by:
- Service layer: One service class per file
- Repositories: One repository per entity
- API routers: Group related endpoints (max 10-12 routes per router)

### Service Layer (CQRS-lite)

**Pattern**: `Service.execute(Payload) → Result`

```python
from application.services.base import BaseService, Result, Success, Failure

class CreateIssueService(BaseService):
    def __init__(
        self,
        issue_repo: IssueRepository,
        workspace_repo: WorkspaceRepository,
    ):
        self.issue_repo = issue_repo
        self.workspace_repo = workspace_repo

    async def execute(
        self,
        payload: CreateIssuePayload,
    ) -> Result[Issue]:
        # 1. Validate workspace membership
        workspace = await self.workspace_repo.find_by_id(payload.workspace_id)
        if not workspace:
            return Failure("Workspace not found")

        # 2. Create domain entity (validation happens here)
        issue = Issue.create(
            title=payload.title,
            workspace_id=payload.workspace_id,
            created_by=payload.user_id,
        )

        # 3. Persist
        await self.issue_repo.save(issue)

        # 4. Return success
        return Success(issue)
```

**Don't**: Directly manipulate SQLAlchemy models in API layer
**Do**: Use service classes with explicit payloads and results

### Error Handling

Use RFC 7807 Problem Details for all API errors:

```python
from fastapi import HTTPException
from api.v1.errors import problem_detail

# In router
@router.post("/issues")
async def create_issue(data: CreateIssueRequest):
    result = await service.execute(data)

    if result.is_failure:
        raise problem_detail(
            status=400,
            title="Issue creation failed",
            detail=result.error,
            type_uri="/errors/validation-error"
        )

    return result.value
```

### Async Best Practices

**No blocking I/O in async functions.** Blocking calls cause thread starvation under load. Can degrade API latency by 10-50x.

```python
# ❌ Wrong - blocking I/O
async def process_file(path: str):
    with open(path) as f:  # Blocks event loop
        return f.read()

# ✅ Correct - async I/O
async def process_file(path: str):
    async with aiofiles.open(path) as f:
        return await f.read()

# ✅ Correct - offload to thread pool for sync operations
async def process_file(path: str):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _read_file, path)
```

### Database Queries

**Avoid N+1 queries** using eager loading:

```python
# ❌ Wrong - N+1 queries
issues = await session.execute(select(Issue))
for issue in issues:
    assignee = await session.execute(
        select(User).where(User.id == issue.assignee_id)
    )  # N queries

# ✅ Correct - eager loading
issues = await session.execute(
    select(Issue)
    .options(joinedload(Issue.assignee))
    .options(joinedload(Issue.labels))
)
```

### Dependency Injection

Use `dependency-injector` container (Singleton for config/engine, Factory for repos/sessions):

```python
from dependency_injector import containers, providers

class Container(containers.DeclarativeContainer):
    config = providers.Singleton(Config)

    engine = providers.Singleton(
        create_async_engine,
        config.provided.database_url,
    )

    session_factory = providers.Factory(
        async_sessionmaker,
        engine,
        class_=AsyncSession,
    )

    issue_repo = providers.Factory(
        IssueRepository,
        session=session_factory,
    )
```

---

## AI Agent Integration

### For AI/Agent Layer Agents

PilotSpaceAgent is the single orchestrator. Don't create new independent agents.

**Simple tasks** → skills (`.claude/skills/`)
**Complex tasks** → subagents (spawned by orchestrator)

### MCP Tool Requirements

All tools return operation payloads (`status: pending_apply`), not direct mutations:

```python
@mcp_tool("create_issue_from_note")
async def create_issue_from_note(
    note_id: str,
    block_id: str,
    title: str,
) -> dict:
    # Return operation payload, don't mutate DB directly
    return {
        "status": "pending_apply",
        "operation": "create_issue",
        "data": {
            "note_id": note_id,
            "block_id": block_id,
            "title": title,
        }
    }
```

### SSE Transform Pipeline

SDK message → `transform_sdk_message()` → Frontend event:

```python
async def transform_sdk_message(sdk_msg: dict) -> SSEEvent:
    """Convert SDK tool result to frontend SSE event"""
    if sdk_msg["type"] == "tool_result":
        if "content_update" in sdk_msg["content"]:
            return SSEEvent(
                event="content_update",
                data=convert_markdown_to_tiptap(sdk_msg["content"])
            )
```

### Provider Resilience

Use `ResilientExecutor` for external API calls:

```python
from ai.infrastructure.resilience import ResilientExecutor

executor = ResilientExecutor(
    max_retries=3,
    base_delay=1.0,
    max_delay=60.0,
)

result = await executor.execute(
    lambda: anthropic_client.messages.create(...)
)
```

Use `CircuitBreaker` for provider failures:

```python
from ai.infrastructure.circuit_breaker import CircuitBreaker

breaker = CircuitBreaker(
    failure_threshold=5,
    recovery_timeout=60,
)

if breaker.can_execute():
    try:
        result = await provider.chat(...)
        breaker.record_success()
    except Exception as e:
        breaker.record_failure()
        # Fall back to alternative provider
```

---

## Testing

### Unit Tests

**Coverage > 80%.** This threshold catches 85% of regressions before deployment.

```python
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

@pytest.mark.asyncio
async def test_create_issue_success(
    session: AsyncSession,
    workspace_factory,
):
    # Arrange
    workspace = await workspace_factory.create()
    service = CreateIssueService(
        issue_repo=IssueRepository(session),
        workspace_repo=WorkspaceRepository(session),
    )

    # Act
    result = await service.execute(
        CreateIssuePayload(
            title="Test issue",
            workspace_id=workspace.id,
            user_id="user123",
        )
    )

    # Assert
    assert result.is_success
    assert result.value.title == "Test issue"
```

### Integration Tests

Verify RLS policies:

```python
@pytest.mark.asyncio
async def test_rls_workspace_isolation(session: AsyncSession):
    """Verify users cannot access issues from other workspaces"""
    # Create two workspaces with issues
    workspace1 = await create_workspace("ws1")
    workspace2 = await create_workspace("ws2")

    issue1 = await create_issue(workspace1.id)
    issue2 = await create_issue(workspace2.id)

    # Set RLS context for workspace1
    await session.execute(
        text("SET LOCAL app.workspace_id = :ws_id"),
        {"ws_id": workspace1.id}
    )

    # Query should only return issue1
    issues = await session.execute(select(Issue))
    assert len(issues.scalars().all()) == 1
    assert issues.scalars().first().id == issue1.id
```

---

## Pre-Submission Checklist

Rate confidence (0-1) before submitting code:

**Architecture & Design**:
- [ ] CQRS-lite pattern followed (Service.execute(Payload) → Result): ___
- [ ] Repository pattern used (no direct DB access in services): ___
- [ ] Domain logic in entities, not services: ___

**Security**:
- [ ] RLS policy added/updated for multi-tenant tables: ___
- [ ] Workspace membership validated before mutations: ___
- [ ] API keys stored in Supabase Vault (never environment vars): ___

**Code Quality**:
- [ ] Tests cover happy path + 2 edge cases: ___
- [ ] No blocking I/O in async functions: ___
- [ ] File stays under 700 lines: ___
- [ ] No N+1 queries (eager loading used): ___

**AI Integration** (if applicable):
- [ ] Tool returns operation payload (not direct mutation): ___
- [ ] Prompt caching enabled (cache_control: ephemeral): ___
- [ ] ResilientExecutor used for external API calls: ___
- [ ] Human-in-the-loop approval for destructive actions: ___

**If any score <0.9, address gaps before completion.**

---

## Common Patterns Reference

### Load Order for New Features

1. `docs/architect/feature-story-mapping.md` → Find US-XX and components
2. `docs/dev-pattern/45-pilot-space-patterns.md` → Project-specific overrides
3. Domain-specific pattern → (e.g., `07-repository.md`, `08-service-layer.md`)
4. Cross-cutting patterns → (e.g., `26-di.md`, `06-validation.md`)

### Key Documentation

| Topic | Document |
|-------|----------|
| Architecture overview | `docs/architect/backend-architecture.md` |
| RLS patterns | `docs/architect/rls-patterns.md` |
| Design decisions | `docs/DESIGN_DECISIONS.md` |
| API specification | `backend/docs/api-spec.md` |

---

## Standards Summary

**Don't use**:
- Placeholders, TODOs, or pseudo-code
- Mocks or stubs in production code
- Blocking I/O in async functions
- Direct SQLAlchemy model manipulation in API layer

**Always use**:
- Service classes with explicit payloads
- Repository pattern for data access
- RFC 7807 Problem Details for errors
- Async SQLAlchemy with RLS enforcement
- Dependency injection for all dependencies
- Conventional commits (feat/fix/refactor)
