# Agents Layer - PilotSpaceAgent Orchestrator & Subagents

**For AI layer overview, see parent [ai/CLAUDE.md](../CLAUDE.md).**

---

## PilotSpaceAgent: Orchestrator (DD-086)

### Architecture

**Class**: `StreamingSDKBaseAgent[ChatInput, ChatOutput]`

**Key Method**: `async def stream(input_data: ChatInput, context: AgentContext) -> AsyncIterator[str]`

```python
class PilotSpaceAgent(StreamingSDKBaseAgent[ChatInput, ChatOutput]):
    """Main orchestrator agent -- routes to skills, subagents, or direct responses."""

    AGENT_NAME = "pilotspace_agent"
    DEFAULT_MODEL_TIER = ModelTier.SONNET  # Cost-optimized

    SYSTEM_PROMPT_BASE = """
    You are PilotSpace AI, an embedded assistant in a Note-First SDLC platform.

    ## Tool categories
    **Notes** (9 tools): write_to_note, update_note_block, extract_issues, ...
    **Issues** (10 tools): get_issue, search_issues, create_issue, link_issues, ...
    **Projects** (5 tools): get_project, create_project, update_project, ...
    **Comments** (4 tools): create_comment, update_comment, search_comments, ...

    ## Approval tiers
    - Auto-execute: search/get tools (read-only)
    - Require approval: create/update/link tools (configurable)
    - Always require: unlink/delete tools (destructive)

    Subagents: pr-review, doc-gen
    Note: ai-context was migrated from subagent to skill (DD-086).
    Return operation payloads; never mutate DB directly.
    """

    SUBAGENT_MAP = {
        "pr-review": "PRReviewSubagent",
        # ai-context: now handled via ai-context skill (DD-086), no longer a subagent
        "doc-gen": "DocGeneratorSubagent",
    }
```

### Initialization Flow

**Dependency Injection** (in `container.py`):
```python
pilotspace_agent = providers.Singleton(
    _create_pilotspace_agent,
    tool_registry=tool_registry,
    provider_selector=provider_selector,
    cost_tracker=cost_tracker,
    resilient_executor=resilient_executor,
    permission_handler=permission_handler,
    session_handler=session_handler,
)
```

**Constructor Dependencies**:

| Dependency | Purpose | Initialized |
|-----------|---------|-------------|
| tool_registry | 33 tools across 6 servers | On startup |
| provider_selector | Task -> Provider routing + fallbacks | Singleton |
| cost_tracker | Token usage + pricing | Per-request |
| resilient_executor | Retry + circuit breaker | Singleton per provider |
| permission_handler | DD-003 approval workflow | Per-request |
| session_handler | Redis + PostgreSQL durable storage | Singleton |
| space_manager | Workspace sandbox management | Lazy |
| subagents | PRReviewSubagent, DocGeneratorSubagent | Spawned on-demand |
| key_storage | Supabase Vault for BYOK keys | Singleton |

**Startup Sequence**:
1. Load environment variables (config.py)
2. Initialize database connection pool (SQLAlchemy async engine)
3. Create Redis client (hot cache)
4. Create tool_registry (MCP servers)
5. Create provider_selector (task routing table)
6. Create PilotSpaceAgent (Singleton, lazy-initialized on first chat request)
7. Skill discovery (auto-load from `.claude/skills/`)
8. Mount SSE routers in FastAPI app

---

## Stream Method

**Entry Point for Chat**:

1. Get API key (BYOK per workspace)
2. Build system prompt with dynamic context
3. Configure MCP servers (33 tools total)
4. Create ClaudeSDKClient with in-process subprocess
5. Stream SDK responses -> transform to SSE -> yield
6. Handle errors (ProviderUnavailableError) -> SSE error event
7. Cleanup active clients

Max tokens per session: 8,000 (configurable)

---

## Message Transformation Pipeline

**From SDK to SSE**: `transform_sdk_message()` (delegates to pilotspace_agent_helpers.py)

**Event Types Emitted** (9 types):
- message_start, text_delta, tool_use, tool_result (SDK events)
- content_update (note/issue mutations from tool payloads)
- task_progress, approval_request (long-running ops)
- message_stop, error

**Example: content_update Event**:
```json
{
  "type": "content_update",
  "note_id": "550e8400-e29b-41d4-a716-446655440000",
  "blocks": [{
    "block_id": "P1",
    "operation": "replace",
    "content": "<p>Updated text</p>"
  }]
}
```

---

## Session Management Integration

### SessionManager (Redis + PostgreSQL)

**File**: `ai/session/session_manager.py`

**Dual-Store Architecture**:
- **Redis** (hot cache, 30-min TTL): Fast session retrieval for active conversations
- **PostgreSQL** (durable, 24h TTL): Session resumption after Redis expiry, message history

**Core Methods**:
- `create_session()` -> Stores in Redis + PostgreSQL
- `get_session()` -> Tries Redis first, falls back to PostgreSQL with restoration
- `append_message()` -> Updates both stores
- `delete_session()` -> Cleans up both stores

**Resumption**: ChatRequest can specify `resume_session_id` to continue a previous conversation.

**Known Issue**: Current implementation checks `input_data.resume_session_id` but always uses `session_id_str` for the actual resumption -- the `resume_session_id` value is effectively unused beyond triggering the resume path. This may be a bug or intentional design where the router maps `resume_session_id` into `session_id` before reaching the agent.

### Key Constants

