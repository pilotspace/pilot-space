# Application Services Layer - Pilot Space

**Purpose**: Command and query handlers for all business logic. Domain-focused, async-first, dependency-injected.

**Coverage**: 11 domain service groups, 35+ individual service classes.

---

## Quick Reference

### Quality Gates

```bash
uv run pyright && uv run ruff check && uv run pytest --cov=.
```

### Service Count & Organization

```
11 service groups:
+-- note/ (5 services): Create, Update, Get, CreateFromChat, AIUpdate
+-- issue/ (5 services): Create, Update, List, Get, Activity
+-- cycle/ (5 services): Create, Update, Get, AddToIssue, Rollover
+-- ai_context/ (3 services): Generate, Refine, Export
+-- annotation/ (1 service): Create with confidence scoring
+-- discussion/ (1 service): Create with atomic first comment
+-- integration/ (4 services): GitHub OAuth, Webhook, Commit linking, Auto-transition
+-- onboarding/ (3 services): CreateGuidedNote, GetProgress, UpdateProgress
+-- role_skill/ (4 services): Create, Update, Generate, List
+-- homepage/ (3 services): Activity, Digest, DismissSuggestion
+-- workspace.py (1 service): InviteMember
```

---

## Submodule Documentation

- **[services/CLAUDE.md](services/CLAUDE.md)** -- All 11 service groups by domain with detailed payloads, results, implementation flows, and common patterns

---

## Core Pattern: CQRS-lite (DD-064)

Every service follows the same structure:

```python
@dataclass
class CommandPayload:
    """Validated input at API boundary."""
    workspace_id: UUID
    # Optional fields with sensible defaults

@dataclass
class CommandResult:
    """Typed output from service."""
    entity: DomainEntity
    # Additional computed fields

class SomeService:
    def __init__(self, session: AsyncSession, repository: SomeRepository):
        self._session = session
        self._repo = repository

    async def execute(self, payload: CommandPayload) -> CommandResult:
        """Execute the command. Payload -> Validation -> Repository -> Result."""
```

**Benefits**: Explicit payloads, one-way flow, testable in isolation, clear separation, traceable in logs.

**Commands** (mutations): `CreateIssueService.execute(CreateIssuePayload) -> CreateIssueResult`

**Queries** (reads): `GetIssueService.execute(GetIssuePayload) -> GetIssueResult`

---

## Service Composition & Dependency Injection (Updated 2026-02-10)

### Service Instantiation Patterns

**Pattern 1: Router with Type Aliases (Recommended)**
```python
from dependency_injector.wiring import inject
from pilot_space.api.v1.dependencies import CreateIssueServiceDep
from pilot_space.dependencies.auth import SessionDep

@router.post("/issues")
@inject
async def create_issue(
    request: IssueCreateRequest,
    session: SessionDep,  # Trigger ContextVar session
    service: CreateIssueServiceDep,  # Auto-injected from container
):
    result = await service.execute(CreateIssuePayload(...))
    return IssueResponse.from_issue(result.issue)
```

**Pattern 2: Container Provider (For Complex Setup)**
```python
from pilot_space.container import Container

container = Container()
service = container.create_issue_service()
result = await service.execute(...)
```

**Pattern 3: Manual (Testing/Scripts Only)**
```python
# Only use for one-off scripts or specific test scenarios
service = CreateIssueService(
    session=session,
    issue_repository=IssueRepository(session),
    activity_repository=ActivityRepository(session),
)
```

### All Services Use Constructor Injection

```python
class CreateIssueService:
    def __init__(
        self,
        session: AsyncSession,
        issue_repository: IssueRepository,  # ✅ Constructor injection
        activity_repository: ActivityRepository,
    ):
        self._session = session
        self._repo = issue_repository
        self._activity_repo = activity_repository

    async def execute(self, payload):
        issue = await self._repo.create(...)  # Use injected repo
```

### Container Configuration

**All 38 services defined in**: `backend/src/pilot_space/container.py`

**Session Injection Pattern**:
```python
issue_repository = providers.Factory(
    IssueRepository,
    session=providers.Callable(get_current_session),  # ContextVar session
)

create_issue_service = providers.Factory(
    CreateIssueService,
    session=providers.Callable(get_current_session),
    issue_repository=issue_repository,  # Auto-wired
    activity_repository=activity_repository,
)
```

### Testing Services

**Recommended**: Override at container level
```python
from pilot_space.main import app
from pilot_space.container import Container

mock_service = Mock(spec=CreateIssueService)
app.dependency_overrides[Container.create_issue_service] = lambda: mock_service

# Test via HTTP
response = client.post("/api/v1/issues", json={...})
```

**Alternative**: Direct instantiation with mock repositories
```python
mock_repo = Mock(spec=IssueRepository)
service = CreateIssueService(
    session=mock_session,
    issue_repository=mock_repo,
    activity_repository=mock_activity_repo,
)
result = await service.execute(payload)
```

