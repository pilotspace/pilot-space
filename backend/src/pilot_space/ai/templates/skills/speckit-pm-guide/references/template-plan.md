# Implementation Plan: {FEATURE_NAME}

<!--
  TEMPLATE: Copy this file to specs/{NNN}-{feature-name}/plan.md
  PREREQUISITE: Completed spec.md with all checklists passing.
  Replace all {PLACEHOLDER} values with concrete content.
  Run validation checklists at the bottom before marking complete.

  RULES:
  - This document answers HOW — translate spec requirements into technical architecture.
  - Every technical decision must trace to a requirement (FR-NNN) or constitution article.
  - Keep high-level; defer detailed algorithms and code samples to separate files.
  - Constitution gates are hard gates — must pass or document justified violations.

  SUPPORTING FILES TO CREATE:
  - specs/{NNN}-{feature-name}/research.md        (from Research Decisions section)
  - specs/{NNN}-{feature-name}/data-model.md       (from Data Model section)
  - specs/{NNN}-{feature-name}/contracts/rest-api.md (from API Contracts section)
  - specs/{NNN}-{feature-name}/quickstart.md       (from Quickstart section)
-->

**Feature**: {FEATURE_NAME}
**Branch**: `{NNN}-{feature-short-name}`
**Created**: {YYYY-MM-DD}
**Spec**: `specs/{NNN}-{feature-name}/spec.md`
**Author**: {NAME}

---

## Summary

{1-2 sentences: What this feature does (from spec) + the technical approach chosen.}

---

## Technical Context

| Attribute | Value |
|-----------|-------|
| **Language/Version** | {e.g., Python 3.12+, TypeScript 5.3+} |
| **Primary Dependencies** | {e.g., FastAPI 0.110+, Next.js 14+, SQLAlchemy 2.0} |
| **Storage** | {e.g., PostgreSQL 16+ with pgvector, or N/A} |
| **Testing** | {e.g., pytest + pytest-asyncio, Vitest + Playwright} |
| **Target Platform** | {e.g., Linux server, browser, iOS 15+} |
| **Project Type** | {single / web (frontend+backend) / mobile+API} |
| **Performance Goals** | {e.g., <200ms P95 API response, 60fps UI} |
| **Constraints** | {e.g., RLS multi-tenant isolation, <100MB memory} |
| **Scale/Scope** | {e.g., 5-100 users per workspace, 10K records} |

---

## Constitution Gate Check

<!--
  HARD GATE: Must pass before proceeding. If a gate fails, document the violation
  in the Complexity Tracking section with justification.
  Adapt gates to match your project's constitution (memory/constitution.md).
-->

### Technology Standards Gate

- [ ] Language/Framework matches constitution mandates
- [ ] Database choice aligns with constitution constraints
- [ ] Auth approach follows constitution requirements
- [ ] Architecture patterns match (e.g., CQRS-lite, Repository, Clean Architecture)

### Simplicity Gate

- [ ] Using minimum number of projects/services
- [ ] No future-proofing or speculative features
- [ ] No premature abstractions

### Quality Gate

- [ ] Test strategy defined with coverage target (>{N}%)
- [ ] Type checking enforced (pyright / TypeScript strict)
- [ ] File size limits respected ({N} lines max)
- [ ] Linting configured

---

## Requirements-to-Architecture Mapping

<!--
  Map every spec requirement to the technical components that implement it.
  This is the traceability bridge between WHAT (spec) and HOW (plan).
-->

| FR ID | Requirement (from spec) | Technical Approach | Components |
|-------|------------------------|-------------------|------------|
| FR-001 | {requirement text} | {how it will be implemented} | {service, model, endpoint} |
| FR-002 | {requirement text} | {how it will be implemented} | {service, model, endpoint} |
| FR-003 | {requirement text} | {how it will be implemented} | {service, model, endpoint} |
| FR-{NNN} | {requirement text} | {how it will be implemented} | {components} |

---

## Story-to-Component Matrix

| User Story | Backend Components | Frontend Components | Data Entities |
|------------|-------------------|--------------------|--------------  |
| US1: {title} | {services, repos} | {components, stores} | {entities} |
| US2: {title} | {services, repos} | {components, stores} | {entities} |
| US3: {title} | {services, repos} | {components, stores} | {entities} |

---

## Research Decisions

<!--
  For each significant technical choice, evaluate 2+ alternatives.
  Copy this section into a separate research.md if it grows large.
-->

| Question | Options Evaluated | Decision | Rationale (FR-NNN or constitution ref) |
|----------|-------------------|----------|----------------------------------------|
| {Technical question 1} | {Option A, Option B, Option C} | {Chosen} | {Why — cite FR-NNN or constitution article} |
| {Technical question 2} | {Option A, Option B} | {Chosen} | {Why} |
| {Technical question 3} | {Option A, Option B} | {Chosen} | {Why} |

---

## Data Model

<!--
  Translate spec entities into concrete data structures.
  Copy each entity to a separate data-model.md file.
-->

### {Entity 1}

**Purpose**: {What this entity represents — from spec}
**Source**: FR-{NNN}, US{N}

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK, auto-generated | |
| {field_name} | {type} | {NOT NULL, max length, FK, unique, etc.} | {business meaning} |
| {field_name} | {type} | {constraints} | {notes} |
| created_at | timestamp | NOT NULL, default NOW | |
| updated_at | timestamp | NOT NULL, auto-update | |
| {tenant_field} | UUID | FK, RLS filter | Multi-tenant isolation |

