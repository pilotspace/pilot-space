# Cost Dashboard Module - CLAUDE.md

_AI cost tracking and analytics dashboard for monitoring workspace AI usage by agent, user, and time period._

**File Path**: `frontend/src/features/costs/`
**Layer**: Feature Module (Presentation + State Management)
**Type**: Domain-specific feature folder with page, components, and CostStore integration

---

## Quick Reference

**Module Purpose**: Track and visualize AI costs across workspace with provider routing insights (DD-011).

**Key Components**:
- CostDashboardPage (T200): Main dashboard, 171 lines
- CostSummaryCard (T201): Metric display with trends, 111 lines
- CostTrendsChart (T203): Daily cost line chart, 178 lines
- CostByAgentChart (T202): Provider distribution donut, 208 lines
- CostTableView (T204): Sortable user cost table, 277 lines
- DateRangeSelector (T206): Date range presets, 187 lines
- CostStore (T205): MobX state management, 219 lines

**State**: CostStore (MobX observable with computed properties)

**Quality Gates**: `pnpm lint && pnpm type-check && pnpm test` (currently 0% coverage)

---

## Overview

### Feature Purpose

The Pilot Space cost tracking module provides workspace admins visibility into AI usage costs across:
- **Provider routing** (Claude Opus/Sonnet, Gemini, fallbacks per DD-011)
- **Agent breakdown** (PilotSpaceAgent, GhostTextAgent, PRReviewAgent, etc.)
- **User consumption** (cost attribution per team member)
- **Temporal trends** (daily cost visualization)

**Business Context (DD-002, DD-011)**:
- Users provide their own API keys (BYOK) via Supabase Vault
- Backend tracks token usage (prompt/completion/cached) and USD costs per provider
- Frontend displays cost insights without storing sensitive keys

### File Structure

```
frontend/src/features/costs/
├── CLAUDE.md (this file)
├── index.ts (barrel exports)
├── pages/
│   └── cost-dashboard-page.tsx (T200, 171 lines)
└── components/
    ├── cost-summary-card.tsx (T201, 111 lines)
    ├── cost-trends-chart.tsx (T203, 178 lines)
    ├── cost-by-agent-chart.tsx (T202, 208 lines)
    ├── cost-table-view.tsx (T204, 277 lines)
    └── date-range-selector.tsx (T206, 187 lines)
```

---

## Component Breakdown

### 1. Cost Dashboard Page (T200)

**Responsibility**: Orchestrate cost data loading and UI composition.

**Lifecycle**:
1. Component mounts → `cost.loadSummary(workspaceId)`
2. On date range change → `cost.setDateRange(range, workspaceId)`
3. Display loading skeletons while loading
4. Display error alert if error occurs
5. Render: 4 summary cards + 2 charts + user table

### 2. Cost Summary Card (T201)

**Purpose**: Display single metric with optional trend indicator.

**Trend Logic**:
- Calculate % change if previousValue provided
- Arrow ↑ (red for cost increase, green for efficiency gain)
- Used for: Total Cost, Total Requests, Total Tokens, Avg Cost/Request

### 3. Cost Trends Chart (T203)

**Type**: Recharts AreaChart

**Features**:
- X-axis: Formatted dates (MMM d)
- Y-axis: Formatted USD scale
- Gradient fill with transparency
- Custom tooltip with date, cost, requests, avg/request
- Responsive: 100% width, 300px height

### 4. Cost by Agent Chart (T202)

**Type**: Recharts PieChart (donut)

**Features**:
- Interactive pie slices (click agent for filtering)
- Custom legend with percentages
- Maps agents to provider routing (DD-011)
- Tooltip: Agent, cost, requests, percentage

### 5. Cost Table View (T204)

**Columns**:
1. User (avatar with initials + name)
2. Requests (numeric)
3. Total Cost (USD)
4. Avg/Request (computed)

**Sorting**:
- Default: total_cost_usd descending
- Click header to toggle column and direction
- Supports: user_name, total_cost_usd, request_count

### 6. Date Range Selector (T206)

**Presets**:
- Today, Last 7/30/90 days (default: 30 days), This month

**UI**:
- Trigger button with formatted date range
- Popover with preset buttons
- Active preset highlighting

---

## Provider Routing (DD-011)

### Agent ↔ Provider Mapping

| Agent | Provider | Model | Use Case | Cost Tier |
|-------|----------|-------|----------|-----------|
| `pilot_space_agent` | Anthropic | Claude Opus | Orchestration | Highest |
| `ghost_text_agent` | Google | Gemini Flash | Inline completions | Low |
| `pr_review_agent` | Anthropic | Claude Opus | Code analysis | Highest |
| `ai_context_agent` | Anthropic | Claude Sonnet | Context aggregation | Medium |
| `doc_generator_agent` | Anthropic | Claude Sonnet | Doc generation | Medium |

### Cost Visualization

- "Cost by Agent" chart shows distribution
- Admins correlate high Gemini → many ghost text requests
- Admins correlate high Opus → complex PR reviews

---

## Data Model

### Backend API

**Endpoint**: `GET /workspaces/{workspace_id}/ai/costs/summary`

**Query Parameters**:
```typescript
{ start_date: string; end_date: string; }  // YYYY-MM-DD
```

**Response** (`CostSummary`):
```typescript
{
  total_cost_usd: number;
  total_requests: number;
  by_agent: [{agent_name, total_cost_usd, request_count}];
  by_user: [{user_id, user_name, total_cost_usd, request_count}];
  by_day: [{date, total_cost_usd, request_count}];
}
```

### Token Types

1. **Input tokens**: Prompt + context
2. **Output tokens**: AI response
3. **Cached tokens**: Reused tokens (90% discount)

---

## State Management (CostStore)

**Location**: `frontend/src/stores/ai/CostStore.ts` (219 lines)

### Observable Properties

```typescript
summary: CostSummary | null = null;
isLoading: boolean = false;
error: string | null = null;
dateRange: DateRange = { start: subDays(now, 30), end: now };
```

### Computed Properties

```typescript
get totalCost(): number
get totalRequests(): number
get totalTokens(): number
get avgCostPerRequest(): number
get costByAgent(): CostByAgentData[]
get costTrends(): CostTrendData[]
get costPerUser(): CostByUser[]
```

### Actions

1. `loadSummary(workspaceId)`: Fetch + update state
2. `setDateRange(range, workspaceId)`: Update + reload
3. `setPresetRange(preset, workspaceId)`: Set preset + reload

---

## Testing

### Currently

No tests written (0% coverage).

### Recommended (>80% target)

1. **CostStore Unit**:
   - loadSummary, setDateRange, computed properties, error handling

2. **Components Unit**:
   - Rendering, interactions (sort, presets)

3. **E2E Integration**:
   - Navigate → load → change date → update

**Commands**:
```bash
pnpm test frontend/src/features/costs
pnpm test --coverage frontend/src/features/costs
```

---

## Related Documentation

**Design Decisions**: DD-002, DD-011, DD-003, DD-065

**Architecture**:
- `docs/architect/frontend-architecture.md`
- `docs/dev-pattern/21c-frontend-mobx-state.md`

**Specs**:
- `specs/001-pilot-space-mvp/ui-design-spec.md`

---

**Status**: Production | **Test Coverage**: 0% (planned) | **Components**: 7 | **Last Updated**: 2026-02-09
