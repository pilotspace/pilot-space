# Cycles Module - Sprint Management

_For project overview and frontend architecture, see main CLAUDE.md and `frontend/CLAUDE.md`_

## Overview

The **cycles** module implements sprint/cycle management with burndown charts, velocity tracking, and state-cycle constraints.

**File Path**: `frontend/src/features/cycles/`
**Purpose**: Sprint planning, tracking, and metrics visualization
**Layer**: Feature module

---

## Module Structure

```
frontend/src/features/cycles/
├── pages/
│   └── cycle-detail-page.tsx     # T057: Cycle detail, charts, issue list
├── components/
│   ├── cycle-selector.tsx        # T013: Dropdown for cycle selection
│   ├── burndown-chart.tsx        # T060: Sprint burndown visualization
│   ├── velocity-chart.tsx        # T061: Team velocity trends
│   ├── cycle-status-badge.tsx    # Active/completed/draft state
│   └── issue-cycle-list.tsx      # Issues in cycle with filters
├── hooks/
│   ├── useCycle.ts               # Single cycle query
│   ├── useCycles.ts              # Cycles list query
│   ├── useCreateCycle.ts         # Create cycle mutation
│   ├── useUpdateCycle.ts         # Update cycle mutation
│   ├── useCycleBurndown.ts       # Burndown metrics query
│   └── useVelocity.ts            # Velocity metrics query
└── __tests__/                    # Integration + unit tests
```

---

## State-Cycle Constraints

**Business Rules** (enforced at backend + frontend):

| State | Cycle Requirement | Notes |
|-------|------------------|-------|
| **Backlog** | No Cycle | Issues unscheduled |
| **Todo** | Cycle optional | Can assign to any cycle |
| **In Progress** | Cycle required | Must be active cycle only |
| **In Review** | Cycle required | Must remain in active cycle |
| **Done** | Leaves active cycle | Archived with metrics |
| **Cancelled** | Leaves immediately | No archival |

**Frontend Enforcement**:
```typescript
// When transitioning to In Progress
if (newState === 'in_progress' && !issue.cycle_id) {
  showError('In Progress issues must be assigned to a cycle');
  return;
}

// CycleSelector disables non-active cycles when state is In Progress
<CycleSelector
  disabled={state === 'in_progress' && !isActiveCycle}
/>
```

---

## Key Features

### Cycle CRUD

- **Create**: Form with name, start/end dates, goals
- **Read**: Cycle detail page with metrics + issues
- **Update**: Edit name, dates, goals, status
- **Delete**: Archive cycle (soft delete)

### Burndown Chart (T060)

**Purpose**: Show progress towards sprint goal.

**Data**:
- X-axis: Days in cycle
- Y-axis: Remaining story points
- Ideal line: Linear from start to 0
- Actual line: Actual remaining points per day

**Calculation**:
```typescript
// Per day: sum of story_points where state NOT IN ('done', 'cancelled')
// Includes partial completions
```

### Velocity Chart (T061)

**Purpose**: Show team velocity trends over recent cycles.

**Data**:
- X-axis: Cycle name/number
- Y-axis: Points completed
- Green bar: Completed points
- Gray bar: Not completed (cancelled)

**Calculation**:
```typescript
// Per cycle: sum of story_points where state === 'done'
```

### Cycle Selector (T013)

**Purpose**: Quick cycle assignment.

**Features**:
- Dropdown: Active cycle (bold), upcoming cycles, backlog
- Disabled cycles: Past cycles (grayed out)
- Validation: Enforce state-cycle constraints
- Quick-select active cycle button

---

## MobX State

### CycleStore

**Observable**:
```typescript
cycles: Cycle[]
activeCycle: Cycle | null
isLoading: boolean
error: string | null
selectedCycleId: string | null
```

**Computed**:
```typescript
get upcomingCycles(): Cycle[]     // start_date > now
get pastCycles(): Cycle[]         // end_date < now
get activeCycleIssues(): Issue[]  // Issues in active cycle
```

---

## TanStack Query Hooks

| Hook | Purpose | Stale Time |
|------|---------|-----------|
| `useCycle(cycleId)` | Single cycle + relations | 30s |
| `useCycles()` | List cycles | 60s |
| `useCreateCycle()` | Mutation: create | — |
| `useUpdateCycle()` | Mutation: update | — |
| `useCycleBurndown(cycleId)` | Burndown metrics | 5m |
| `useVelocity(workspaceId)` | Last 5 cycles velocity | 5m |

---

## Integration with Issues

**Issue State Machine**:
- On create: Assign to current cycle or backlog
- On state change:
  - Backlog → Todo: Can assign any cycle
  - Todo → In Progress: Cycle required (must be active)
  - In Progress → Done: Removed from cycle
  - Any → Cancelled: Removed from cycle

**Cycle-Issue Link**:
- Foreign key: `issues.cycle_id` → `cycles.id`
- RLS scoped by workspace
- Soft delete: Cycle marked as `deleted_at`, issues reassigned to backlog

---

## Testing

### Critical Scenarios

- [ ] Create cycle with valid dates
- [ ] Reject past end date (< start date)
- [ ] Activate cycle
- [ ] Archive cycle (soft delete)
- [ ] Move issue to In Progress (requires cycle assignment)
- [ ] Burndown chart calculates correctly
- [ ] Velocity chart shows last 5 cycles
- [ ] State-cycle constraints enforced

**Commands**:
```bash
pnpm test features/cycles
pnpm test --coverage features/cycles
```

---

## Quality Gates

```bash
pnpm lint && pnpm type-check && pnpm test
```

**Coverage**: >80%

---

## Related Documentation

- **State-Cycle Constraints**: Key entities section in main CLAUDE.md
- **DD-065**: MobX + TanStack Query patterns
- `docs/dev-pattern/45-pilot-space-patterns.md`

---

## Summary

Cycles module implements sprint management:
- **CRUD**: Create, read, update, delete cycles
- **Metrics**: Burndown + velocity charts
- **Constraints**: State-cycle business rules
- **Integration**: Issue assignment + state transitions
- **Selection**: CycleSelector for quick assignment

**Status**: Production
**Test Coverage**: Target >80%
