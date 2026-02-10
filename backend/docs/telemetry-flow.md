# Telemetry Flow in FastAPI - Complete Architecture

## Overview

Telemetry flows through multiple layers in the FastAPI application, from HTTP requests through middleware, routers, services, and infrastructure components. This document explains the complete flow with diagrams and code examples.

---

## 1. High-Level Telemetry Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT REQUEST                            │
│  HTTP POST /api/v1/issues                                        │
│  Headers: Authorization, X-Workspace-ID, X-Correlation-ID        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FASTAPI APPLICATION                           │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  1. STARTUP (Lifespan)                                 │    │
│  │     - Configure structlog                              │    │
│  │     - Log: application_startup                         │    │
│  │     - Initialize Redis, DB connections                 │    │
│  │     - Log: application_ready                           │    │
│  └────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  2. MIDDLEWARE PIPELINE (Sequential)                   │    │
│  │                                                         │    │
│  │     ┌─────────────────────────────────────────┐       │    │
│  │     │ RequestContextMiddleware                 │       │    │
│  │     │  - Extract X-Workspace-ID header         │       │    │
│  │     │  - Extract/Generate X-Correlation-ID     │       │    │
│  │     │  - Generate unique request_id            │       │    │
│  │     │  - Call set_request_context()            │       │    │
│  │     │    (Injects into ContextVars)            │       │    │
│  │     └─────────────────────────────────────────┘       │    │
│  │                       │                                │    │
│  │                       ▼                                │    │
│  │     ┌─────────────────────────────────────────┐       │    │
│  │     │ CORSMiddleware                           │       │    │
│  │     │  - Validate origin                       │       │    │
│  │     │  - Add CORS headers                      │       │    │
│  │     └─────────────────────────────────────────┘       │    │
│  │                       │                                │    │
│  │                       ▼                                │    │
│  │     ┌─────────────────────────────────────────┐       │    │
│  │     │ ErrorHandlerMiddleware                   │       │    │
│  │     │  - Wrap next() in try/except             │       │    │
│  │     │  - Log errors with context               │       │    │
│  │     │  - Convert to RFC 7807                   │       │    │
│  │     └─────────────────────────────────────────┘       │    │
│  │                       │                                │    │
│  │                       ▼                                │    │
│  │     ┌─────────────────────────────────────────┐       │    │
│  │     │ RateLimiterMiddleware                    │       │    │
│  │     │  - Check Redis for rate limit            │       │    │
│  │     │  - Log: rate_limit_warning (if close)    │       │    │
│  │     │  - Log: rate_limit_exceeded (if over)    │       │    │
│  │     └─────────────────────────────────────────┘       │    │
│  │                       │                                │    │
│  │                       ▼                                │    │
│  │     ┌─────────────────────────────────────────┐       │    │
│  │     │ AuthMiddleware                           │       │    │
│  │     │  - Validate JWT token                    │       │    │
│  │     │  - Extract user_id from token            │       │    │
│  │     │  - Update request context:               │       │    │
│  │     │    set_request_context(user_id=...)      │       │    │
│  │     │  - Log: authentication_failed (if error) │       │    │
│  │     └─────────────────────────────────────────┘       │    │
│  └────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  3. ROUTER ENDPOINT                                     │    │
│  │     @router.post("/issues")                             │    │
│  │     async def create_issue(...)                         │    │
│  │                                                          │    │
│  │     Logs:                                               │    │
│  │     - logger.info("issue_creation_started")             │    │
│  │       (includes request_id, workspace_id, user_id)      │    │
│  └────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  4. SERVICE LAYER (CQRS-lite)                           │    │
│  │     service.execute(CreateIssuePayload(...))            │    │
│  │                                                          │    │
│  │     Logs:                                               │    │
│  │     - logger.debug("service_validation_start")          │    │
│  │     - logger.info("issue_created", issue_id=...)        │    │
│  │     - log_performance("create_issue", duration_ms=...)  │    │
│  └────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  5. REPOSITORY LAYER                                    │    │
│  │     repo.create(issue)                                  │    │
│  │                                                          │    │
│  │     Logs:                                               │    │
│  │     - logger.debug("database_query_start")              │    │
│  │     - logger.info("database_query_complete",            │    │
│  │         duration_ms=..., rows_affected=1)               │    │
│  └────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  6. AI LAYER (if AI operations)                         │    │
│  │     PilotSpaceAgent.stream(...)                         │    │
│  │                                                          │    │
│  │     Logs via ai/telemetry.py:                           │    │
│  │     - logger.info("ai_operation_started",               │    │
│  │         operation="ghost_text",                         │    │
│  │         provider="google",                              │    │
│  │         model="gemini-2.0-flash")                       │    │
│  │     - logger.info("ai_operation_completed",             │    │
│  │         duration_ms=...,                                │    │
│  │         input_tokens=...,                               │    │
│  │         output_tokens=...,                              │    │
│  │         cost_usd=...)                                   │    │
│  │     - TelemetryCollector.record(metrics)                │    │
│  └────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  7. RESPONSE & CLEANUP                                  │    │
│  │     - Return response to client                         │    │
│  │     - Middleware cleanup (reverse order)                │    │
│  │     - clear_request_context()                           │    │
│  │       (Clears ContextVars for next request)             │    │
│  │     - Add X-Correlation-ID, X-Request-ID to headers     │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        LOG OUTPUT                                │
│                                                                  │
│  Development:  Colored console (human-readable)                 │
│  Production:   JSON (one log per line)                          │
│                                                                  │
│  Each log includes:                                             │
│  - event: "issue_created"                                       │
│  - level: "info"                                                │
│  - logger: "pilot_space.application.services.issue"             │
│  - timestamp: "2026-02-10T04:17:39.646349Z"                     │
│  - request_id: "req-abc123"                                     │
│  - workspace_id: "ws-456"                                       │
│  - user_id: "user-789"                                          │
│  - correlation_id: "corr-xyz"                                   │
│  + custom fields (issue_id, duration_ms, etc.)                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    LOG AGGREGATION                               │
│                                                                  │
│  - Datadog: Query by workspace_id, user_id, level               │
│  - CloudWatch: Insights queries for performance analysis         │
│  - Splunk: Timecharts and statistics                            │
│  - Local: jq filtering for development                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Request Context Flow (ContextVars)

