# Feature Specification: {FEATURE_NAME}

<!--
  TEMPLATE: Copy this file to specs/{NNN}-{feature-name}/spec.md
  Replace all {PLACEHOLDER} values with concrete content.
  Run the validation checklists at the bottom before marking complete.

  RULES:
  - Focus on WHAT users need and WHY. Never describe HOW to implement.
  - No technology names (no React, PostgreSQL, Redis, WebSocket, etc.)
  - Max 3 [NEEDS CLARIFICATION] markers — force decisions, don't defer everything.
  - Each user story must be independently testable and demo-able.
-->

**Feature Number**: {NNN}
**Branch**: `{NNN}-{feature-short-name}`
**Created**: {YYYY-MM-DD}
**Status**: Draft
**Author**: {NAME}

---

## Problem Statement

**Who**: {persona or role affected by this problem}

**Problem**: {what pain point, gap, or unmet need exists}

**Impact**: {business cost of not solving — lost revenue, wasted time, user churn, etc.}

**Success**: {what does "solved" look like from the user's perspective}

---

## Stakeholders

| Stakeholder | Role | Interest | Input Needed | Review Point |
|-------------|------|----------|-------------|-------------|
| {Name} | Product Owner | {what they care about} | {what you need from them} | Spec review |
| {Name} | Tech Lead | {what they care about} | {what you need from them} | Pre-plan review |
| {Name} | End User | {what they care about} | {what you need from them} | Acceptance test |
| {Name} | QA | {what they care about} | {what you need from them} | Scenario review |

---

## User Scenarios & Testing

<!--
  PRIORITY RULES:
  P1 = Core value, MVP-critical (must ship)
  P2 = Important, not blocking MVP demo
  P3 = Enhancement, nice-to-have for launch
  P4 = Future consideration, post-launch

  Each story must be INDEPENDENTLY TESTABLE — if you implement just this one story,
  you still have a viable product slice that delivers value.
-->

### User Story 1 — {Brief Title} (Priority: P1)

{Plain language description of the user journey. Write as if explaining to a non-technical stakeholder.}

**Why this priority**: {Why P1? What core value does this deliver?}

**Independent Test**: {How can this story be tested and demo'd in isolation? e.g., "Can be fully tested by creating an account and logging in — delivers standalone auth capability."}

**Acceptance Scenarios**:

1. **Given** {initial state or precondition}, **When** {user action}, **Then** {observable outcome}
2. **Given** {different state}, **When** {same or different action}, **Then** {different outcome}
3. **Given** {error/edge condition}, **When** {action that triggers edge case}, **Then** {graceful handling}

---

### User Story 2 — {Brief Title} (Priority: P2)

{Plain language description of the user journey.}

**Why this priority**: {Why P2? What additional value does this add on top of P1?}

**Independent Test**: {How can this be tested in isolation?}

**Acceptance Scenarios**:

1. **Given** {precondition}, **When** {action}, **Then** {outcome}
2. **Given** {edge case}, **When** {action}, **Then** {graceful handling}

---

### User Story 3 — {Brief Title} (Priority: P{N})

{Add more stories as needed. Each follows the same structure.}

**Why this priority**: {Value justification}

**Independent Test**: {Isolation test description}

**Acceptance Scenarios**:

1. **Given** {precondition}, **When** {action}, **Then** {outcome}

---

### Edge Cases

<!--
  For each user story, list boundary conditions and failure scenarios.
  These become test cases during implementation.
-->

- What happens when {boundary condition, e.g., "user submits empty form"}?
- What happens when {error scenario, e.g., "network connection drops mid-save"}?
- What happens when {concurrency scenario, e.g., "two users edit the same item"}?
- What happens when {permission scenario, e.g., "guest user tries to access admin feature"}?
- What happens when {data limit, e.g., "user uploads file exceeding size limit"}?

---

## Requirements

### Functional Requirements

<!--
  RULES:
  - Use RFC 2119 keywords: MUST (required), SHOULD (recommended), MAY (optional)
  - One capability per requirement line
  - No technology names — describe WHAT, not HOW
  - Each requirement must be independently testable

  ANTI-PATTERNS:
  ❌ "System MUST use WebSocket"          → ✅ "System MUST deliver updates within 500ms"
  ❌ "System MUST be fast"                → ✅ "System MUST respond within 200ms P95"
  ❌ "System MUST be user-friendly"       → ✅ "90% of users complete task on first attempt"
  ❌ "MUST save and notify and log"       → ✅ Split into FR-001, FR-002, FR-003
-->

- **FR-001**: System MUST {capability} so that {benefit}
- **FR-002**: System MUST {capability} when {condition}
- **FR-003**: Users MUST be able to {key interaction}
- **FR-004**: System MUST {data requirement, e.g., "persist user preferences across sessions"}
- **FR-005**: System MUST {behavior, e.g., "log all authentication events"}
- **FR-006**: System SHOULD {recommended capability}
- **FR-007**: System MAY {optional capability}

<!--
  Mark genuinely ambiguous requirements:
  - **FR-008**: System MUST authenticate users via [NEEDS CLARIFICATION: auth method — email/password, SSO, OAuth?]
  Max 3 [NEEDS CLARIFICATION] markers. If you have more, make decisions with defaults.
-->

### Key Entities

<!--
  Define domain objects without implementation details.
  No column types, no database names — just what things ARE and how they relate.
-->

- **{Entity 1}**: {What it represents}. Key attributes: {list}. Relationships: {related entities}
- **{Entity 2}**: {What it represents}. Key attributes: {list}. Relationships: {related entities}
- **{Entity 3}**: {What it represents}. Key attributes: {list}. Relationships: {related entities}

---

## Success Criteria

<!--
  RULES:
  - Every criterion must have a NUMBER or THRESHOLD
  - Technology-agnostic (no "API returns 200", no "Redis cache hit rate")
  - Describe USER OUTCOMES, not system internals
  - Must be objectively verifiable (pass/fail, not subjective)
-->

- **SC-001**: {User-centric metric, e.g., "Users complete primary task in under 2 minutes"}
- **SC-002**: {System capacity metric, e.g., "System handles 1000 concurrent users without degradation"}
- **SC-003**: {Reliability metric, e.g., "System availability 99.9% during business hours"}
- **SC-004**: {Business metric, e.g., "Reduce support tickets related to X by 50%"}

---

## Constitution Compliance

<!--
  Cross-reference against memory/constitution.md.
  Check each principle that applies to this feature. Skip irrelevant ones.
-->

| Principle | Applies? | How Addressed |
|-----------|----------|--------------|
| I. AI-Human Collaboration | {Yes/No} | {How spec addresses approval flows, if applicable} |
| II. Note-First | {Yes/No} | {How spec aligns with note-first workflow, if applicable} |
| III. Documentation-Third | {Yes/No} | {How spec avoids manual doc maintenance} |
| IV. Task-Centric | {Yes/No} | {Are stories decomposable into independent tasks?} |
| V. Collaboration | {Yes/No} | {Knowledge-sharing aspects considered?} |
| VI. Agile Integration | {Yes/No} | {Do stories fit sprint planning?} |
| VII. Notation Standards | {Yes/No} | {Diagram/notation needs identified?} |

---

## Validation Checklists

### Requirement Completeness

- [ ] No `[NEEDS CLARIFICATION]` markers remain (or max 3 with documented justification)
- [ ] Every user story has acceptance scenarios with Given/When/Then
- [ ] Every story is independently testable and demo-able
- [ ] Edge cases documented for each story
- [ ] All entities have defined relationships

### Specification Quality

- [ ] Focus is WHAT/WHY, not HOW
- [ ] No technology names anywhere in requirements
- [ ] Requirements use RFC 2119 keywords (MUST/SHOULD/MAY)
- [ ] Success criteria are measurable with numbers/thresholds
- [ ] Written for business stakeholders, not developers
- [ ] One capability per FR line (no compound requirements)

### Structural Integrity

- [ ] Stories prioritized P1 through P{N}
- [ ] Functional requirements numbered sequentially (FR-001, FR-002...)
- [ ] Key entities identified with attributes and relationships
- [ ] No duplicate or contradicting requirements
- [ ] Problem statement clearly defines WHO/PROBLEM/IMPACT/SUCCESS

### Constitution Gate

- [ ] All applicable principles checked and addressed
- [ ] No violations (or violations documented with justification)

---

## Common Mistakes to Check

| Mistake | How to Detect | Fix |
|---------|--------------|-----|
| Implementation leak | Search for tech names (React, SQL, API, etc.) | Rewrite as outcome/behavior |
| Vague requirement | FR has no number/threshold | Add measurable criterion |
| Untestable criterion | Can't write a pass/fail test for it | Rewrite with observable outcome |
| Compound FR | FR contains "and" joining two capabilities | Split into separate FR lines |
| Too many unknowns | More than 3 `[NEEDS CLARIFICATION]` | Make default decisions, document rationale |
| Stories not independent | Story N requires Story N-1 to demo | Restructure so each delivers standalone value |

---

## Next Phase

After this spec passes all checklists:

1. **Resolve remaining ambiguities** — Address any `[NEEDS CLARIFICATION]` markers
2. **Proceed to planning** — Use `template-plan.md` to create the implementation plan
3. **Share for review** — This spec is the alignment artifact for all stakeholders
