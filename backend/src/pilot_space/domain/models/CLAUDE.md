# Domain Models Deep-Dive - Pilot Space

**For domain layer overview, see [domain/CLAUDE.md](../CLAUDE.md)**

---

## Overview

The domain layer contains 12 rich entities with behavior, validation, and business rules. Entities live in `/backend/src/pilot_space/infrastructure/database/models/` (co-located with ORM) and are re-exported through `/backend/src/pilot_space/domain/models/`. All multi-tenant entities require `workspace_id` and enforce RLS at the database level.

---

## Issue Entity

**File**: `/backend/src/pilot_space/infrastructure/database/models/issue.py`

Core work item for the platform. Issues are the primary business object with rich behavior and state machine.

### State Machine

```
Backlog -> Todo -> In Progress -> In Review -> Done
                                               |
                                          Cancelled (any <- Cancelled)
```

- Done -> Todo (reopen). Any -> Cancelled. No state skipping.
- Terminal states (Done, Cancelled) cannot transition except reopen.

### Key Properties

- `identifier` (e.g., PS-123) - project identifier + sequence_id
- `is_completed` - Done or Cancelled
- `is_active` - In Progress or In Review
- `has_ai_enhancements` - title/description/labels enhanced
- `duplicate_candidates` - AI-detected from ai_metadata

### Fields

| Field | Type | Constraint | Purpose |
|-------|------|-----------|---------|
| `sequence_id` | int | PK within project | Auto-incremented; never gaps |
| `name` | str(255) | NOT NULL | Issue title/summary |
| `description` | text | nullable | Detailed description (markdown) |
| `description_html` | text | nullable | Pre-rendered HTML |
| `priority` | enum | default=NONE | none/low/medium/high/urgent |
| `state_id` | UUID FK | NOT NULL | Current workflow state |
| `project_id` | UUID FK | NOT NULL | Parent project (cascade delete) |
| `assignee_id` | UUID FK | nullable | Assigned user (set null on delete) |
| `reporter_id` | UUID FK | NOT NULL | Creator (restrict on delete) |
| `cycle_id` | UUID FK | nullable | Sprint/iteration assignment |
| `module_id` | UUID FK | nullable | Epic/feature grouping |
| `parent_id` | UUID FK | nullable | For sub-task hierarchies |
| `estimate_points` | int | nullable | Story points estimate |
| `start_date` | date | nullable | Planned start date |
| `target_date` | date | nullable | Due date |
| `sort_order` | int | default=0 | Manual sort order |
| `ai_metadata` | JSONB | nullable | AI enhancements, duplicates, suggestions |

### AI Metadata Structure

Tracks enhancements (title_enhanced, description_expanded), suggestions (labels_suggested with confidence scores), priority/assignee recommendations, duplicate candidates (with similarity scores and explanations), and metadata (model, timestamp).

### Relationships

- `project` (FK) - Parent project
- `state` (FK) - Current workflow state
- `assignee` (FK, nullable) - Assigned user
- `reporter` (FK) - Creator (not nullable)
- `cycle` (FK, nullable) - Sprint assignment
- `module` (FK, nullable) - Epic assignment
- `parent` (self-referential, nullable) - Parent issue
- `sub_issues` (reverse) - Child issues
- `labels` (many-to-many) - Categorization
- `activities` (one-to-many) - Audit trail
- `note_links` (one-to-many) - Note-First traceability
- `ai_context` (one-to-one, nullable) - Aggregated context

### Indexes (13 total)

- Single: `project_id`, `state_id`, `assignee_id`, `reporter_id`, `cycle_id`, `module_id`, `parent_id`, `priority`, `is_deleted`, `created_at`, `target_date`
- Composite: `(project_id, state_id)`, `(project_id, assignee_id)`, `(workspace_id, project_id)`

### Constraints

- Unique: `(project_id, sequence_id)` - Sequence IDs unique within project
- All FKs non-nullable except optional assignments (assignee, cycle, module, parent)

---

## Note Entity

**File**: `/backend/src/pilot_space/infrastructure/database/models/note.py`

Primary document for Note-First workflow. Notes are collaborative canvases where thinking happens, and issues emerge naturally.

### Key Properties

