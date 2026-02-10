# Application Services Layer - Pilot Space

**For parent layer overview, see [application/CLAUDE.md](../../application/CLAUDE.md)**

---

## Overview

Application services implement business logic via the CQRS-lite pattern (DD-064). Every service follows `Service.execute(Payload) -> Result` with explicit dataclass payloads, typed results, and async execution. Services are the single entry point for all business operations -- routers, webhooks, and AI tools all call through services.

---

## Service Inventory (35 Services Across 11 Domains)

```
note/ (5 services)
  CreateNoteService, UpdateNoteService, GetNoteService,
  CreateNoteFromChatService, AIUpdateService

issue/ (5 services)
  CreateIssueService, UpdateIssueService, ListIssuesService,
  GetIssueService, ActivityService

cycle/ (5 services)
  CreateCycleService, UpdateCycleService, GetCycleService,
  AddIssueToCycleService, RolloverCycleService

ai_context/ (3 services)
  GenerateAIContextService, RefineAIContextService, ExportAIContextService

annotation/ (1 service)
  CreateAnnotationService

discussion/ (1 service)
  CreateDiscussionService

integration/ (4 services)
  ConnectGitHubService, LinkCommitService,
  ProcessWebhookService, AutoTransitionService

onboarding/ (3 services)
  CreateGuidedNoteService, GetOnboardingService, UpdateOnboardingService

role_skill/ (4 services)
  CreateRoleSkillService, UpdateRoleSkillService,
  GenerateRoleSkillService, ListRoleSkillsService

homepage/ (3 services)
  GetActivityService, GetDigestService, DismissSuggestionService

workspace.py (1 service)
  WorkspaceService (InviteMember)
```

---

## Note Services (5)

**Location**: `backend/src/pilot_space/application/services/note/`

### CreateNoteService

```python
@dataclass
class CreateNotePayload:
    workspace_id: UUID
    owner_id: UUID
    title: str
    content: dict[str, Any] | None = None  # TipTap JSON
    summary: str | None = None
    project_id: UUID | None = None
    template_id: UUID | None = None  # Copy from template
    is_pinned: bool = False

@dataclass
class CreateNoteResult:
    note: Note
    word_count: int = 0
    reading_time_mins: int = 0
    template_applied: bool = False
```

**Responsibilities**: Validate title (not empty, <255 chars), copy content from template if provided, calculate word count and reading time, persist note, return metadata.

**Usage**:
```python
service = CreateNoteService(session=session)
result = await service.execute(
    CreateNotePayload(
        workspace_id=workspace.id,
        owner_id=user.id,
        title="Design Review Notes",
        is_pinned=True,
    )
)
return NoteResponse.from_domain(result.note)
```

### UpdateNoteService

Updates note blocks and metadata with smart content diffing. Tracks which fields changed for activity logging.

```python
@dataclass
class UpdateNotePayload:
    workspace_id: UUID
    note_id: UUID
    title: str | None = None
    content: dict[str, Any] | None = None
    summary: str | None = None
    is_pinned: bool | None = None

@dataclass
class UpdateNoteResult:
    note: Note
    changed_fields: list[str]
```

### GetNoteService

Retrieves note with eager-loaded relationships (annotations, discussions, issue links). Always uses `.options(joinedload(...))`. Verifies workspace membership. Scoped by `workspace_id`.

```python
@dataclass
class GetNotePayload:
    workspace_id: UUID
    note_id: UUID

@dataclass
class GetNoteResult:
    note: Note
    annotation_count: int
    discussion_count: int
    linked_issue_count: int
```

### CreateNoteFromChatService

Converts chat session to persistent note (for saving conversations).

```python
@dataclass
class CreateNoteFromChatPayload:
    workspace_id: UUID
    user_id: UUID
    chat_session_id: UUID
    title: str

@dataclass
class CreateNoteFromChatResult:
    note: Note
    message_count: int
```

### AIUpdateService

Applies AI-generated content updates to notes (from AI enhancement workflows).

```python
@dataclass
class AIUpdatePayload:
    workspace_id: UUID
    note_id: UUID
    updates: list[dict]  # Block updates from AI
    ai_metadata: dict[str, Any]

@dataclass
class AIUpdateResult:
    note: Note
    blocks_updated: int
    activity_id: UUID
```

---

## Issue Services (5)

**Location**: `backend/src/pilot_space/application/services/issue/`

### CreateIssueService

Most complex service. Handles sequence ID generation, state defaults, label attachment.

