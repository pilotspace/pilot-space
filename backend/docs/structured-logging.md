# Structured Logging with structlog

## Overview

The backend uses **structlog** for structured logging with JSON output in production and human-readable colored console output in development. This provides:

- **JSON-formatted logs** for easy ingestion by log aggregation systems (Datadog, CloudWatch, Splunk, etc.)
- **Request context injection** (request_id, workspace_id, user_id, correlation_id) automatically added to all logs
- **Performance metrics** tracking with duration measurements
- **Integration with existing telemetry** system for AI operations

## Configuration

Structured logging is configured automatically during application startup in the FastAPI lifespan:

```python
# main.py
from pilot_space.infrastructure.logging import configure_structlog, get_logger

@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()

    # Configure structured logging first
    configure_structlog(settings)
    logger = get_logger(__name__)
    logger.info("application_startup", app_name=settings.app_name)

    # ... rest of startup
```

### Environment-Specific Output

- **Development** (`APP_ENV=development`): Colored console output with pretty-printed exceptions
- **Production** (`APP_ENV=production`): JSON output for log aggregation systems

### Log Level

Set via environment variable:
```bash
LOG_LEVEL=INFO  # DEBUG, INFO, WARNING, ERROR, CRITICAL
```

## Usage

### Basic Logging

Replace standard `logging.getLogger()` with `get_logger()`:

```python
from pilot_space.infrastructure.logging import get_logger

logger = get_logger(__name__)

# Structured logging with key-value pairs
logger.info(
    "user_login",
    user_id=str(user.id),
    workspace_id=str(workspace.id),
    login_method="oauth",
)

logger.error(
    "database_error",
    error=str(e),
    query=query_str,
    table="issues",
)
```

### Request Context

Request context is **automatically injected** by `RequestContextMiddleware`. All logs within a request will include:

- `request_id`: Unique ID for this specific request
- `workspace_id`: Workspace from X-Workspace-ID header
- `user_id`: User ID from JWT token (after auth middleware)
- `correlation_id`: Correlation ID from X-Correlation-ID header (or auto-generated)

**Manual context setting** (for background jobs or workers):

```python
from pilot_space.infrastructure.logging import set_request_context, clear_request_context

# Set context
set_request_context(
    request_id="job-123",
    workspace_id=str(workspace_id),
    user_id=str(user_id),
    correlation_id="corr-abc",
)

try:
    # All logs here will include the context
    logger.info("background_job_started", job_type="digest")
    # ... do work ...
finally:
    # Clear context after job completes
    clear_request_context()
```

### Performance Metrics

Use `log_performance()` for tracking operation latency:

```python
from pilot_space.infrastructure.logging import log_performance
import time

start = time.time()
# ... do work ...
duration_ms = (time.time() - start) * 1000

log_performance(
    operation="database_query",
    duration_ms=duration_ms,
    query_type="SELECT",
    table="issues",
)
```

### Exception Logging

Use `.exception()` to automatically capture stack traces:

```python
try:
    result = await service.execute(payload)
except ValueError as e:
    logger.exception(
        "validation_error",
        error_type="ValueError",
        payload=payload.model_dump(),
    )
    raise
```

## Output Examples

### Development Mode

```
2026-02-10T10:30:45.123456Z [info     ] application_startup        app_name=Pilot Space app_env=development log_level=INFO
2026-02-10T10:30:45.234567Z [info     ] user_login                 user_id=550e8400-e29b-41d4-a716-446655440000 workspace_id=660e8400-e29b-41d4-a716-446655440001 request_id=req-123 correlation_id=corr-abc
```

### Production Mode (JSON)

```json
{
  "event": "application_startup",
  "timestamp": "2026-02-10T10:30:45.123456Z",
  "level": "info",
  "logger": "pilot_space.main",
  "app_name": "Pilot Space",
  "app_env": "production",
  "log_level": "INFO"
}

{
  "event": "user_login",
  "timestamp": "2026-02-10T10:30:45.234567Z",
  "level": "info",
  "logger": "pilot_space.api.v1.routers.auth",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "workspace_id": "660e8400-e29b-41d4-a716-446655440001",
  "request_id": "req-123",
  "correlation_id": "corr-abc"
}
```

