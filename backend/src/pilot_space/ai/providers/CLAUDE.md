# Provider Routing, Resilience & Cost Tracking - Pilot Space AI Layer

**For AI layer overview, see parent [ai/CLAUDE.md](../CLAUDE.md)**

---

## Overview

The providers module handles task-based provider routing (DD-011), circuit breaker resilience, cost tracking, and error propagation for all AI operations. It ensures the right model handles each task type, with per-task fallback chains and budget controls.

---

## Provider Routing & Fallback (DD-011)

### ProviderSelector Class

**File**: `ai/providers/provider_selector.py`

Routes each AI task to the optimal provider based on task complexity, latency requirements, and cost.

### Provider Enum (3 generic providers)

```python
class Provider(Enum):
    ANTHROPIC = "anthropic"
    OPENAI = "openai"
    GOOGLE = "google"
```

### Model ID Constants (on ProviderSelector class)

```python
ANTHROPIC_OPUS: Final[str] = "claude-opus-4-5"
ANTHROPIC_SONNET: Final[str] = "claude-sonnet-4"
ANTHROPIC_HAIKU: Final[str] = "claude-3-5-haiku"
GOOGLE_FLASH: Final[str] = "gemini-2.0-flash"
GOOGLE_PRO: Final[str] = "gemini-2.0-pro"
OPENAI_EMBEDDING: Final[str] = "text-embedding-3-large"
```

### TaskType Enum (20 task types)

```python
class TaskType(Enum):
    # Opus tier (complex reasoning)
    PR_REVIEW = "pr_review"
    AI_CONTEXT = "ai_context"
    TASK_DECOMPOSITION = "task_decomposition"
    PATTERN_DETECTION = "pattern_detection"

    # Sonnet tier (standard tasks)
    CODE_GENERATION = "code_generation"
    DOC_GENERATION = "doc_generation"
    ISSUE_ENHANCEMENT = "issue_enhancement"
    ISSUE_EXTRACTION = "issue_extraction"
    MARGIN_ANNOTATION = "margin_annotation"
    CONVERSATION = "conversation"
    DUPLICATE_DETECTION = "duplicate_detection"
    DIAGRAM_GENERATION = "diagram_generation"
    TEMPLATE_FILLING = "template_filling"

    # Haiku/Flash tier (latency-sensitive)
    GHOST_TEXT = "ghost_text"
    NOTIFICATION_PRIORITY = "notification_priority"
    ASSIGNEE_RECOMMENDATION = "assignee_recommendation"
    COMMIT_LINKING = "commit_linking"

    # Embeddings
    EMBEDDINGS = "embeddings"
    SEMANTIC_SEARCH = "semantic_search"
```

### Task to Provider Mapping

| Task | Provider | Model ID | Reason | SLA |
|------|----------|----------|--------|-----|
| PR review | Claude Opus | `claude-opus-4-5` | Deep reasoning, cross-aspect references | <5min |
| AI context | Claude Opus | `claude-opus-4-5` | Complex context aggregation | <30s |
| Code generation | Claude Sonnet | `claude-sonnet-4` | Cost-optimized for standard tasks | <30s |
| Template filling | Claude Sonnet | `claude-sonnet-4` | Role skill generation | <30s |
| Ghost text | Gemini Flash | `gemini-2.0-flash` | Latency-critical, small token count | <2.5s |
| Embeddings | OpenAI | `text-embedding-3-large` | 768-dim, HNSW optimized | <500ms |

### Routing Table (key entries)

```python
_ROUTING_TABLE = {
    TaskType.PR_REVIEW: ProviderConfig(
        primary=Provider.ANTHROPIC,  # Opus
        fallback=[Provider.ANTHROPIC],  # Sonnet
        max_tokens=8_000,
        cache_control="ephemeral",
    ),
    TaskType.AI_CONTEXT: ProviderConfig(
        primary=Provider.ANTHROPIC,  # Opus
        fallback=[Provider.ANTHROPIC],  # Sonnet
        max_tokens=2_000,
    ),
    TaskType.GHOST_TEXT: ProviderConfig(
        primary=Provider.GOOGLE,  # Flash
        fallback=[Provider.ANTHROPIC],  # Sonnet
        max_tokens=50,
        timeout_sec=2.5,
    ),
    TaskType.TEMPLATE_FILLING: ProviderConfig(
        primary=Provider.ANTHROPIC,  # Sonnet
        fallback=[Provider.ANTHROPIC],  # Haiku
    ),
}
```

### Selection API

**Simple Selection**: `provider = provider_selector.select(task_type=TaskType.PR_REVIEW)` -> ProviderConfig

