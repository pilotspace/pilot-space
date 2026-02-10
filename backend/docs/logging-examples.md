# Structured Logging Examples & Queries

## Quick Reference for Filtering Logs

### Development Mode (Colored Console)

When running locally with `APP_ENV=development`, logs are human-readable with colors:

```bash
# Filter by log level
tail -f logs/app.log | grep "\[error"
tail -f logs/app.log | grep "\[warning"

# Filter by event name
tail -f logs/app.log | grep "user_login"
tail -f logs/app.log | grep "ai_operation"

# Filter by operation
tail -f logs/app.log | grep "operation=ghost_text"
```

### Production Mode (JSON)

When running in production with `APP_ENV=production`, logs are JSON formatted:

```bash
# Pretty-print JSON logs
tail -f logs/app.log | jq '.'

# Filter by log level
tail -f logs/app.log | jq 'select(.level == "error")'
tail -f logs/app.log | jq 'select(.level == "warning" or .level == "error")'

# Filter by event
tail -f logs/app.log | jq 'select(.event == "user_login")'
tail -f logs/app.log | jq 'select(.event | startswith("ai_"))'

# Filter by workspace
tail -f logs/app.log | jq 'select(.workspace_id == "ws-123456")'

# Filter by user
tail -f logs/app.log | jq 'select(.user_id == "user-789012")'

# Filter by request
tail -f logs/app.log | jq 'select(.request_id == "req-abc123")'

# Trace entire request flow (correlation_id)
tail -f logs/app.log | jq 'select(.correlation_id == "corr-abc123")'

# Find slow operations
tail -f logs/app.log | jq 'select(.duration_ms > 1000)'

# AI operations with high cost
tail -f logs/app.log | jq 'select(.cost_usd > 0.01)'

# Database queries returning many rows
tail -f logs/app.log | jq 'select(.rows_returned > 100)'
```

## Common Query Patterns

### 1. Debug User Issues

Track all operations for a specific user:

```bash
# Development
tail -f logs/app.log | grep "user_id=user-789012"

# Production
tail -f logs/app.log | jq 'select(.user_id == "user-789012")'
```

### 2. Monitor API Performance

Find slow endpoints:

```bash
tail -f logs/app.log | jq 'select(.event == "performance_metric" and .duration_ms > 500)'
```

### 3. Track AI Operations

Monitor AI usage and costs:

```bash
# All AI operations
tail -f logs/app.log | jq 'select(.event | startswith("ai_operation"))'

# Expensive AI operations
tail -f logs/app.log | jq 'select(.event == "ai_operation_completed" and .cost_usd > 0.01)'

# Failed AI operations
tail -f logs/app.log | jq 'select(.event == "ai_operation_completed" and .success == false)'

# AI operations by provider
tail -f logs/app.log | jq 'select(.provider == "google")'
tail -f logs/app.log | jq 'select(.provider == "anthropic")'
```

### 4. Database Performance

Monitor database queries:

```bash
# Slow queries
tail -f logs/app.log | jq 'select(.event == "database_query_complete" and .duration_ms > 100)'

# Queries with many rows
tail -f logs/app.log | jq 'select(.rows_returned > 1000)'

# Failed transactions
tail -f logs/app.log | jq 'select(.event == "database_transaction_complete" and .success == false)'
```

### 5. Rate Limiting

Track rate limit violations:

```bash
# Rate limit warnings
tail -f logs/app.log | jq 'select(.event == "rate_limit_warning")'

# Rate limit exceeded
tail -f logs/app.log | jq 'select(.event == "rate_limit_exceeded")'

# By endpoint
tail -f logs/app.log | jq 'select(.event == "rate_limit_exceeded" and .endpoint == "/api/v1/ai/chat")'
```

### 6. Error Investigation

Find and analyze errors:

```bash
# All errors
tail -f logs/app.log | jq 'select(.level == "error" or .level == "critical")'

# Errors with exception traces
tail -f logs/app.log | jq 'select(.exception != null)'

# Errors by operation
tail -f logs/app.log | jq 'select(.level == "error" and .operation == "create_user")'

# Validation errors
tail -f logs/app.log | jq 'select(.error_type == "ValidationError")'
```