```python
# In RequestContextMiddleware (middleware/request_context.py)

async def dispatch(self, request: Request, call_next):
    # 1. Extract context from request
    workspace_id = request.headers.get("X-Workspace-ID")
    correlation_id = request.headers.get("X-Correlation-ID") or str(uuid4())
    request_id = str(uuid4())  # Generate unique per request

    # 2. Store in request.state (FastAPI)
    request.state.request_id = request_id
    request.state.workspace_id = workspace_id
    request.state.correlation_id = correlation_id

    # 3. Inject into structlog ContextVars
    from pilot_space.infrastructure.logging import set_request_context

    set_request_context(
        request_id=request_id,
        workspace_id=str(workspace_id) if workspace_id else None,
        user_id=str(user_id) if user_id else None,  # Set after auth
        correlation_id=correlation_id,
    )

    try:
        # 4. Process request (all logs will include context)
        response = await call_next(request)
    finally:
        # 5. Clear context after request
        from pilot_space.infrastructure.logging import clear_request_context
        clear_request_context()

    # 6. Add context to response headers
    response.headers["X-Correlation-ID"] = correlation_id
    response.headers["X-Request-ID"] = request_id

    return response
```

**ContextVars Storage (infrastructure/logging.py):**

```python
from contextvars import ContextVar

# Thread-safe context storage
_request_id: ContextVar[str | None] = ContextVar("request_id", default=None)
_workspace_id: ContextVar[str | None] = ContextVar("workspace_id", default=None)
_user_id: ContextVar[str | None] = ContextVar("user_id", default=None)
_correlation_id: ContextVar[str | None] = ContextVar("correlation_id", default=None)

def set_request_context(**kwargs):
    """Set context for current async task."""
    if request_id := kwargs.get("request_id"):
        _request_id.set(request_id)
    if workspace_id := kwargs.get("workspace_id"):
        _workspace_id.set(workspace_id)
    # ... etc
```