**Fallback Handling**:
- Try primary with ResilientExecutor
- On `ProviderUnavailableError`, call `get_fallback()` to get next provider in chain
- Each task type has its own fallback chain (not a single unified chain)

**Per-Task Fallback Chains**:
```
PR_REVIEW:        Opus -> Sonnet
AI_CONTEXT:       Opus -> Sonnet
GHOST_TEXT:       Gemini Flash -> Sonnet
TEMPLATE_FILLING: Sonnet -> Haiku
SEMANTIC_SEARCH:  OpenAI (no fallback)
```

**Health Check**: `is_provider_healthy(provider)` checks circuit breaker state before routing.

---

## Resilience Patterns

### ResilientExecutor (exponential backoff + circuit breaker)

**File**: `ai/infrastructure/resilience.py`

Wraps all provider calls with retry logic and circuit breaker integration.

**Configuration**:
```python
RetryConfig(
    max_retries=3,
    base_delay=1.0,      # seconds
    max_delay=60.0,       # seconds
    jitter=0.3,           # 30% randomization
)
```

**Execution Flow** (for each attempt up to max_retries):
1. Circuit breaker check (fail-fast if OPEN)
2. Execute operation with timeout
3. On timeout/rate limit: exponential backoff with jitter, then retry
4. On success: return result, record success on circuit breaker

**Decorator Form**:
```python
@with_resilience(provider="anthropic", timeout_sec=30, retry_config=...)
async def call_provider(prompt: str) -> str:
    ...
```

### Circuit Breaker (prevent cascading failures)

**File**: `ai/circuit_breaker.py`

Per-provider state machine preventing cascading failures when a provider is down.

**State Transitions**:
```
CLOSED (normal)
    | 3 consecutive failures
    v
OPEN (fail-fast)
    | 30s timeout
    v
HALF_OPEN (probe)
    | success -> CLOSED
    | failure -> OPEN
```

**Singleton Pattern**: `CircuitBreaker.get_or_create(name)` ensures one breaker per provider (not per-request).

**Metrics**: `get_metrics()` returns name, state, failure_count, success_count, last_failure_time.

### Key Constants

| Constant | Value | Context |
|----------|-------|---------|
| CIRCUIT_BREAKER_TIMEOUT | 30 seconds | Transition from OPEN to HALF_OPEN |
| FAILURE_THRESHOLD | 3 | Consecutive failures to open circuit |
| MAX_RETRIES | 3 | Exponential backoff attempts |
| BASE_DELAY | 1.0 second | Retry initial delay |
| MAX_DELAY | 60.0 seconds | Retry cap on exponential growth |
| JITTER | 0.3 | Randomization on retry delays |

---

## Cost Tracking

### CostTracker

**File**: `ai/infrastructure/cost_tracker.py`

Tracks per-request token usage, calculates USD cost using provider-specific pricing, persists to PostgreSQL, and triggers budget alerts.

### Pricing Table (per 1M input/output tokens)

| Provider | Model ID | Input | Output |
|----------|----------|-------|--------|
| Claude Opus | `claude-opus-4-5-20251101` | $15.00 | $75.00 |
| Claude Sonnet | `claude-sonnet-4-20250514` | $3.00 | $15.00 |
| Claude Haiku | `claude-3-5-haiku-20241022` | $1.00 | $5.00 |
| Gemini Pro | `gemini-2.0-pro` | $1.25 | $5.00 |
| Gemini Flash | `gemini-2.0-flash` | $0.075 | $0.30 |
| GPT-4o | `gpt-4o` | $5.00 | $15.00 |
| GPT-4o Mini | `gpt-4o-mini` | $0.15 | $0.60 |
| Embeddings | `text-embedding-3-large` | $0.13 | $0.00 |

- **Cached tokens**: 90% discount applied on input tokens

### API

```python
await cost_tracker.track_request(
    workspace_id=workspace_id,
    model_id="claude-sonnet-4-20250514",
    prompt_tokens=1500,
    completion_tokens=800,
    cached_tokens=500,
)
```

**Behavior**:
- Calculates USD cost from token counts and pricing table
- Persists `AICostRecord` to PostgreSQL
- Triggers budget alert at 90% of workspace limit
- Supports per-workspace cost aggregation queries

---

## Error Handling

### Custom Exceptions

**File**: `ai/exceptions.py`

