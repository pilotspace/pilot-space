# Domain Layer Documentation - Pilot Space

**Generated**: 2026-02-10 | **Scope**: Rich entities, value objects, domain services, events, business rules | **Language**: Python 3.12+

---

## Overview

The domain layer encapsulates Pilot Space's core business logic and rules. It contains:

- **Rich Domain Entities**: Issue, Note, Cycle, Module, Workspace, User, Project, State, Label, Activity
- **Value Objects**: IssuePriority, StateGroup, CycleStatus, ModuleStatus, AnnotationType, AnnotationStatus, NoteLinkType, ActivityType
- **Domain Services**: Pure business logic (no I/O) for complex operations
- **Domain Events**: DomainEvent base class for pub/sub communication
- **Business Rules & Invariants**: State machines, validation, constraints

All entities live in `/backend/src/pilot_space/domain/models/` with behaviors and validation in entity classes.

---

## Submodule Documentation

- **[models/CLAUDE.md](models/CLAUDE.md)** -- All 12 entity deep-dives: Issue (state machine, fields, relationships, indexes, constraints, AI metadata), Note (TipTap content, relationships), State (groups, defaults), Cycle (status lifecycle, state constraints), Module (status lifecycle), Activity (32 types, immutability), NoteAnnotation (types, status, AI metadata), NoteIssueLink (link types, constraints), WorkspaceOnboarding (steps value object, methods)

---

## Quick Reference

| Entity | File | Purpose | Key Methods |
|--------|------|---------|-------------|
| **Issue** | infrastructure/models/issue.py | Work item with state machine | `identifier`, `is_completed`, `is_active`, `has_ai_enhancements` |
| **Note** | infrastructure/models/note.py | Collaborative document (Note-First home) | `calculate_reading_time()` |
| **State** | infrastructure/models/state.py | Workflow state (Backlog->Done) | `is_terminal`, `is_active` |
| **Cycle** | infrastructure/models/cycle.py | Sprint/iteration container | `is_active`, `is_completed` |
| **Module** | infrastructure/models/module.py | Epic/feature grouping | `is_active`, `is_complete` |
| **Activity** | infrastructure/models/activity.py | Audit trail entry | (value object, no methods) |
| **NoteAnnotation** | infrastructure/models/note_annotation.py | AI margin suggestion | `confidence`, `status` tracking |
| **NoteIssueLink** | infrastructure/models/note_issue_link.py | Note-Issue relationship | (value object) |
| **WorkspaceOnboarding** | onboarding.py | 4-step onboarding state | State transitions, completion tracking |

---

## Value Objects

Immutable enumerations defined by their attributes.

| Value Object | Values |
|---|---|
| **IssuePriority** | NONE (default), LOW, MEDIUM, HIGH, URGENT |
| **StateGroup** | UNSTARTED, STARTED, COMPLETED, CANCELLED (terminal) |
| **CycleStatus** | DRAFT, PLANNED, ACTIVE, COMPLETED, CANCELLED |
| **ModuleStatus** | PLANNED, ACTIVE, COMPLETED, CANCELLED |
| **AnnotationType** | SUGGESTION, WARNING, QUESTION, INSIGHT, REFERENCE, ISSUE_CANDIDATE, INFO |
| **AnnotationStatus** | PENDING, ACCEPTED, REJECTED, DISMISSED |
| **NoteLinkType** | EXTRACTED, REFERENCED, RELATED, INLINE |

---

## Domain Services

Domain services contain **pure business logic with no infrastructure dependencies**. Currently empty; services live in `/application/services/`.

Pure business logic services transform entities without I/O. Examples include state transition validation (sequence ordering, terminal state checks) and issue extraction from notes (title/description parsing, default state assignment).

---

## Domain Events

Domain events notify listeners of business-critical state changes. Emitted after successful persistence.

**Planned event types**: IssueCreated, IssueStateChanged, IssueAssigned, IssuePriorityChanged, NoteCreated, NoteAnnotationAdded, CycleStarted, CycleCompleted.

**Pattern**: Entities collect events in `.events` list. Repositories publish events after flush. Event bus decouples listeners (Activity logging, Webhook notifications, Integration triggers).

---

## Business Rules & Invariants

- **Issue State Machine**: Backlog -> Todo -> In Progress -> In Review -> Done. Done -> Todo (reopen). Any -> Cancelled. No state skipping.
- **Cycle-State Constraints**: Backlog = no cycle. Todo = optional. In Progress/In Review = required active cycle. Done/Cancelled = cleared.
- **Sequence ID**: Auto-incremented per project (PS-1, PS-2). Never gaps. Race-safe via `max(sequence_id) + 1`.
- **Priority**: Default NONE. Ordering: NONE < LOW < MEDIUM < HIGH < URGENT.
- **AI Metadata**: Append-only (never deleted). Duplicate candidates + suggestions tracked with confidence scores.
- **Note Content**: Always valid TipTap/ProseMirror JSON. `{"type": "doc", "content": [...]}`
- **Annotation Confidence**: Float 0.0-1.0. Default 0.5.
- **Workspace Scoping**: All multi-tenant entities require `workspace_id`. RLS enforced at DB level.

---

## Patterns & Conventions

- **Rich Entities**: Embed behavior (state transitions, validation, AI metadata updates) in entity classes, not anemic data containers.
- **Validation Layers**: API Boundary (Pydantic, shape/type) -> Domain Entity (business rules, invariants).
- **Immutable Value Objects**: OnboardingSteps and enums are immutable. Use `replace()` for updates.
- **Aggregate Design**: Group related entities with clear boundaries (Issue root + Activity + NoteIssueLink children).
- **Default Values**: Constructors provide sensible defaults (priority=NONE, state=Backlog, cycle=None).

---

## File Organization

```
backend/src/pilot_space/domain/
+-- __init__.py                 # Domain layer exports
+-- onboarding.py               # WorkspaceOnboarding entity + OnboardingSteps
+-- models/
|   +-- __init__.py             # Re-exports all domain models from infrastructure
|   +-- CLAUDE.md               # Entity deep-dives (see submodule)
+-- events/
|   +-- __init__.py             # Domain events (currently empty)
+-- services/
    +-- __init__.py             # Domain services (currently empty)

# Actual implementations live in infrastructure for ORM integration
backend/src/pilot_space/infrastructure/database/models/
+-- issue.py, note.py, state.py, cycle.py, module.py,
    activity.py, note_annotation.py, note_issue_link.py, ...
```

---

## Related Documentation

- **Backend Architecture**: `/backend/CLAUDE.md` (5-layer Clean Architecture)
- **Repository Pattern**: [infrastructure/database/CLAUDE.md](../infrastructure/database/CLAUDE.md) (BaseRepository[T])
- **Application Services**: [application/CLAUDE.md](../application/CLAUDE.md) (CQRS-lite execution)
- **Design Decisions**: `/docs/DESIGN_DECISIONS.md` (88 total)

---

## Generation Metadata

**Scope**: 12 rich entities, 8 value objects, domain services, events, business rules. **Patterns**: Rich entities, state machines, value objects, append-only audit trail, soft delete, workspace scoping, AI metadata JSONB. **Coverage Gaps**: Domain services empty, domain events planned but not implemented.
