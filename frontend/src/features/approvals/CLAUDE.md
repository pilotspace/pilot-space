# Approvals Module - Human-in-the-Loop Decision Making

_For project overview and general context, see main CLAUDE.md at project root_

## Overview

The **approvals** module implements **DD-003: Critical-Only AI Approval** — a human-in-the-loop workflow for AI-generated actions requiring human oversight.

**File Path**: `frontend/src/features/approvals/`
**Type**: Feature module
**Layer**: Presentation
**Purpose**: UI for reviewing, approving, and rejecting AI actions with 24-hour expiration

---

## Approval Classification Matrix (DD-003)

| Category | Examples | Approval Required | Impact |
|----------|----------|-------------------|--------|
| **Non-Destructive** | Auto-label, transition | No (auto-execute) | Low-risk, reversible |
| **Content Creation** | Extract issues, PR comments | **Yes** (configurable) | Medium-risk |
| **Destructive** | Delete issue, merge PR | **Always Yes** | High-risk, irreversible |

---

## Module Structure

```
frontend/src/features/approvals/
├── pages/
│   ├── approval-queue-page.tsx    # Main page with 5 tabs
│   └── index.ts
├── components/
│   ├── approval-card.tsx          # Card view (default)
│   ├── approval-list-item.tsx     # List view (compact)
│   ├── approval-detail-modal.tsx  # Detail view (expanded)
│   └── index.ts
└── __tests__/
    ├── approval-flow.integration.test.tsx
    ├── approval-detail-modal.test.tsx
    └── approval-card.test.tsx
```

---

## Key Components

### ApprovalQueuePage

**Purpose**: Main approval management interface with filtering.

**Features**:
- 5-tab filter: Pending, Approved, Rejected, Expired, All
- Pending count badge
- Empty states per filter
- Auto-load on mount + on tab change
- Modal detail view

**State**:
- `selectedRequest`: ApprovalRequest | null
- `activeTab`: ApprovalFilter
- Uses ApprovalStore MobX

### ApprovalCard

**Purpose**: Card view of single approval request (default UI).

**Features**:
- Status badge (Pending/Approved/Rejected/Expired)
- Action type badge
- Context preview (2 lines max)
- Metadata (agent, requested_by, created)
- Expiration countdown (for pending)
- Quick action buttons (Approve/Reject pending only)

### ApprovalDetailModal

**Purpose**: Full-screen detail view with risk assessment.

**Features**:
- Header: title, status badge, description
- Metadata grid: agent, action type, requested_by, created
- RiskAssessment component (color-coded risk level)
- PayloadPreview (JSON with copy button)
- Optional note textarea (1000 char limit)
- "Approve & Execute" + "Reject" buttons
- Expiration warning if already expired

---

## State Management (MobX)

### ApprovalStore

Located in: `frontend/src/stores/ai/ApprovalStore.ts`

**Observable State**:
```typescript
requests: ApprovalRequest[]
pendingCount: number
isLoading: boolean
error: string | null
selectedRequest: ApprovalRequest | null
filter: 'pending' | 'approved' | 'rejected' | 'expired' | undefined
```

**Actions**:
- `loadPending()`: Load pending only
- `loadAll(status?)`: Load with optional filter
- `approve(id, note?, selectedIssues?)`: Approve and execute
- `reject(id, note?)`: Reject with reason
- `selectRequest(request | null)`: Set selected for modal
- `setFilter(filter)`: Change filter

---

## Integration Points

### Upstream

- **Router**: `/[workspaceSlug]/approvals/`
- **Approval Badge**: Displays `approval.pendingCount`
- **PilotSpaceStore**: Emits `approval_request` SSE event

### Downstream

- **aiApi**: `listApprovals()`, `resolveApproval()`
- **ApprovalStore**: MobX state
- **shadcn/ui**: Dialog, Button, Badge, Tabs

---

## API Types & Contracts

### ApprovalRequest

```typescript
interface ApprovalRequest {
  id: string;
  agent_name: string;
  action_type: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  created_at: string;          // ISO 8601
  expires_at: string;          // ISO 8601 (24h from created_at)
  requested_by: string;
  context_preview: string;     // Max 200 chars
  payload?: Record<string, unknown>;
}
```

### ApprovalResolutionRequest

```typescript
interface ApprovalResolutionRequest {
  approved: boolean;
  note?: string;
  selected_issues?: number[];  // For extract_issues
}
```

### Endpoints

```
GET /api/v1/ai/approvals?status=pending|approved|rejected|expired
  Response: ApprovalListResponse

POST /api/v1/ai/approvals/{id}/resolve
  Body: ApprovalResolutionRequest
  Response: ApprovalRequest (with status updated)
```

---

## Features

### 24-Hour Expiration Countdown

Each approval has `expires_at` (24 hours from creation). UI calculates remaining time:

```typescript
const isExpired = new Date(expiresAt) < new Date();
const timeLeft = formatDistanceToNow(expiresAt);
// "Expires in 18 hours" → "Expired"
```

**Expired Behavior**:
- "Expired" in red text
- Destructive Alert shown
- Approve/Reject buttons hidden
- Status marked as 'expired' server-side

### Quick Actions vs Detail Modal

**Quick Actions**:
- Direct Approve/Reject on card
- No confirmation
- For well-known simple actions

**Detail Modal**:
- Full context: payload, risk assessment, metadata
- Optional note field
- For complex/destructive actions

---

## Testing

### Test Scenarios

- [ ] Load pending approvals on page mount
- [ ] Filter by status (all 5 tabs)
- [ ] Approve + refresh list
- [ ] Reject with reason + refresh list
- [ ] Open detail modal on card click
- [ ] Show expiration warning (if expired)
- [ ] Countdown timer displays correctly
- [ ] Pending count badge updates

**Commands**:
```bash
pnpm test features/approvals
pnpm test --coverage features/approvals
```

---

## Quality Gates

```bash
pnpm lint && pnpm type-check && pnpm test
```

**Coverage Target**: >80%

---

## Related Documentation

- **DD-003**: Critical-only AI approval
- **DD-086**: Centralized PilotSpaceAgent
- `docs/architect/pilotspace-agent-architecture.md`
- `docs/dev-pattern/45-pilot-space-patterns.md`

---

## Quick Reference

### Store Access

```typescript
const aiStore = useAIStore();
const { approval } = aiStore;
approval.requests
approval.pendingCount
approval.approve(id, note)
```

### Common Operations

```typescript
// Load pending
await approval.loadPending();

// Approve
await approval.approve(requestId, 'Verified');

// Reject
await approval.reject(requestId, 'Not ready');
```

---

## Summary

Approvals module implements human-in-the-loop approval workflow:
- **3 categories**: Non-destructive, content creation, destructive
- **3 views**: Card, list, detail modal
- **24h expiration**: Countdown timer + expired state
- **MobX state**: Reactive approval list updates
- **API integration**: List + resolve endpoints

**Status**: Production
**Test Coverage**: Target >80%