| Exception | Purpose | Recoverable |
|-----------|---------|-------------|
| `AIException` | Base exception for all AI errors | Varies |
| `ProviderUnavailableError` | Circuit breaker OPEN, provider down | Yes (fallback) |
| `AITimeoutError` | Operation exceeded timeout | Yes (retry) |
| `RateLimitError` | Provider rate limit hit (includes `retry_after`) | Yes (backoff) |
| `ApprovalTimeoutError` | Human approval expired (24h) | No |

### Error Propagation via SSE

Errors are sent to the frontend as SSE events with recovery metadata:

```json
{
  "type": "error",
  "code": "provider_unavailable",
  "message": "Claude API temporarily unavailable",
  "recoverable": true,
  "retry_after_seconds": 30
}
```

**Error code semantics**:

| Code | Meaning | Recoverable | Action |
|------|---------|-------------|--------|
| `provider_unavailable` | Circuit breaker OPEN | Yes | Retry after timeout |
| `rate_limit_exceeded` | Provider rate limit | Yes | Wait `retry_after_seconds` |
| `ai_timeout` | Operation timed out | Yes | Retry with backoff |
| `approval_timeout` | 24h approval window passed | Yes | User can re-initiate |
| `ai_error` | Generic AI error | Varies | Check details |

---

## Adding a New Provider

Follow these steps to add a new LLM provider:

1. **Add to Provider enum** in `provider_selector.py`:
   ```python
   class Provider(Enum):
       ANTHROPIC = "anthropic"
       OPENAI = "openai"
       GOOGLE = "google"
       NEW_PROVIDER = "new_provider"  # Add here
   ```

2. **Add to routing table** with task mapping:
   ```python
   TaskType.SUMMARIZATION: ProviderConfig(
       primary=Provider.NEW_PROVIDER,
       fallback=[Provider.ANTHROPIC],
       max_tokens=1_000,
   )
   ```

3. **Add to pricing table** in `cost_tracker.py`:
   ```python
   Provider.NEW_PROVIDER: {
       "input_tokens": 0.8 / 1_000_000,
       "output_tokens": 4.0 / 1_000_000,
   }
   ```

4. **Create circuit breaker** for resilience:
   ```python
   CircuitBreaker.get_or_create("new_provider")
   ```

5. **Test fallback chain**: `pytest tests/ai/test_provider_selector.py`

---

## Debugging Provider Issues

### Session Stuck/Lost

- Check Redis: `redis-cli GET session:{session_id}`
- Check PostgreSQL: `SELECT * FROM chat_session WHERE id = '{session_id}'`
- Force restoration: Restart service (clears Redis, postgres persists)

### Tool Not Executing

- Check permission classification: `PermissionHandler.ACTION_CLASSIFICATIONS`
- Check tool registered: Tool name in `pilotspace_agent.py` ALL_TOOL_NAMES
- Check RLS: Verify `get_workspace_context()` returns correct workspace_id

### Circuit Breaker Stuck OPEN

- Check metrics: `CircuitBreaker.get_metrics()`
- Manually close: Restart service or call `breaker.reset()` (development only)
- Config: Adjust `failure_threshold` (default: 3) or `timeout_seconds` (default: 30s)

### Cost Spike

- Query: `SELECT SUM(cost_usd) FROM ai_cost_record WHERE workspace_id = '{ws_id}' AND created_at > NOW() - INTERVAL 1 HOUR`
- Check cached tokens: Prompt caching should show ~90% discount on input tokens
- Provider routing: Verify task-to-provider mapping uses cost-optimized selections

---

## Key Files

| Component | File | Purpose |
|-----------|------|---------|
| Provider Selector | `ai/providers/provider_selector.py` | Task -> Provider routing (DD-011) |
| Key Validator | `ai/providers/key_validator.py` | BYOK key verification |
| Resilience | `ai/infrastructure/resilience.py` | ResilientExecutor (retry + CB) |
| Circuit Breaker | `ai/circuit_breaker.py` | Per-provider state machine |
| Cost Tracker | `ai/infrastructure/cost_tracker.py` | Token usage + pricing |
| Exceptions | `ai/exceptions.py` | AI-specific exception hierarchy |
| Mock Provider | `ai/providers/mock.py` | Testing mock providers |

---

## Related Documentation

- **AI Layer Parent**: [ai/CLAUDE.md](../CLAUDE.md) - Full AI architecture overview
- **Agents**: [agents/CLAUDE.md](../agents/CLAUDE.md) - PilotSpaceAgent orchestrator
- **MCP Tools**: [mcp/CLAUDE.md](../mcp/CLAUDE.md) - 33 tools across 6 servers
- **Design Decisions**: DD-011 (provider routing per task type), DD-003 (approval)
- **Backend Patterns**: `docs/dev-pattern/45-pilot-space-patterns.md`
