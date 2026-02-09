# Tasks: {FEATURE_NAME}

<!--
  TEMPLATE: Copy this file to specs/{NNN}-{feature-name}/tasks.md
  PREREQUISITE: Completed plan.md with all checklists passing.
  Replace all {PLACEHOLDER} values with concrete content.
  Run validation checklists at the bottom before marking complete.

  RULES:
  - Each task is a self-contained unit of work — an executor (human or AI) can pick it up
    and complete it without asking questions.
  - Every task has an exact file path, not a placeholder.
  - One responsibility per task. Never "Create X and implement Y".
  - Tasks follow phase ordering: Setup -> Foundation -> User Stories -> Polish.
  - Within stories: Tests -> Models -> Services -> Endpoints.

  INPUTS TO READ:
  - specs/{NNN}-{feature-name}/plan.md           (required — project structure, components)
  - specs/{NNN}-{feature-name}/spec.md            (required — user stories, acceptance criteria)
  - specs/{NNN}-{feature-name}/data-model.md      (recommended — entities to create)
  - specs/{NNN}-{feature-name}/contracts/          (recommended — endpoints to implement)
  - specs/{NNN}-{feature-name}/quickstart.md       (optional — validation scenarios)

  TASK FORMAT:
  - [ ] T{NNN} [{markers}] {Imperative verb} {component} in {exact/file/path.ext}

  MARKERS:
  [P]   = Parallelizable (different files, no shared dependencies)
  [USn] = User story label (Phase 3+ only)
-->

**Feature**: {FEATURE_NAME}
**Branch**: `{NNN}-{feature-short-name}`
**Created**: {YYYY-MM-DD}
**Source**: `specs/{NNN}-{feature-name}/`
**Author**: {NAME}

---

## Phase 1: Setup

<!--
  Project initialization and shared configuration.
  All tasks here must complete before Phase 2 can start.
-->

- [ ] T001 Create project structure per plan.md layout
- [ ] T002 Initialize project with framework dependencies
- [ ] T003 [P] Configure linting ({linter}) and formatting ({formatter})
- [ ] T004 [P] Configure type checking ({type_checker})
- [ ] T005 [P] Configure test framework ({test_framework})

**Checkpoint**: Project scaffolding complete. `{lint_command}` and `{type_check_command}` pass on empty project.

---

## Phase 2: Foundation

<!--
  Core shared infrastructure required before any user story work.
  Entities used by ALL stories go here. Story-specific entities go in story phases.
-->

- [ ] T006 Create base model/entity class in {path/to/base_model.ext}
- [ ] T007 [P] Set up database connection and migration tooling in {path/to/db.ext}
- [ ] T008 [P] Implement authentication middleware in {path/to/auth.ext}
- [ ] T009 [P] Configure error handling and logging in {path/to/errors.ext}
- [ ] T010 Create shared entity: {Entity} model in {path/to/models/entity.ext}
- [ ] T011 [P] Create shared entity: {Entity} model in {path/to/models/entity.ext}

<!--
  Add more shared infrastructure tasks as needed.
  RULE: If an entity is used by only ONE story, put it in that story's phase.
  If used by 2+ stories, put it here in Foundation.
-->

**Checkpoint**: Foundation complete. Auth works, shared entities created, error handling configured. User story phases can now start.

---

## Phase 3: User Story 1 — {US1 Title} (P1) — MVP

<!--
  The highest-priority story. After this phase, you have a demoable MVP slice.
  Source: spec.md User Story 1
-->