## Integration with Telemetry

The AI telemetry system automatically uses structured logging when available:

```python
# ai/telemetry.py automatically detects structlog
from pilot_space.infrastructure.logging import get_logger

logger = get_logger(__name__)

# AI operations log with structured data
logger.info(
    "ai_operation_completed",
    operation="ghost_text",
    provider="google",
    model="gemini-2.0-flash",
    duration_ms=1234.5,
    input_tokens=150,
    output_tokens=50,
    cost_usd=0.00123,
)
```

## Querying Logs

### Local Development

Use `grep` or `jq` for filtering:

```bash
# Filter by event
tail -f logs/app.log | grep "user_login"

# Parse JSON logs
tail -f logs/app.log | jq 'select(.workspace_id == "ws-123")'

# Filter by log level
tail -f logs/app.log | jq 'select(.level == "error")'
```

### Production (Log Aggregation)

Example queries for Datadog:

```
# All logs for a specific request
request_id:req-123

# All errors in workspace
workspace_id:ws-456 level:error

# Slow AI operations
operation:ghost_text duration_ms:>2000

# Track request across services (distributed tracing)
correlation_id:corr-abc
```

## Best Practices

### ✅ DO

- **Use structured key-value logging** instead of string formatting
  ```python
  # Good
  logger.info("user_created", user_id=str(user.id), email=user.email)

  # Bad
  logger.info(f"User {user.id} created with email {user.email}")
  ```

- **Use snake_case keys** for consistency
  ```python
  logger.info("event_name", user_id="...", workspace_id="...")
  ```

- **Include context** (IDs, types, counts) for debugging
  ```python
  logger.info(
      "issues_fetched",
      count=len(issues),
      workspace_id=str(ws_id),
      filters=filters.model_dump(),
  )
  ```

- **Log at appropriate levels**:
  - `DEBUG`: Detailed debugging info (verbose)
  - `INFO`: Normal operations (default)
  - `WARNING`: Something unexpected but not an error
  - `ERROR`: Error that needs attention
  - `CRITICAL`: System-level failures

### ❌ DON'T

- **Don't log sensitive data** (passwords, API keys, tokens)
  ```python
  # Bad
  logger.info("api_call", api_key=api_key)

  # Good
  logger.info("api_call", provider="anthropic")
  ```

- **Don't use string formatting** in log messages
  ```python
  # Bad
  logger.info(f"User {user_id} logged in")

  # Good
  logger.info("user_login", user_id=str(user_id))
  ```

- **Don't log inside tight loops** (performance impact)
  ```python
  # Bad
  for item in items:
      logger.debug("processing_item", item_id=item.id)

  # Good
  logger.info("processing_batch", item_count=len(items))
  ```

## Migration from Standard Logging

Replace existing `logging.getLogger()` calls:

```python
# Before
import logging
logger = logging.getLogger(__name__)
logger.info("User login", extra={"user_id": user_id})

# After
from pilot_space.infrastructure.logging import get_logger
logger = get_logger(__name__)
logger.info("user_login", user_id=str(user_id))
```

## Troubleshooting

### Logs not showing up

Check log level:
```bash
LOG_LEVEL=DEBUG  # Set to DEBUG for maximum verbosity
```

### Context not appearing in logs

Ensure `RequestContextMiddleware` is the **first middleware** in the stack (in `main.py`):

```python
app.add_middleware(RequestContextMiddleware)  # Must be first
app.add_middleware(CORSMiddleware, ...)
```

### JSON output in development

Force JSON output even in development:
```python
# config.py
APP_ENV=production  # Forces JSON output
```

## References

- [structlog documentation](https://www.structlog.org/)
- [RFC 5424: Syslog Protocol](https://tools.ietf.org/html/rfc5424) (log levels)
- [Twelve-Factor App: Logs](https://12factor.net/logs) (treat logs as event streams)