- `calculate_reading_time()` - 200 words/minute, minimum 1 minute

### Fields

| Field | Type | Constraint | Purpose |
|-------|------|-----------|---------|
| `title` | str(500) | NOT NULL | Display title |
| `content` | JSONB | NOT NULL, default={} | TipTap/ProseMirror JSON doc |
| `summary` | text | nullable | AI-generated or user summary |
| `word_count` | int | default=0 | Computed word count |
| `reading_time_mins` | int | default=0 | Estimated reading time |
| `is_pinned` | bool | default=False | For quick access |
| `is_guided_template` | bool | default=False | Onboarding guided note flag |
| `template_id` | UUID FK | nullable | Base template used |
| `owner_id` | UUID FK | NOT NULL | Creator (cascade delete) |
| `project_id` | UUID FK | nullable | Project scope (optional) |
| `source_chat_session_id` | UUID FK | nullable | Homepage Hub origin |

### Content Structure (TipTap JSON)

```json
{"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "..."}]}]}
```

### Relationships

- `template` (FK, nullable) - Base template
- `owner` (FK) - Creator
- `project` (FK, nullable) - Project scope
- `source_chat_session` (FK, nullable) - Homepage origin
- `annotations` (one-to-many) - AI margin suggestions
- `discussions` (one-to-many) - Threaded discussions
- `issue_links` (one-to-many) - Note-Issue traceability

### Indexes (10 total)

- Single: `project_id`, `owner_id`, `template_id`, `is_pinned`, `is_deleted`, `is_guided_template`, `created_at`, `source_chat_session_id`
- Full-text search: `to_tsvector('english', title)` with GIN

---

## State Entity (Workflow States)

**File**: `/backend/src/pilot_space/infrastructure/database/models/state.py`

Represents workflow states for issues. Can be workspace-wide (default) or project-specific.

### State Groups

| Group | States | Terminal |
|-------|--------|----------|
| UNSTARTED | Backlog, Todo | No |
| STARTED | In Progress, In Review | No |
| COMPLETED | Done | Yes |
| CANCELLED | Cancelled | Yes |

### Default States

| State | Group | Color | Sequence |
|-------|-------|-------|----------|
| Backlog | UNSTARTED | #94a3b8 | 0 |
| Todo | UNSTARTED | #60a5fa | 1 |
| In Progress | STARTED | #fbbf24 | 2 |
| In Review | STARTED | #a78bfa | 3 |
| Done | COMPLETED | #22c55e | 4 |
| Cancelled | CANCELLED | #ef4444 | 5 |

### Key Properties

- `is_terminal` - COMPLETED or CANCELLED
- `is_active` - STARTED

### Fields

| Field | Type | Constraint | Purpose |
|-------|------|-----------|---------|
| `name` | str(50) | NOT NULL | Display name |
| `color` | str(20) | default=#6b7280 | Hex color for UI |
| `group` | enum | NOT NULL | Categorization |
| `sequence` | int | default=0 | Display order (lower = earlier) |
| `project_id` | UUID FK | nullable | Project scope (NULL = workspace-wide) |

### Constraints

- Unique: `(workspace_id, project_id, name)` - State names unique per scope

---

## Cycle Entity (Sprints/Iterations)

**File**: `/backend/src/pilot_space/infrastructure/database/models/cycle.py`

Container for sprint/iteration tracking with velocity and burndown metrics.

### Status Lifecycle

```
draft -> planned -> active -> completed
                                |
                            cancelled (from any)
```

### Key Properties

- `is_active` - ACTIVE status
- `is_completed` - COMPLETED status

### Fields

| Field | Type | Constraint | Purpose |
|-------|------|-----------|---------|
| `name` | str(255) | NOT NULL | Cycle name (e.g., "Sprint 1") |
| `description` | text | nullable | Optional context |
| `project_id` | UUID FK | NOT NULL | Parent project (cascade) |
| `status` | enum | default=DRAFT | Current status |
| `start_date` | date | nullable | Cycle start |
| `end_date` | date | nullable | Cycle end |
| `sequence` | int | default=0 | Display order |
| `owned_by_id` | UUID FK | nullable | Manager/scrum master |

### Constraints