**Structlog Processor Reads ContextVars:**

```python
def add_request_context(logger, method_name, event_dict):
    """Automatically inject context into every log."""
    if request_id := _request_id.get():
        event_dict["request_id"] = request_id
    if workspace_id := _workspace_id.get():
        event_dict["workspace_id"] = workspace_id
    if user_id := _user_id.get():
        event_dict["user_id"] = user_id
    if correlation_id := _correlation_id.get():
        event_dict["correlation_id"] = correlation_id
    return event_dict
```

---

## 3. Logging at Each Layer

### Layer 1: Router/Endpoint

```python
# api/v1/routers/issues.py

from pilot_space.infrastructure.logging import get_logger

logger = get_logger(__name__)

@router.post("/issues", response_model=IssueResponse)
async def create_issue(
    request: IssueCreateRequest,
    service: CreateIssueServiceDep,
    user_id: CurrentUserId,
    workspace_id: WorkspaceId,
):
    """Create new issue with telemetry."""

    # Log endpoint entry
    logger.info(
        "endpoint_invoked",
        endpoint="/api/v1/issues",
        method="POST",
        payload_size=len(str(request)),
    )

    try:
        result = await service.execute(
            CreateIssuePayload(
                name=request.name,
                workspace_id=workspace_id,
                reporter_id=user_id,
            )
        )

        # Log success
        logger.info(
            "issue_created",
            issue_id=str(result.issue.id),
            issue_sequence_id=result.issue.sequence_id,
            project_id=str(result.issue.project_id),
        )

        return IssueResponse.from_issue(result.issue)

    except Exception as e:
        # Log error with exception
        logger.exception(
            "issue_creation_failed",
            error_type=type(e).__name__,
            error_message=str(e),
        )
        raise
```

**Output (Production JSON):**
```json
{
  "event": "endpoint_invoked",
  "endpoint": "/api/v1/issues",
  "method": "POST",
  "payload_size": 256,
  "request_id": "req-abc123",
  "workspace_id": "ws-456",
  "user_id": "user-789",
  "correlation_id": "corr-xyz",
  "timestamp": "2026-02-10T04:17:39.646Z",
  "level": "info",
  "logger": "pilot_space.api.v1.routers.issues"
}
```

### Layer 2: Service Layer

```python
# application/services/issue/create_issue_service.py

from pilot_space.infrastructure.logging import get_logger, log_performance
import time

logger = get_logger(__name__)

class CreateIssueService:
    async def execute(self, payload: CreateIssuePayload) -> CreateIssueResult:
        start_time = time.time()

        # Log service start
        logger.debug(
            "service_execution_start",
            service="CreateIssueService",
            payload=payload.model_dump(),
        )

        # Validate
        logger.debug("validating_payload", fields=["name", "project_id"])

        # Create entity
        issue = await self._issue_repo.create(entity)

        # Log completion
        logger.info(
            "issue_persisted",
            issue_id=str(issue.id),
            sequence_id=issue.sequence_id,
        )

        # Track performance
        duration_ms = (time.time() - start_time) * 1000
        log_performance(
            operation="create_issue",
            duration_ms=duration_ms,
            service="CreateIssueService",
        )

        return CreateIssueResult(issue=issue)
```

### Layer 3: Repository Layer