### 7. Distributed Tracing

Follow a request across services:

```bash
# Get correlation ID from first log
CORR_ID=$(tail -f logs/app.log | jq -r 'select(.correlation_id != null) | .correlation_id' | head -1)

# Trace entire request flow
tail -f logs/app.log | jq --arg id "$CORR_ID" 'select(.correlation_id == $id)'
```

## Log Aggregation Systems

### Datadog

```
# Search by event
event:user_login

# Search by level
level:error

# Search by workspace
workspace_id:ws-123456

# Complex query
level:error workspace_id:ws-123456 operation:create_issue

# Duration threshold
duration_ms:>1000

# Cost threshold
cost_usd:>0.01
```

### CloudWatch Insights

```sql
-- Errors in last hour
fields @timestamp, level, event, operation, error_type
| filter level = "error"
| sort @timestamp desc
| limit 100

-- Slow API requests
fields @timestamp, operation, duration_ms, endpoint
| filter event = "performance_metric" and duration_ms > 500
| sort duration_ms desc
| limit 50

-- AI costs per workspace
fields workspace_id, sum(cost_usd) as total_cost
| filter event = "ai_operation_completed"
| stats sum(cost_usd) by workspace_id
| sort total_cost desc
```

### Splunk

```
# Basic search
index=backend level=error

# Complex search with fields
index=backend event=ai_operation_completed cost_usd>0.01
| table _time, workspace_id, operation, provider, cost_usd

# Statistics
index=backend event=performance_metric
| stats avg(duration_ms) by operation

# Timechart
index=backend level=error
| timechart count by error_type
```

## Best Practices

### 1. Use Structured Keys

```python
# ✅ Good - structured data
logger.info("user_login", user_id=user_id, method="oauth")

# ❌ Bad - string formatting
logger.info(f"User {user_id} logged in via oauth")
```

### 2. Include Context

```python
# ✅ Good - rich context
logger.error(
    "database_error",
    error=str(e),
    query_type="INSERT",
    table="issues",
    workspace_id=str(workspace_id),
)

# ❌ Bad - minimal context
logger.error(f"Database error: {e}")
```

### 3. Use Appropriate Levels

- **DEBUG**: Detailed info for development (verbose)
- **INFO**: Normal operations, state changes
- **WARNING**: Something unexpected but recoverable
- **ERROR**: Error that needs attention but app continues
- **CRITICAL**: System-level failure, app may not function

### 4. Avoid Sensitive Data

```python
# ❌ Bad - logs password
logger.info("login_attempt", email=email, password=password)

# ✅ Good - no sensitive data
logger.info("login_attempt", email=email, success=True)
```

## Testing Your Logs

Run the test script to see all log levels in action:

```bash
# Development mode (colored console)
uv run python scripts/test_logging_levels.py --env development

# Production mode (JSON)
uv run python scripts/test_logging_levels.py --env production

# Pipe to jq for better formatting
uv run python scripts/test_logging_levels.py --env production 2>&1 | jq '.'
```

## Real-World Examples

### Example 1: Debug User Login Issues

```bash
# Find all login attempts for user
cat logs/app.log | jq 'select(.event == "user_login" and .user_email == "user@example.com")'

# Find failed logins
cat logs/app.log | jq 'select(.event == "login_failed")'
```

### Example 2: Monitor AI Spending

```bash
# Calculate total AI cost for workspace
cat logs/app.log | jq -s '
  map(select(.event == "ai_operation_completed" and .workspace_id == "ws-123"))
  | map(.cost_usd)
  | add
'

# Average latency by provider
cat logs/app.log | jq -s '
  group_by(.provider)
  | map({provider: .[0].provider, avg_ms: (map(.duration_ms) | add / length)})
'
```

### Example 3: Investigate Performance Issues

```bash
# Find slowest operations in last hour
cat logs/app.log | jq 'select(.duration_ms != null)' | jq -s 'sort_by(.duration_ms) | reverse | .[0:10]'

# Operations over 1 second
cat logs/app.log | jq 'select(.duration_ms > 1000) | {event, operation, duration_ms}'
```