```python
@dataclass
class CreateIssuePayload:
    # Required
    workspace_id: UUID
    project_id: UUID
    reporter_id: UUID
    name: str

    # Optional (sensible defaults)
    description: str | None = None
    description_html: str | None = None
    priority: IssuePriority = IssuePriority.NONE
    state_id: UUID | None = None  # Uses project default if None
    assignee_id: UUID | None = None
    cycle_id: UUID | None = None
    module_id: UUID | None = None
    parent_id: UUID | None = None
    estimate_points: int | None = None
    start_date: date | None = None
    target_date: date | None = None
    label_ids: list[UUID] = field(default_factory=list)

    # AI enhancement
    ai_metadata: dict[str, Any] | None = None
    ai_enhanced: bool = False

@dataclass
class CreateIssueResult:
    issue: Issue
    activities: list[Activity]
    ai_enhanced: bool = False
```

**Implementation Flow**:

```python
async def execute(self, payload: CreateIssuePayload) -> CreateIssueResult:
    # 1. Validate name (non-empty, <255 chars)
    if not payload.name or len(payload.name) > 255:
        raise ValueError("Issue name is required and <255 chars")

    # 2. Get next sequence ID (race-safe via database constraint)
    seq_id = await self._issue_repo.get_next_sequence_id(payload.project_id)

    # 3. Get default state if not provided
    state_id = payload.state_id or await self._get_default_state_id(payload.project_id)

    # 4. Create and persist domain entity
    issue = Issue(
        workspace_id=payload.workspace_id,
        project_id=payload.project_id,
        sequence_id=seq_id,
        name=payload.name.strip(),
        state_id=state_id,
        # ... other fields
    )
    issue = await self._issue_repo.create(issue)

    # 5. Attach labels + create activity records
    if payload.label_ids:
        await self._issue_repo.bulk_update_labels(issue.id, payload.label_ids)

    activities = [await self._activity_repo.create(
        Activity.create_for_issue_creation(payload.workspace_id, issue.id, ...)
    )]

    return CreateIssueResult(issue=issue, activities=activities)
```

**Key Points**:
- Sequence ID race-safe via database constraint (`SELECT FOR UPDATE`)
- Default state required; raises if not found
- Activity logging for audit trail
- Eager load relationships before response

### UpdateIssueService

Field-level change detection with sentinel `UNCHANGED` to distinguish "no change" from "set to null". Returns `changed_fields` list for client-side optimistic updates. Creates activity records for all mutations.

### ListIssuesService

Paginated search with filters (state, assignee, cycle, labels, search text). Supports cursor-based pagination. Full-text search via Meilisearch. All queries RLS-scoped by workspace_id.

### GetIssueService

Retrieves single issue with full relationships, activity history, and context. Optional related issues + linked notes.

### ActivityService

Logs all issue mutations for audit trail and activity feed. Activity types: CREATED, UPDATED, STATE_CHANGED, ASSIGNED, LABELED, AI_ENHANCED, DELETED.

---

## Cycle Services (5)

**Location**: `backend/src/pilot_space/application/services/cycle/`

| Service | Purpose | Key Validation |
|---------|---------|----------------|
| CreateCycleService | Create sprint/cycle | name required, end_date >= start_date, one ACTIVE per project |
| UpdateCycleService | Update with constraints | Cannot ACTIVE if issues exceed capacity, auto-deactivates others |
| GetCycleService | Retrieve with metrics | Velocity, issue counts by state, burn-down data |
| AddIssueToCycleService | Assign issue to cycle | State must support cycle (not Backlog/Done), cycle ACTIVE/DRAFT |
| RolloverCycleService | Complete and carry over | Archives Done, moves In Progress/Todo to next, calculates velocity |

---

## AI Context Services (3)

**Location**: `backend/src/pilot_space/application/services/ai_context/`

### GenerateAIContextService

Most complex service. Aggregates: related issues (embeddings), linked notes, code references (GitHub), historical context. Features: 1hr cache with Redis, Gemini 768-dim embeddings, semantic similarity (0.7 threshold), complexity detection, Claude Code prompt generation via AIContextAgent (Sonnet).

### RefineAIContextService

Improves context quality based on user feedback. Accepts `missing_info` list and generates additional context.

### ExportAIContextService

Exports context to markdown/JSON/claude_dev formats for sharing or integration.

---

## Annotation, Discussion, Integration Services

### CreateAnnotationService (`annotation/`)

Creates AI margin suggestions on note blocks. Validates: confidence [0.0-1.0], non-empty content, block exists. High confidence threshold: >=0.8.

### CreateDiscussionService (`discussion/`)

Atomically creates discussion thread + first comment in single transaction. Rollback on failure.

### Integration Services (`integration/`)

| Service | Purpose |
|---------|---------|
| ConnectGitHubService | OAuth code exchange, token encryption via Supabase Vault, user info fetch |
| ProcessWebhookService | GitHub webhook events (push, PR, release), HMAC-SHA256 signature verification |
| LinkCommitService | Auto-links commits to issues by parsing "Fixes #42", "Closes #123" |
| AutoTransitionService | PR opened -> In Review, PR merged -> Done, Commit pushed -> In Progress |