- Unique: `(project_id, name)` - Cycle names unique within project

### State-Cycle Constraints (Business Rules)

| Issue State | Cycle Requirement |
|-------------|-------------------|
| Backlog | No cycle (unassigned) |
| Todo | Cycle optional |
| In Progress | Cycle required (active cycle) |
| In Review | Cycle required (active cycle) |
| Done | Cycle cleared when archived |
| Cancelled | Cycle cleared immediately |

---

## Module Entity (Epics/Features)

**File**: `/backend/src/pilot_space/infrastructure/database/models/module.py`

Epic/feature-level grouping for organizing related issues.

### Status Lifecycle

```
planned -> active -> completed
                        |
                    cancelled (from any)
```

### Key Properties

- `is_active` - ACTIVE status
- `is_complete` - COMPLETED or CANCELLED

### Fields

| Field | Type | Constraint | Purpose |
|-------|------|-----------|---------|
| `name` | str(255) | NOT NULL | Display name |
| `description` | text | nullable | Detailed description |
| `status` | enum | default=PLANNED | Lifecycle status |
| `target_date` | date | nullable | Deadline |
| `sort_order` | int | default=0 | Display order |
| `project_id` | UUID FK | NOT NULL | Parent project (cascade) |
| `lead_id` | UUID FK | nullable | Module lead/owner |

### Constraints

- Unique: `(project_id, name)` - Module names unique within project

---

## Activity Entity (Audit Trail)

**File**: `/backend/src/pilot_space/infrastructure/database/models/activity.py`

Immutable record of all changes and actions on issues. Used for audit logging, activity timelines, and analytics.

### Activity Types (32 total)

| Category | Types |
|----------|-------|
| Lifecycle | CREATED, UPDATED, DELETED, RESTORED |
| State/Priority | STATE_CHANGED, PRIORITY_CHANGED |
| Assignment | ASSIGNED, UNASSIGNED |
| Grouping | ADDED_TO_CYCLE, REMOVED_FROM_CYCLE, ADDED_TO_MODULE, REMOVED_FROM_MODULE |
| Labels | LABEL_ADDED, LABEL_REMOVED |
| Relationships | PARENT_SET, PARENT_REMOVED, SUB_ISSUE_ADDED, SUB_ISSUE_REMOVED |
| Dates | START_DATE_SET, TARGET_DATE_SET, ESTIMATE_SET |
| Notes | LINKED_TO_NOTE, UNLINKED_FROM_NOTE |
| Comments | COMMENT_ADDED, COMMENT_UPDATED, COMMENT_DELETED |
| AI | AI_ENHANCED, AI_SUGGESTION_ACCEPTED, AI_SUGGESTION_REJECTED, DUPLICATE_DETECTED, DUPLICATE_MARKED |

### Fields

| Field | Type | Constraint | Purpose |
|-------|------|-----------|---------|
| `issue_id` | UUID FK | NOT NULL | Target issue (cascade) |
| `actor_id` | UUID FK | nullable | User who performed action (NULL = system/AI) |
| `activity_type` | enum | NOT NULL | Type of activity |
| `field` | str(100) | nullable | Field name if update |
| `old_value` | text | nullable | Previous value |
| `new_value` | text | nullable | New value |
| `comment` | text | nullable | Comment text for comment activities |
| `metadata` | JSONB | nullable | Additional context |

### Immutability

- Activity records are never updated or deleted (append-only)
- `actor_id` can be NULL for system/AI actions
- Timestamps from `TimestampMixin` (created_at, updated_at = created_at for activities)

---

## NoteAnnotation Entity (AI Margin Suggestions)

**File**: `/backend/src/pilot_space/infrastructure/database/models/note_annotation.py`

AI-generated insights displayed in the right margin of notes. Supports human-in-the-loop workflow.

### Annotation Types

SUGGESTION, WARNING, QUESTION, INSIGHT, REFERENCE, ISSUE_CANDIDATE, INFO

### Annotation Status

PENDING, ACCEPTED, REJECTED, DISMISSED

### Fields