**Migration Status**: ✅ Complete (38/38 services use constructor injection)

---

## Payload & Result Patterns

### Payload Design

One `@dataclass` per operation, optional fields have sensible defaults.

```python
# Good: Explicit defaults with UNCHANGED sentinel
@dataclass
class UpdateIssuePayload:
    issue_id: UUID
    actor_id: UUID
    name: str | _Unchanged = UNCHANGED  # Explicit: no change
    description: str | None | _Unchanged = UNCHANGED
```

### Result Design

Always include computed metadata beyond the domain entity.

```python
@dataclass
class CreateIssueResult:
    issue: Issue  # Domain entity
    activities: list[Activity]  # Related entities
    ai_enhanced: bool  # Metadata about operation
```

---

## Transaction Boundaries

Each service receives `AsyncSession` (NOT sessionmaker). Session created per request, passed to service.

```python
async with get_session() as session:
    service = CreateIssueService(..., session=session)
    result = await service.execute(payload)
    # Session auto-commits on exit, rollback on exception
```

For multi-operation services:

```python
async def execute(self, payload: SomePayload) -> SomeResult:
    async with self._session.begin():  # Explicit transaction
        obj1 = await self._repo1.create(...)
        obj2 = await self._repo2.create(...)
        # Commits only if both succeed
```

---

## Error Handling

Raise `ValueError` or custom exceptions. Middleware converts to RFC 7807.

```python
async def execute(self, payload: CreateIssuePayload) -> CreateIssueResult:
    if not payload.name:
        raise ValueError("Issue name is required")
    if await self._check_duplicate(payload.name):
        raise ValueError("Issue with this name already exists")
```

---

## Best Practices

1. **Keep Services Focused**: Each service = one command or query. No `create_and_assign()`.
2. **Validate at Boundaries**: Pydantic validates shape in router; service validates business logic.
3. **Use Eager Loading**: Every repository query must eager-load relationships (prevent N+1).
4. **Log Strategically**: Log at entry/exit/errors. No logging inside loops.
5. **Test Services, Not Routers**: Test via `service.execute()`, not HTTP.
6. **Handle Soft Deletes**: Never hard delete. Use `is_deleted` flag.
7. **Avoid Mutable Default Arguments**: Use `field(default_factory=list)`.

---

## Common Patterns

### State Transitions with Constraints

```python
async def transition_issue_state(self, issue_id, new_state_id, actor_id):
    issue = await self._issue_repo.get_by_id(issue_id)
    new_state = await self._state_repo.get_by_id(new_state_id)
    if not self._can_transition(issue.state, new_state):
        raise ValueError(f"Cannot transition from {issue.state.name} to {new_state.name}")
    if new_state.group == StateGroup.IN_PROGRESS and not issue.cycle_id:
        raise ValueError("In Progress issues must be assigned to a cycle")
    issue.state_id = new_state_id
    issue = await self._issue_repo.update(issue)
```

### Caching with TTL

```python
async def get_issue_context(self, issue_id, force_refresh=False):
    cache_key = f"issue_context:{issue_id}"
    if not force_refresh:
        cached = await self._cache.get(cache_key)
        if cached:
            return json.loads(cached)
    context = await self._generate_context(issue_id)
    await self._cache.setex(cache_key, 3600, json.dumps(context))
    return context
```

---

## Standards Summary

- [ ] One `@dataclass` payload per operation
- [ ] Optional fields have sensible defaults (`field(default_factory=...)` for mutables)
- [ ] One `@dataclass` result per operation with computed metadata
- [ ] Async method named `execute(payload: Payload) -> Result`
- [ ] All database access via repositories (never direct SQLAlchemy)
- [ ] Eager load all relationships
- [ ] Raise `ValueError` for validation/business errors
- [ ] Create activity records for all mutations
- [ ] Tests cover happy path + 2 edge cases
- [ ] Coverage >80%
- [ ] No TODOs, mocks, or placeholders
- [ ] Type hints on all parameters and returns

---

## Related Documentation

- **Backend architecture**: `backend/CLAUDE.md` (5-layer Clean Architecture)
- **Repository pattern**: [infrastructure/database/CLAUDE.md](../infrastructure/database/CLAUDE.md) (BaseRepository[T])
- **Domain entities**: [domain/CLAUDE.md](../domain/CLAUDE.md) (rich domain models)
- **Design decisions**: `docs/DESIGN_DECISIONS.md` (DD-064: CQRS-lite)
- **Dev patterns**: `docs/dev-pattern/45-pilot-space-patterns.md`

---

## Generation Metadata

**Scope**: 11 domain service groups, 35+ individual service classes, 40+ payloads, 40+ results. **Patterns**: CQRS-lite, payload validation, result enrichment, transaction boundaries, activity logging, eager loading, RFC 7807 errors. **Coverage**: Note, Issue, Cycle, AI Context, Annotation, Discussion, Integration, Onboarding, Role Skill, Homepage, Workspace services.