---

## Onboarding, Role Skill, Homepage, Workspace Services

### Onboarding Services (`onboarding/`)

CreateGuidedNoteService (creates template notes), GetOnboardingService (tracks progress), UpdateOnboardingService (marks steps complete).

### Role Skill Services (`role_skill/`)

CreateRoleSkillService (max 3 roles, no duplicate `role_type`), UpdateRoleSkillService, GenerateRoleSkillService (AI-powered via Claude Sonnet with fallback), ListRoleSkillsService.

### Homepage Services (`homepage/`)

GetActivityService (workspace activity feed), GetDigestService (weekly/daily digest), DismissSuggestionService.

### WorkspaceService (`workspace.py`)

Invites member to workspace: immediate add if user exists, pending invitation if not. Auto-accepts on signup.

---

## Common Patterns

### State Transitions with Constraints

```python
async def transition_issue_state(
    self,
    issue_id: UUID,
    new_state_id: UUID,
    actor_id: UUID,
) -> UpdateIssueResult:
    """Transition issue with constraint validation."""
    issue = await self._issue_repo.get_by_id(issue_id)
    new_state = await self._state_repo.get_by_id(new_state_id)

    # Validate transition
    if not self._can_transition(issue.state, new_state):
        raise ValueError(
            f"Cannot transition from {issue.state.name} to {new_state.name}"
        )

    # If moving to In Progress, require cycle
    if new_state.group == StateGroup.IN_PROGRESS and not issue.cycle_id:
        raise ValueError("In Progress issues must be assigned to a cycle")

    # Update and log activity
    issue.state_id = new_state_id
    issue = await self._issue_repo.update(issue)

    activity = Activity.create_for_state_change(
        workspace_id=issue.workspace_id,
        issue_id=issue.id,
        actor_id=actor_id,
        old_state=...,
        new_state=new_state,
    )
    await self._activity_repo.create(activity)

    return UpdateIssueResult(issue=issue, activities=[activity])
```

### Bulk Operations

```python
async def bulk_assign_issues(
    self,
    workspace_id: UUID,
    issue_ids: list[UUID],
    assignee_id: UUID,
    actor_id: UUID,
) -> BulkAssignResult:
    """Assign multiple issues to same person."""
    issues = await self._issue_repo.get_many_by_ids(issue_ids)

    for issue in issues:
        issue.assignee_id = assignee_id
        await self._issue_repo.update(issue)

    activities = [
        Activity.create_for_assignment(
            workspace_id=workspace_id,
            issue_id=issue.id,
            actor_id=actor_id,
            assignee_id=assignee_id,
        )
        for issue in issues
    ]
    for activity in activities:
        await self._activity_repo.create(activity)

    return BulkAssignResult(issues=issues, activities=activities, total=len(issues))
```

### Caching with TTL

```python
async def get_issue_context(
    self,
    issue_id: UUID,
    force_refresh: bool = False,
) -> IssueContext:
    """Get cached context or generate if missing/stale."""
    cache_key = f"issue_context:{issue_id}"
    if not force_refresh:
        cached = await self._cache.get(cache_key)
        if cached:
            return json.loads(cached)

    context = await self._generate_context(issue_id)
    await self._cache.setex(cache_key, 3600, json.dumps(context))  # 1 hour TTL

    return context
```

---

## Service Instantiation

### In Router (preferred)

```python
@router.post("/issues")
async def create_issue(
    payload: IssueCreateRequest,
    session: DbSession,  # Injected by FastAPI
):
    service = CreateIssueService(
        session=session,
        issue_repository=IssueRepository(session),
        activity_repository=ActivityRepository(session),
        label_repository=LabelRepository(session),
    )
    result = await service.execute(...)
    return result
```

### Via DI Container (for complex setups)

```python
class Container(containers.DeclarativeContainer):
    create_issue_service = providers.Factory(
        CreateIssueService,
        session=session_factory,
        issue_repository=issue_repo,
        activity_repository=activity_repo,
    )
```

**Singletons vs Factories**:
- **Singletons**: Config, Engine, SessionFactory, ResilientExecutor
- **Factories**: Repositories, Services (new instance per request)

---

## Related Documentation

- **Parent layer**: [application/CLAUDE.md](../../application/CLAUDE.md) (CQRS-lite pattern, DI, error handling, transaction boundaries)
- **Repository pattern**: [infrastructure/database/CLAUDE.md](../../infrastructure/database/CLAUDE.md) (BaseRepository[T], eager loading, RLS)
- **Domain entities**: [domain/models/CLAUDE.md](../../domain/models/CLAUDE.md) (rich entities with behavior)
- **Design decisions**: `docs/DESIGN_DECISIONS.md` (DD-064: CQRS-lite)