**Goal**: {What this story delivers — one sentence from spec}
**Verify**: {How to test independently — from spec's "Independent Test" field}

### Tests

<!--
  TDD: Write tests first. Verify they FAIL before implementing.
  Skip this section if project doesn't follow TDD.
-->

- [ ] T{NNN} [P] [US1] Write contract tests in {path/to/tests/contract/test_name.ext}
- [ ] T{NNN} [P] [US1] Write integration tests in {path/to/tests/integration/test_name.ext}
- [ ] T{NNN} [P] [US1] Write unit tests in {path/to/tests/unit/test_name.ext}

### Implementation

- [ ] T{NNN} [P] [US1] Create {Entity} model in {path/to/models/entity.ext}
- [ ] T{NNN} [P] [US1] Create {Entity} model in {path/to/models/entity.ext}
- [ ] T{NNN} [US1] Create {Entity}Repository in {path/to/repositories/entity_repo.ext}
- [ ] T{NNN} [US1] Implement {Service} in {path/to/services/service.ext}
- [ ] T{NNN} [US1] Implement {resource} endpoints in {path/to/api/v1/resource.ext}
- [ ] T{NNN} [US1] Add request/response schemas in {path/to/schemas/resource.ext}
- [ ] T{NNN} [P] [US1] Create {Component} in {path/to/components/Component.ext}
- [ ] T{NNN} [P] [US1] Create {Store} in {path/to/stores/Store.ext}

**Checkpoint**: US1 complete — {description of what can be demonstrated}. Verify with `quickstart.md` Scenario 1.

---

## Phase 4: User Story 2 — {US2 Title} (P2)

<!--
  Second priority story. Can start after Foundation (Phase 2) completes.
  Can run in PARALLEL with US1 if no shared dependencies.
  Source: spec.md User Story 2
-->

**Goal**: {What this story delivers}
**Verify**: {How to test independently}

### Tests

- [ ] T{NNN} [P] [US2] Write contract tests in {path/to/tests/contract/test_name.ext}
- [ ] T{NNN} [P] [US2] Write integration tests in {path/to/tests/integration/test_name.ext}

### Implementation

- [ ] T{NNN} [P] [US2] Create {Entity} model in {path/to/models/entity.ext}
- [ ] T{NNN} [US2] Implement {Service} in {path/to/services/service.ext}
- [ ] T{NNN} [US2] Implement {resource} endpoints in {path/to/api/v1/resource.ext}
- [ ] T{NNN} [P] [US2] Create {Component} in {path/to/components/Component.ext}

**Checkpoint**: US2 complete — {what can be demonstrated}. Verify with `quickstart.md` Scenario {N}.

---

## Phase {N}: User Story {N} — {Title} (P{N})

<!--
  Repeat this phase structure for each additional user story.
  Each story follows the same pattern: Goal -> Verify -> Tests -> Implementation -> Checkpoint.
  Delete this section if there are no more stories.
-->

**Goal**: {What this story delivers}
**Verify**: {How to test independently}

### Tests

- [ ] T{NNN} [P] [US{N}] {test tasks}

### Implementation

- [ ] T{NNN} [US{N}] {implementation tasks}

**Checkpoint**: US{N} complete — {what can be demonstrated}.

---

## Phase Final: Polish

<!--
  Cross-cutting concerns after all stories complete.
-->

- [ ] T{NNN} [P] Run full quickstart.md validation (all scenarios)
- [ ] T{NNN} [P] Add missing unit tests to reach >{N}% coverage
- [ ] T{NNN} Code cleanup — remove dead code, ensure file size limits
- [ ] T{NNN} [P] Update API documentation
- [ ] T{NNN} Run full quality gates: `{lint_command} && {type_check_command} && {test_command}`

**Checkpoint**: Feature complete. All quality gates pass. All quickstart scenarios verified.

---

## Dependencies

### Phase Order

```
Phase 1 (Setup) -> Phase 2 (Foundation) -> Phase 3+ (Stories) -> Phase Final (Polish)
```

### Story Independence

<!--
  Specify whether stories can run in parallel or must be sequential.
-->

- [ ] US1 and US2 can run in parallel after Foundation (different files, no shared deps)
- [ ] US{N} depends on US{M} (shared entity {Entity} created in US{M})

### Within Each Story

```
Tests (write first, verify fail) -> Models -> Repositories -> Services -> Endpoints -> Components
```

### Parallel Opportunities

<!--
  List task groups that can run concurrently.
  Tasks marked [P] in the same phase can run at the same time.
-->

| Phase | Parallel Group | Tasks |
|-------|---------------|-------|
| Phase 1 | Config tasks | T003, T004, T005 |
| Phase 2 | Infrastructure | T007, T008, T009 |
| Phase 3 | US1 tests | T{NNN}, T{NNN}, T{NNN} |
| Phase 3 | US1 models | T{NNN}, T{NNN} |

---

## Task Quality Rules

<!--
  Use this as a reference when writing individual tasks.
  Every task must satisfy these criteria.
-->

| Rule | Good Example | Bad Example |
|------|-------------|-------------|
| Imperative verb | "Create User model" | "User model" |
| Exact file path | "in backend/src/models/user.py" | "in the models folder" |
| One responsibility | "Create User model" | "Create User model and add validation" |
| Observable outcome | "Model has 8 fields matching data-model.md" | "Model is correct" |
| Error cases | "Returns 400 for missing email" | "Handles errors" |
| References source | "per data-model.md#User" | "per the spec" |

---

## Execution Strategy

<!--
  Choose ONE strategy. Delete the others.
-->

### Option A: MVP-First (Recommended for uncertain requirements)

```
Setup -> Foundation -> US1 only -> Validate -> Demo/Deploy
```
Ship P1 story, gather feedback before building P2+.

### Option B: Incremental (Recommended for stable requirements)

```
Setup -> Foundation -> US1 -> Deploy -> US2 -> Deploy -> US3 -> Deploy
```
Deploy after each story for continuous delivery.

### Option C: Parallel Team (Recommended when multiple developers available)

```
Setup -> Foundation -> [Dev A: US1] + [Dev B: US2] -> Polish
```
Stories run in parallel when Foundation is complete.

**Selected Strategy**: {A / B / C} — {one-sentence rationale}

---

## Validation Checklists

### Coverage Completeness

- [ ] Every user story from spec.md has a task phase
- [ ] Every entity from data-model.md has a creation task
- [ ] Every endpoint from contracts/ has an implementation task
- [ ] Every quickstart scenario has a validation task
- [ ] Setup and Polish phases included

### Task Quality

- [ ] Task IDs sequential (T001, T002...) with no gaps
- [ ] Each task has exact file path
- [ ] Each task starts with imperative verb
- [ ] One responsibility per task
- [ ] `[P]` markers only where tasks are truly independent
- [ ] `[USn]` markers on all Phase 3+ tasks

### Dependency Integrity

- [ ] No circular dependencies
- [ ] Phase order enforced: Setup -> Foundation -> Stories -> Polish
- [ ] Within-story order: Tests -> Models -> Services -> Endpoints
- [ ] Cross-story shared entities placed in Foundation phase
- [ ] Each phase has a checkpoint statement

### Execution Readiness

- [ ] Any developer can pick up any task and execute without questions
- [ ] File paths match plan.md project structure exactly
- [ ] Quality gate commands specified in Polish phase
- [ ] Execution strategy selected with rationale

---

## Common Mistakes to Check

| Mistake | How to Detect | Fix |
|---------|--------------|-----|
| Task too large | Description has "and" joining actions | Split into separate tasks |
| Missing file path | Task says "in the service layer" | Use exact path from plan.md |
| False parallel marker | `[P]` tasks share imports/entities | Remove `[P]`, make sequential |
| Tests after implementation | Test tasks numbered after impl tasks | Reorder: tests first |
| Missing Foundation | Story tasks create shared entities | Move shared entities to Phase 2 |
| No checkpoint | Phase ends without verification step | Add checkpoint with quickstart ref |
| Skipped task IDs | T001, T002, T005 (gap at T003-T004) | Renumber sequentially |

---

## Next Phase

After this task list passes all checklists:

1. **Run consistency analysis** — Verify spec + plan + tasks alignment
2. **Assign and execute** — Each task is a self-contained work unit
3. **Track progress** — Check off tasks, verify checkpoints at phase boundaries
4. **Prepare for implementation** — Follow `references/template-implement.md` for coding steps