```python
# infrastructure/database/repositories/issue_repository.py

from pilot_space.infrastructure.logging import get_logger

logger = get_logger(__name__)

class IssueRepository(BaseRepository[Issue]):
    async def create(self, entity: Issue) -> Issue:
        # Log database operation start
        logger.debug(
            "database_operation_start",
            operation="INSERT",
            table="issues",
            entity_id=str(entity.id),
        )

        start = time.time()

        # Execute query
        self.session.add(entity)
        await self.session.flush()
        await self.session.refresh(entity)

        duration_ms = (time.time() - start) * 1000

        # Log completion with metrics
        logger.info(
            "database_operation_complete",
            operation="INSERT",
            table="issues",
            entity_id=str(entity.id),
            duration_ms=duration_ms,
            rows_affected=1,
        )

        return entity
```

### Layer 4: AI Operations

```python
# ai/telemetry.py

from pilot_space.infrastructure.logging import get_logger
import structlog

logger = get_logger(__name__)

@asynccontextmanager
async def track_ai_operation(
    operation: AIOperation,
    provider: AIProvider,
    model: str,
    workspace_id: UUID,
    user_id: UUID,
    correlation_id: str,
):
    """Context manager for tracking AI operations."""

    metrics = AIMetrics(
        operation=operation,
        provider=provider,
        model=model,
        workspace_id=workspace_id,
        user_id=user_id,
        correlation_id=correlation_id,
    )

    # Log start
    if _use_structlog:
        log = structlog.get_logger(__name__)
        log.info(
            "ai_operation_started",
            operation=operation.value,
            provider=provider.value,
            model=model,
        )

    try:
        yield metrics
    except Exception as e:
        metrics.complete(success=False, error_type=type(e).__name__)
        raise
    finally:
        # Log completion with full metrics
        if _use_structlog:
            log = structlog.get_logger(__name__)
            log.info(
                "ai_operation_completed",
                **metrics.to_dict(),
            )

        # Record to telemetry collector
        collector = get_telemetry_collector()
        collector.record(metrics)
```

**Usage:**

```python
# In AI service
async with track_ai_operation(
    operation=AIOperation.GHOST_TEXT,
    provider=AIProvider.GOOGLE,
    model="gemini-2.0-flash",
    workspace_id=workspace_id,
    user_id=user_id,
    correlation_id=correlation_id,
) as metrics:
    result = await provider.generate(prompt)

    metrics.complete(
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        success=True,
    )
```

**Output:**
```json
{
  "event": "ai_operation_completed",
  "operation": "ghost_text",
  "provider": "google",
  "model": "gemini-2.0-flash",
  "workspace_id": "ws-456",
  "user_id": "user-789",
  "correlation_id": "corr-xyz",
  "duration_ms": 1234.5,
  "input_tokens": 150,
  "output_tokens": 48,
  "cost_usd": 0.00123,
  "success": true,
  "timestamp": "2026-02-10T04:17:40.123Z",
  "level": "info",
  "logger": "pilot_space.ai.telemetry"
}
```

---

## 4. Error Handling & Exception Tracking

```python
# api/middleware/error_handler.py

from pilot_space.infrastructure.logging import get_logger

logger = get_logger(__name__)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler with telemetry."""

    # Log exception with full context
    logger.exception(
        "unhandled_exception",
        exception_type=type(exc).__name__,
        exception_message=str(exc),
        endpoint=request.url.path,
        method=request.method,
    )

    # Convert to RFC 7807
    return JSONResponse(
        status_code=500,
        content={
            "type": "https://httpstatuses.com/500",
            "title": "Internal Server Error",
            "status": 500,
            "detail": str(exc),
            "instance": request.url.path,
        },
    )
```

**Output with Exception:**
```json
{
  "event": "unhandled_exception",
  "exception_type": "ValueError",
  "exception_message": "Invalid issue state transition",
  "endpoint": "/api/v1/issues/123",
  "method": "PATCH",
  "request_id": "req-abc123",
  "workspace_id": "ws-456",
  "user_id": "user-789",
  "exception": "Traceback (most recent call last):\n  File ...",
  "timestamp": "2026-02-10T04:17:40.999Z",
  "level": "error",
  "logger": "pilot_space.api.middleware.error_handler"
}
```

---

## 5. Performance Tracking Flow