**Relationships**:
- Has many {Related Entity} (1:N)
- Belongs to {Parent Entity} (N:1)

**Indexes**:
- ({tenant_field}, created_at) — list queries
- ({tenant_field}, {search_field}) — search/filter queries

---

### {Entity 2}

**Purpose**: {What this entity represents}
**Source**: FR-{NNN}, US{N}

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK, auto-generated | |
| {field_name} | {type} | {constraints} | {notes} |

**Relationships**: {list with cardinality}

**Indexes**: {list with query purpose}

---

## API Contracts

<!--
  Define every endpoint/event before implementation.
  Copy to specs/{NNN}-{feature-name}/contracts/rest-api.md
-->

### {Endpoint 1}: {HTTP Method} /api/v1/{resource}

**Auth**: {Required (Bearer) / Public}
**Source**: FR-{NNN}, US{N}

**Request**:

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| {field} | {type} | {Yes/No} | {rules, e.g., "1-255 chars"} |
| {field} | {type} | {Yes/No} | {rules} |

**Response ({status})**:

| Field | Type | Description |
|-------|------|-------------|
| {field} | {type} | {what it contains} |

**Errors**:

| Status | Code | When |
|--------|------|------|
| 400 | VALIDATION_ERROR | {condition} |
| 401 | UNAUTHORIZED | {condition} |
| 403 | FORBIDDEN | {condition} |
| 404 | NOT_FOUND | {condition} |
| 409 | CONFLICT | {condition} |

---

### {Endpoint 2}: {HTTP Method} /api/v1/{resource}/{id}

{Repeat contract structure for each endpoint.}

---

## Project Structure

<!--
  Define the concrete file layout. All paths must be real — no "Option 1/2" placeholders.
  Choose the structure that matches your project type (single/web/mobile).
-->

```text
specs/{NNN}-{feature-name}/
├── spec.md
├── plan.md              # This file
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── rest-api.md
└── tasks.md             # Created in next phase

{project-root}/
├── {path/to/models}/
│   ├── {entity_1}.{ext}
│   └── {entity_2}.{ext}
├── {path/to/services}/
│   └── {service_name}.{ext}
├── {path/to/api}/
│   └── {router_name}.{ext}
└── {path/to/tests}/
    ├── contract/
    ├── integration/
    └── unit/
```

**Structure Decision**: {Why this layout — reference constitution patterns or existing codebase.}

---

## Quickstart Validation

<!--
  Smoke test scenarios proving the feature works end-to-end.
  Copy to specs/{NNN}-{feature-name}/quickstart.md
-->

### Scenario 1: {Happy Path Name}

1. {Precondition / setup step}
2. {User action}
3. {User action}
4. **Verify**: {Expected observable outcome}

### Scenario 2: {Error Path Name}

1. {Setup step}
2. {Invalid action}
3. **Verify**: {Error handling — what user sees}

### Scenario 3: {Edge Case Name}

1. {Boundary condition setup}
2. {Action}
3. **Verify**: {Graceful handling}

---

## Complexity Tracking

<!--
  Fill ONLY if Constitution Gate Check has violations requiring justification.
  Leave empty if all gates pass.
-->

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| {gate that failed} | {current need} | {why simpler approach is insufficient} |

---

## Validation Checklists

### Architecture Completeness

- [ ] Every FR from spec has a row in Requirements-to-Architecture Mapping
- [ ] Every user story maps to backend + frontend components
- [ ] Data model covers all spec entities with fields, relationships, indexes
- [ ] API contracts cover all user-facing interactions
- [ ] Research documents each decision with 2+ alternatives

### Constitution Compliance

- [ ] Technology standards gate passed
- [ ] Simplicity gate passed (or violations justified)
- [ ] Quality gate passed
- [ ] All violations documented in Complexity Tracking

### Traceability

- [ ] Every technical decision references FR-NNN or constitution article
- [ ] Every contract references the user story it serves (US{N})
- [ ] Every data entity references the spec entity it implements
- [ ] Project structure matches constitution architecture patterns

### Plan Quality

- [ ] No `[NEEDS CLARIFICATION]` remaining
- [ ] Performance constraints have concrete targets
- [ ] Security documented (auth, tenant isolation, input validation)
- [ ] Error handling strategy defined per endpoint
- [ ] File creation order specified (contracts -> tests -> implementation)

---

## Common Mistakes to Check

| Mistake | How to Detect | Fix |
|---------|--------------|-----|
| Missing constitution check | Gates unchecked | Run all gates first |
| Decision without rationale | Empty "Rationale" column in research | Add FR-NNN or constitution ref |
| Entity without indexes | No indexes section | Add indexes for every query pattern |
| Contract missing errors | No error table | Document all HTTP error codes |
| No traceability | Components lack FR-NNN references | Add source citations everywhere |
| Over-detailed plan | Contains code samples | Move to separate files, keep high-level |

---

## Next Phase

After this plan passes all checklists:

1. **Create supporting files** — research.md, data-model.md, contracts/, quickstart.md
2. **Proceed to task breakdown** — Use `template-tasks.md` to create tasks.md
3. **Share with Tech Lead** — Plan is the technical alignment artifact
