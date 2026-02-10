# Telemetry Flow Example - Create Issue Request

This document shows a **real-world example** of how telemetry flows through the entire system for a single API request.

---

## Example Request

```http
POST /api/v1/issues HTTP/1.1
Host: localhost:8000
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...
X-Workspace-ID: 550e8400-e29b-41d4-a716-446655440000
X-Correlation-ID: client-trace-abc123
Content-Type: application/json

{
  "name": "Fix login bug",
  "projectId": "660e8400-e29b-41d4-a716-446655440001",
  "priority": "high",
  "enhanceWithAi": true
}
```

---

## Complete Telemetry Timeline

### Time: T+0ms - Request Arrives

**Event:** Request enters FastAPI

**No logs yet** - Request hasn't hit middleware

---

### Time: T+2ms - RequestContextMiddleware

**Code Path:**
```
FastAPI → RequestContextMiddleware.dispatch()
```

**What Happens:**
1. Extract `X-Workspace-ID` header → `550e8400-e29b-41d4-a716-446655440000`
2. Extract `X-Correlation-ID` header → `client-trace-abc123`
3. Generate unique `request_id` → `req-7a3f92b1`
4. Call `set_request_context()` to inject into ContextVars
5. Continue to next middleware

**Logs Generated:** *(None - middleware doesn't log entry)*

**ContextVars State:**
```python
{
  "request_id": "req-7a3f92b1",
  "workspace_id": "550e8400-e29b-41d4-a716-446655440000",
  "correlation_id": "client-trace-abc123",
  "user_id": None  # Not set yet, auth middleware will set this
}
```

---

### Time: T+5ms - AuthMiddleware

**Code Path:**
```
AuthMiddleware.dispatch()
  └─ SupabaseAuth.verify_token()
```

**What Happens:**
1. Extract Bearer token from Authorization header
2. Validate JWT signature
3. Extract `user_id` from token → `user-123456`
4. Update context: `set_request_context(user_id="user-123456")`

**Logs Generated:**

```json
{
  "event": "authentication_success",
  "level": "debug",
  "logger": "pilot_space.api.middleware.auth",
  "timestamp": "2026-02-10T04:20:15.005Z",
  "request_id": "req-7a3f92b1",
  "workspace_id": "550e8400-e29b-41d4-a716-446655440000",
  "correlation_id": "client-trace-abc123",
  "user_id": "user-123456",
  "token_exp": "2026-02-10T05:20:15Z"
}
```

**ContextVars State (Updated):**
```python
{
  "request_id": "req-7a3f92b1",
  "workspace_id": "550e8400-e29b-41d4-a716-446655440000",
  "correlation_id": "client-trace-abc123",
  "user_id": "user-123456"  # ✅ Now set
}
```

---

### Time: T+8ms - Router Endpoint Invoked

**Code Path:**
```
issues.py → create_issue()
```

**Code:**
```python
@router.post("/issues")
async def create_issue(
    request: IssueCreateRequest,
    service: CreateIssueServiceDep,
    user_id: CurrentUserId,
    workspace_id: WorkspaceId,
):
    logger.info(
        "endpoint_invoked",
        endpoint="/api/v1/issues",
        method="POST",
        payload={"name": request.name, "priority": request.priority},
    )
    # ... continue ...
```

**Logs Generated:**

```json
{
  "event": "endpoint_invoked",
  "endpoint": "/api/v1/issues",
  "method": "POST",
  "payload": {
    "name": "Fix login bug",
    "priority": "high"
  },
  "level": "info",
  "logger": "pilot_space.api.v1.routers.issues",
  "timestamp": "2026-02-10T04:20:15.008Z",
  "request_id": "req-7a3f92b1",
  "workspace_id": "550e8400-e29b-41d4-a716-446655440000",
  "correlation_id": "client-trace-abc123",
  "user_id": "user-123456"
}
```

---

### Time: T+10ms - Service Layer Starts

**Code Path:**
```
CreateIssueService.execute()
```

**Code:**
```python
class CreateIssueService:
    async def execute(self, payload: CreateIssuePayload):
        start_time = time.time()

        logger.debug(
            "service_execution_start",
            service="CreateIssueService",
            payload_summary={"name": payload.name},
        )
        # ... continue ...
```

**Logs Generated:**

```json
{
  "event": "service_execution_start",
  "service": "CreateIssueService",
  "payload_summary": {
    "name": "Fix login bug"
  },
  "level": "debug",
  "logger": "pilot_space.application.services.issue.create_issue_service",
  "timestamp": "2026-02-10T04:20:15.010Z",
  "request_id": "req-7a3f92b1",
  "workspace_id": "550e8400-e29b-41d4-a716-446655440000",
  "correlation_id": "client-trace-abc123",
  "user_id": "user-123456"
}
```

---

### Time: T+12ms - AI Enhancement Check

**Code Path:**
```
CreateIssueService.execute()
  └─ if payload.enhance_with_ai:
       └─ AIEnhancementService.enhance()
```

**What Happens:**
1. Service detects `enhanceWithAi: true`
2. Call AI service to enhance issue description
3. AI service starts telemetry tracking

**Logs Generated:**

```json
{
  "event": "ai_operation_started",
  "operation": "issue_enhancement",
  "provider": "anthropic",
  "model": "claude-sonnet-4-5",
  "level": "info",
  "logger": "pilot_space.ai.telemetry",
  "timestamp": "2026-02-10T04:20:15.012Z",
  "request_id": "req-7a3f92b1",
  "workspace_id": "550e8400-e29b-41d4-a716-446655440000",
  "correlation_id": "client-trace-abc123",
  "user_id": "user-123456"
}
```

---

### Time: T+1250ms - AI Enhancement Complete

**Code Path:**
```
AIEnhancementService.enhance() completes
```

**What Happens:**
1. AI provider returns enhanced description
2. Token usage calculated
3. Cost estimated
4. Telemetry recorded

**Logs Generated:**

```json
{
  "event": "ai_operation_completed",
  "operation": "issue_enhancement",
  "provider": "anthropic",
  "model": "claude-sonnet-4-5",
  "duration_ms": 1238.4,
  "input_tokens": 45,
  "output_tokens": 120,
  "cached_tokens": 0,
  "cost_usd": 0.00498,
  "success": true,
  "level": "info",
  "logger": "pilot_space.ai.telemetry",
  "timestamp": "2026-02-10T04:20:16.250Z",
  "request_id": "req-7a3f92b1",
  "workspace_id": "550e8400-e29b-41d4-a716-446655440000",
  "correlation_id": "client-trace-abc123",
  "user_id": "user-123456"
}
```

---

### Time: T+1255ms - Database Insert

**Code Path:**
```
IssueRepository.create(issue)
```

**Code:**
```python
async def create(self, entity: Issue) -> Issue:
    logger.debug(
        "database_operation_start",
        operation="INSERT",
        table="issues",
    )

    start = time.time()
    self.session.add(entity)
    await self.session.flush()
    duration_ms = (time.time() - start) * 1000

    logger.info(
        "database_operation_complete",
        operation="INSERT",
        table="issues",
        duration_ms=duration_ms,
        rows_affected=1,
    )
```

**Logs Generated:**

**DEBUG Log:**
```json
{
  "event": "database_operation_start",
  "operation": "INSERT",
  "table": "issues",
  "level": "debug",
  "logger": "pilot_space.infrastructure.database.repositories.issue_repository",
  "timestamp": "2026-02-10T04:20:16.255Z",
  "request_id": "req-7a3f92b1",
  "workspace_id": "550e8400-e29b-41d4-a716-446655440000",
  "correlation_id": "client-trace-abc123",
  "user_id": "user-123456"
}
```

**INFO Log:**
```json
{
  "event": "database_operation_complete",
  "operation": "INSERT",
  "table": "issues",
  "duration_ms": 8.3,
  "rows_affected": 1,
  "level": "info",
  "logger": "pilot_space.infrastructure.database.repositories.issue_repository",
  "timestamp": "2026-02-10T04:20:16.263Z",
  "request_id": "req-7a3f92b1",
  "workspace_id": "550e8400-e29b-41d4-a716-446655440000",
  "correlation_id": "client-trace-abc123",
  "user_id": "user-123456"
}
```

---

### Time: T+1270ms - Service Complete

**Code Path:**
```
CreateIssueService.execute() returns
```

**Code:**
```python
# In service after repository call
duration_ms = (time.time() - start_time) * 1000

logger.info(
    "issue_created",
    issue_id=str(issue.id),
    issue_sequence_id=issue.sequence_id,
    enhanced_by_ai=True,
)

log_performance(
    operation="create_issue",
    duration_ms=duration_ms,
    service="CreateIssueService",
)
```

**Logs Generated:**

**Issue Created Log:**
```json
{
  "event": "issue_created",
  "issue_id": "770e8400-e29b-41d4-a716-446655440002",
  "issue_sequence_id": 42,
  "enhanced_by_ai": true,
  "level": "info",
  "logger": "pilot_space.application.services.issue.create_issue_service",
  "timestamp": "2026-02-10T04:20:16.270Z",
  "request_id": "req-7a3f92b1",
  "workspace_id": "550e8400-e29b-41d4-a716-446655440000",
  "correlation_id": "client-trace-abc123",
  "user_id": "user-123456"
}
```

**Performance Metric:**
```json
{
  "event": "performance_metric",
  "operation": "create_issue",
  "duration_ms": 1262.5,
  "service": "CreateIssueService",
  "level": "info",
  "logger": "performance",
  "timestamp": "2026-02-10T04:20:16.270Z",
  "request_id": "req-7a3f92b1",
  "workspace_id": "550e8400-e29b-41d4-a716-446655440000",
  "correlation_id": "client-trace-abc123",
  "user_id": "user-123456"
}
```

---

### Time: T+1275ms - Response Sent

**Code Path:**
```
Router returns IssueResponse
FastAPI serializes to JSON
```

**HTTP Response:**
```http
HTTP/1.1 201 Created
Content-Type: application/json
X-Correlation-ID: client-trace-abc123
X-Request-ID: req-7a3f92b1

{
  "id": "770e8400-e29b-41d4-a716-446655440002",
  "sequenceId": 42,
  "name": "Fix login bug",
  "description": "Enhanced description from AI...",
  "priority": "high",
  "state": { ... },
  "project": { ... }
}
```

**No explicit logs** - Response serialization doesn't log by default

---

### Time: T+1278ms - Context Cleanup

**Code Path:**
```
RequestContextMiddleware (finally block)
  └─ clear_request_context()
```

**What Happens:**
1. All ContextVars cleared
2. Next request gets fresh context
3. No logs generated for cleanup

**ContextVars State (Cleared):**
```python
{
  "request_id": None,
  "workspace_id": None,
  "correlation_id": None,
  "user_id": None
}
```

---

## Complete Log Timeline Summary

| Time | Layer | Event | Duration |
|------|-------|-------|----------|
| T+5ms | Auth | authentication_success | - |
| T+8ms | Router | endpoint_invoked | - |
| T+10ms | Service | service_execution_start | - |
| T+12ms | AI | ai_operation_started | - |
| T+1250ms | AI | ai_operation_completed | 1238.4ms |
| T+1255ms | DB | database_operation_start | - |
| T+1263ms | DB | database_operation_complete | 8.3ms |
| T+1270ms | Service | issue_created | - |
| T+1270ms | Performance | performance_metric | 1262.5ms |
| **Total** | - | - | **~1275ms** |

---

## Query Examples for This Request

### 1. Get all logs for this request

```bash
# By request_id
jq 'select(.request_id == "req-7a3f92b1")' logs/app.log

# By correlation_id (includes related async operations)
jq 'select(.correlation_id == "client-trace-abc123")' logs/app.log
```

### 2. Get performance breakdown

```bash
jq 'select(.request_id == "req-7a3f92b1" and .duration_ms != null)' logs/app.log | \
  jq -s 'map({event, duration_ms}) | sort_by(.duration_ms) | reverse'
```

**Output:**
```json
[
  {"event": "performance_metric", "duration_ms": 1262.5},
  {"event": "ai_operation_completed", "duration_ms": 1238.4},
  {"event": "database_operation_complete", "duration_ms": 8.3}
]
```

### 3. Calculate total AI cost

```bash
jq -s 'map(select(.request_id == "req-7a3f92b1" and .cost_usd != null)) |
  map(.cost_usd) | add' logs/app.log
```

**Output:**
```
0.00498
```

### 4. Timeline visualization

```bash
jq 'select(.request_id == "req-7a3f92b1")' logs/app.log | \
  jq -s 'sort_by(.timestamp) | .[] | "\(.timestamp) [\(.level)] \(.event)"'
```

**Output:**
```
2026-02-10T04:20:15.005Z [debug] authentication_success
2026-02-10T04:20:15.008Z [info] endpoint_invoked
2026-02-10T04:20:15.010Z [debug] service_execution_start
2026-02-10T04:20:15.012Z [info] ai_operation_started
2026-02-10T04:20:16.250Z [info] ai_operation_completed
2026-02-10T04:20:16.255Z [debug] database_operation_start
2026-02-10T04:20:16.263Z [info] database_operation_complete
2026-02-10T04:20:16.270Z [info] issue_created
2026-02-10T04:20:16.270Z [info] performance_metric
```

---

## Distributed Tracing Visualization

```
Client (correlation_id: client-trace-abc123)
  │
  ├─ API Gateway (request_id: req-7a3f92b1)
  │   │
  │   ├─ Auth Middleware [5ms]
  │   │   └─ Log: authentication_success
  │   │
  │   ├─ Router Endpoint [8ms]
  │   │   └─ Log: endpoint_invoked
  │   │
  │   └─ Service Layer [10ms-1270ms]
  │       │
  │       ├─ Log: service_execution_start
  │       │
  │       ├─ AI Enhancement [12ms-1250ms]
  │       │   ├─ Log: ai_operation_started
  │       │   └─ Log: ai_operation_completed (1238.4ms, $0.00498)
  │       │
  │       ├─ Database Insert [1255ms-1263ms]
  │       │   ├─ Log: database_operation_start
  │       │   └─ Log: database_operation_complete (8.3ms)
  │       │
  │       └─ Log: issue_created, performance_metric
  │
  └─ Response [1275ms total]
      Headers: X-Correlation-ID, X-Request-ID
```

---

## Key Insights from This Example

### Performance Breakdown
- **Total Time:** 1275ms
- **AI Enhancement:** 1238ms (97% of total)
- **Database Insert:** 8ms (0.6% of total)
- **Overhead:** 29ms (middleware, serialization)

### Cost Tracking
- **AI Cost:** $0.00498 (Claude Sonnet)
- **Input Tokens:** 45
- **Output Tokens:** 120
- **No cached tokens** (first request)

### Context Propagation
- ✅ `correlation_id` propagated from client
- ✅ `request_id` generated per request
- ✅ `workspace_id` extracted from header
- ✅ `user_id` extracted from JWT
- ✅ All logs include full context

### Observability
- **9 total log entries** for one request
- **3 layers** logged (Auth, Service, Repository)
- **2 performance metrics** (AI, Service)
- **1 cost record** (AI tokens)
- All queryable by request_id or correlation_id

---

## Summary

This example demonstrates:

1. **Complete request lifecycle** from middleware to database
2. **Automatic context injection** - every log has request/workspace/user
3. **Performance tracking** at multiple layers
4. **AI operation telemetry** with cost tracking
5. **Distributed tracing** via correlation_id
6. **Easy querying** with jq for debugging and analysis

The structured logging provides **full observability** of every request with **zero manual context passing** - it all happens automatically! 🎉