```python
# Using log_performance helper

from pilot_space.infrastructure.logging import log_performance
import time

async def some_operation():
    start = time.time()

    # ... do work ...

    duration_ms = (time.time() - start) * 1000

    log_performance(
        operation="database_migration",
        duration_ms=duration_ms,
        records_processed=1000,
        success=True,
    )
```

**Output:**
```json
{
  "event": "performance_metric",
  "operation": "database_migration",
  "duration_ms": 5432.1,
  "records_processed": 1000,
  "success": true,
  "request_id": "req-abc123",
  "timestamp": "2026-02-10T04:17:41.500Z",
  "level": "info",
  "logger": "performance"
}
```

---

## 6. Distributed Tracing with Correlation ID

**Scenario:** Request triggers multiple async operations

```
Client Request → API Gateway → Issue Service → AI Service → External API
    ↓              ↓               ↓               ↓              ↓
correlation_id: corr-abc123 (same across all services)
request_id:     req-1      req-2      req-3      req-4 (different per hop)
```

**Query all logs for one distributed request:**

```bash
# Production (JSON)
cat logs/app.log | jq 'select(.correlation_id == "corr-abc123")'

# Get timeline
cat logs/app.log | \
  jq 'select(.correlation_id == "corr-abc123")' | \
  jq -s 'sort_by(.timestamp)'
```

---

## 7. Telemetry Aggregation & Queries

### Query Examples

**Find slow operations:**
```bash
jq 'select(.duration_ms > 1000)' logs/app.log
```

**Track AI costs per workspace:**
```bash
jq -s 'group_by(.workspace_id) |
  map({
    workspace: .[0].workspace_id,
    total_cost: map(.cost_usd) | add
  })' logs/app.log
```

**Error rate by endpoint:**
```bash
jq -s 'group_by(.endpoint) |
  map({
    endpoint: .[0].endpoint,
    errors: map(select(.level == "error")) | length,
    total: length
  })' logs/app.log
```

---

## 8. Best Practices

### ✅ DO

1. **Use structured logging everywhere:**
   ```python
   logger.info("user_login", user_id=user_id, method="oauth")
   ```

2. **Include operation context:**
   ```python
   logger.info("database_query", query_type="SELECT", table="issues", duration_ms=12.3)
   ```

3. **Track performance metrics:**
   ```python
   log_performance("api_request", duration_ms=duration, endpoint="/api/v1/issues")
   ```

4. **Use exception logging:**
   ```python
   try:
       result = await operation()
   except Exception:
       logger.exception("operation_failed", operation="create_issue")
       raise
   ```

### ❌ DON'T

1. **Don't log sensitive data:**
   ```python
   # BAD
   logger.info("login", password=password)

   # GOOD
   logger.info("login", success=True)
   ```

2. **Don't use string formatting:**
   ```python
   # BAD
   logger.info(f"User {user_id} created issue {issue_id}")

   # GOOD
   logger.info("issue_created", user_id=user_id, issue_id=issue_id)
   ```

3. **Don't log in tight loops:**
   ```python
   # BAD
   for item in items:
       logger.debug("processing", item_id=item.id)

   # GOOD
   logger.info("batch_processing", item_count=len(items))
   ```

---

## Summary

The telemetry flow is:

1. **Request enters** → RequestContextMiddleware injects context (ContextVars)
2. **Every log call** → Structlog processor reads ContextVars → Adds to log
3. **All layers log** → Router, Service, Repository, AI all use same logger
4. **Response returns** → Context cleared for next request
5. **Logs output** → Development (colored) or Production (JSON)
6. **Aggregation** → Query by request_id, workspace_id, correlation_id, etc.

**Key Benefits:**
- 🔍 **Automatic context** - Every log includes request/workspace/user
- 📊 **Performance tracking** - Duration metrics at every layer
- 🔗 **Distributed tracing** - Follow requests across services
- 📈 **Cost tracking** - AI token usage and costs
- 🚨 **Error tracking** - Full stack traces with context
- 📖 **Queryable logs** - JSON format for easy filtering