| Field | Type | Constraint | Purpose |
|-------|------|-----------|---------|
| `note_id` | UUID FK | NOT NULL | Parent note (cascade) |
| `block_id` | str(100) | NOT NULL | TipTap block ID |
| `type` | enum | default=SUGGESTION | Annotation type |
| `content` | text | NOT NULL | Annotation text |
| `confidence` | float | default=0.5 | AI confidence (0.0-1.0) |
| `status` | enum | default=PENDING | User processing status |
| `ai_metadata` | JSONB | nullable | Model, reasoning, context used |

### AI Metadata

Contains: `model`, `type`, `reasoning`, `context_used`, `confidence_factors` (pattern_match, semantic_similarity).

---

## NoteIssueLink Entity (Note-First Traceability)

**File**: `/backend/src/pilot_space/infrastructure/database/models/note_issue_link.py`

Bidirectional links between notes and issues, supporting Note-First workflow traceability.

### Link Types

| Type | Description |
|------|-------------|
| EXTRACTED | Issue created from note (user approves creation) |
| REFERENCED | Note references issue (bidirectional badge) |
| RELATED | General mention or loose relationship |
| INLINE | Issue rendered within note content at block_id location |

### Fields

| Field | Type | Constraint | Purpose |
|-------|------|-----------|---------|
| `note_id` | UUID FK | NOT NULL | Source note (cascade) |
| `issue_id` | UUID FK | NOT NULL | Target issue (cascade) |
| `link_type` | enum | default=RELATED | Relationship type |
| `block_id` | str(100) | nullable | TipTap block where link originates |

---

## WorkspaceOnboarding Entity

**File**: `/backend/src/pilot_space/domain/onboarding.py`

Domain entity tracking 4-step onboarding progress. Uses value object pattern for steps.

### Onboarding Steps (Value Object)

`ai_providers`, `invite_members`, `first_note`, `role_setup`

### Key Properties

- `completion_count` (0-4)
- `completion_percentage` (0-100)
- `is_complete` (all 4 steps)

### Key Methods

`complete_step()`, `uncomplete_step()`, `dismiss()`, `reopen()`, `set_guided_note()`

### Fields

| Field | Type | Constraint | Purpose |
|-------|------|-----------|---------|
| `workspace_id` | UUID FK | NOT NULL | Parent workspace |
| `steps` | Embedded | NOT NULL | OnboardingSteps value object |
| `guided_note_id` | UUID | nullable | ID of guided note |
| `dismissed_at` | datetime | nullable | Checklist dismissed timestamp |
| `completed_at` | datetime | nullable | All steps completed timestamp |

---

## Value Objects

Immutable enumerations defined by their attributes:

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

## Business Rules & Invariants

| Rule | Details |
|------|---------|
| **Issue State Machine** | Backlog -> Todo -> In Progress -> In Review -> Done. Done -> Todo (reopen). Any -> Cancelled. No skipping. |
| **Cycle-State Constraints** | Backlog: no cycle. Todo: optional. In Progress/Review: required (active). Done/Cancelled: cleared. |
| **Sequence ID** | Auto-incremented per project (PS-1, PS-2). Never gaps. Race prevention via `max(sequence_id) + 1`. |
| **Priority** | Default NONE. Ordering: NONE < LOW < MEDIUM < HIGH < URGENT (convention, not enforced). |
| **AI Metadata** | Append-only (never deleted). Duplicate candidates, suggestions tracked with confidence. |
| **Note Content** | Always valid TipTap/ProseMirror JSON: `{"type": "doc", "content": [...]}` |
| **Annotation Confidence** | Float 0.0-1.0. Default 0.5 (neutral). High threshold: >=0.8. |
| **Workspace Scoping** | All multi-tenant entities require `workspace_id`. RLS enforces at DB level. |

---

## Related Documentation

- **Domain layer overview**: [domain/CLAUDE.md](../CLAUDE.md) (value objects, services, events, business rules)
- **Infrastructure models**: [infrastructure/database/CLAUDE.md](../../infrastructure/database/CLAUDE.md) (SQLAlchemy, BaseModel, mixins)
- **Application services**: [application/services/CLAUDE.md](../../application/services/CLAUDE.md) (CQRS-lite using these entities)
- **Data model spec**: `specs/001-pilot-space-mvp/data-model.md` (21 entities)