| Constant | Value | Context |
|----------|-------|---------|
| SESSION_TTL_SECONDS | 86400 | PostgreSQL durable storage (24 hours) |
| REDIS_TTL_SECONDS | 1800 | Redis hot cache (30 minutes) |

---

## Approval Workflow (DD-003)

### PermissionHandler

**File**: `ai/sdk/permission_handler.py`

**Classification Matrix** (3 categories):

| Category | Approval | Examples |
|----------|----------|----------|
| Non-destructive | Auto-execute | get_issue, search, add_label, assign, transition |
| Content creation | Configurable | create_issue, create_comment, extract_issues |
| Destructive | Always required | delete_issue, unlink_issue, archive_workspace |

**API**: `check_permission(action, tool_call_id, data)` -> PermissionResult with approval request if needed

**ApprovalRequest**: Stores action, data, 24h expiration, approval/rejection timestamps

### SSE Approval Flow

**Event Sequence** (Destructive Action Example):

1. **Detection**: AI calls `delete_issue()` tool
2. **Permission Check**: `PermissionHandler.check_permission("delete_issue", ...)` -> `requires_approval_result()`
3. **SSE Event**: Emit `approval_request` event:
   ```json
   {
     "type": "approval_request",
     "tool_call_id": "tc_123",
     "action": "delete_issue",
     "data": {"issue_id": "...", "title": "Old feature"},
     "expires_in_seconds": 86400
   }
   ```
4. **Frontend Modal**: Renders issue details (readonly), Approve/Reject buttons, countdown timer
5. **User Response**: Clicks "Approve" -> POST `/api/v1/ai/chat/answer`:
   ```json
   {"question_id": "tc_123", "response": "approved"}
   ```
6. **SDK Continuation**: `agent.submit_tool_result(session_id, "tc_123", "approved")` -> SDK re-invokes tool
7. **Execution**: MCP tool now has permission to execute -> DB mutation -> SSE event

### Content Creation Approval (Configurable)

- Workspace setting: `require_ai_approvals: true/false`
- If enabled: Same flow as destructive
- If disabled: `PermissionHandler.auto_approve()` -> Tool executes immediately

---

## Subagents: Multi-Turn Conversational Agents

All subagents extend `StreamingSDKBaseAgent[Input, Output]` with async streaming of SSE events.

### PRReviewSubagent

**File**: `ai/agents/subagents/pr_review_subagent.py`

**Model**: Claude Opus (deep reasoning for 5 aspects)

**Flow**: Fetch PR from GitHub -> Build multi-aspect prompt -> Stream review via SDK -> Transform to SSE

**Aspects**: Architecture, Security, Code Quality, Performance, Documentation

### DocGeneratorSubagent

**Similar pattern** for ADR/API/spec generation with Claude Sonnet.

---

## Key Files

| Component | File | Purpose |
|-----------|------|---------|
| Orchestrator | `ai/agents/pilotspace_agent.py` | Main agent routing to skills/subagents |
| Base class | `ai/agents/agent_base.py` | StreamingSDKBaseAgent base class |
| Stream utils | `ai/agents/pilotspace_stream_utils.py` | SDK message handling |
| PR Review | `ai/agents/subagents/pr_review_subagent.py` | Multi-turn code review |
| Doc Generator | `ai/agents/subagents/doc_generator_subagent.py` | ADR/spec generation |
| Permission | `ai/sdk/permission_handler.py` | Human-in-the-loop (DD-003) |
| Sessions | `ai/session/session_manager.py` | Redis hot cache + PostgreSQL durable |

---

## Data Flow: Chat Request -> Response

```
Frontend POST /api/v1/ai/chat
    | (ChatRequest with workspace_id, user_id)
FastAPI Router (ai_chat.py)
    | PilotSpaceAgentDep injection
PilotSpaceAgent.stream(ChatInput)
    | (1) Get API key from Vault (per-workspace BYOK)
    | (2) Build system prompt + role skill injection (primary UserRoleSkill)
    | (3) Configure MCP servers + allowed_tools
ClaudeSDKClient (in-process)
    | (4) Routes: skill detected? -> skill execution
    |       OR: subagent mentioned? -> spawn subagent
    |       OR: tool call? -> MCP tool handler
Tool Handler (e.g., note_server.py)
    | (5) Tool validates + returns operation payload
    |       e.g., {"status": "pending_apply", "note_id": "...", "block_id": "...", "operation": "..."}
transform_sdk_message() in pilotspace_note_helpers.py
    | (6) Converts payload -> SSE content_update event
    |       {"type": "content_update", "note_id": "...", "blocks": [...]}
SSE StreamingResponse
    | (7) Yields text_delta, tool_use, content_update, task_progress, approval_request
Frontend useContentUpdates() Hook
    | (8) Processes content_update -> TipTap editor mutation + API call
    | (9) Displays SSE text_delta in chat UI
```

---

## Related Documentation

- **AI Layer Parent**: [ai/CLAUDE.md](../CLAUDE.md)
- **MCP Tools**: [mcp/CLAUDE.md](../mcp/CLAUDE.md)
- **Providers**: [providers/CLAUDE.md](../providers/CLAUDE.md)
- **Backend Parent**: [backend/CLAUDE.md](../../../../CLAUDE.md)
- **Design Decisions**: DD-086 (centralized agent), DD-003 (approval workflow)
- **Claude SDK**: `docs/claude-sdk.txt`
