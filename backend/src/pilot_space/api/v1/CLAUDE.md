# API v1 Router Details

**File**: `backend/src/pilot_space/api/v1/CLAUDE.md`
**Scope**: Individual router endpoints, middleware deep-dives, common patterns with code
**Parent**: [`../CLAUDE.md`](../CLAUDE.md) (API Layer)

---

## Router Organization (20 Routers)

### Core Resource Routers (7)

#### 1. workspaces.py

**Prefix**: `/api/v1/workspaces`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | List user's workspaces (paginated) |
| `/` | POST | Create new workspace (user becomes owner) |
| `/{id}` | GET | Get workspace details |
| `/{id}` | PATCH | Update workspace (name, description) |
| `/{id}` | DELETE | Soft-delete workspace |

#### 2. workspace_members.py

**Prefix**: `/api/v1/workspaces/{workspace_id}/members`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | List workspace members |
| `/{user_id}` | PATCH | Update member role (owner to admin) |
| `/{user_id}` | DELETE | Remove member |

#### 3. workspace_invitations.py

**Prefix**: `/api/v1/workspaces/{workspace_id}/invitations`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | List pending invitations |
| `/` | POST | Send invitation to email |
| `/{token}` | POST | Accept invitation |
| `/{id}` | DELETE | Revoke invitation |

#### 4. projects.py

**Prefix**: `/api/v1/workspaces/{workspace_id}/projects`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | List projects in workspace |
| `/` | POST | Create project |
| `/{id}` | GET | Get project details |
| `/{id}` | PATCH | Update project |
| `/{id}` | DELETE | Delete project (soft) |

#### 5. issues.py

**Prefix**: `/api/v1/issues`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | POST | Create issue (optional AI enhancement) |
| `/` | GET | Search issues (filters, pagination) |
| `/{id}` | GET | Get issue details |
| `/{id}` | PATCH | Update issue (state, assignee, etc.) |
| `/{id}` | DELETE | Delete issue |
| `/{id}/activities` | GET | Get activity timeline |
| `/{id}/comments` | POST | Add comment |

#### 6. workspace_notes.py

**Prefix**: `/api/v1/workspaces/{workspace_id}/notes`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | List notes (paginated) |
| `/` | POST | Create note with TipTap blocks |
| `/{id}` | GET | Get note + blocks + metadata |
| `/{id}` | PATCH | Update note blocks/metadata |
| `/{id}` | DELETE | Delete note (soft) |
| `/{id}/pin` | POST | Pin to home |
| `/{id}/unpin` | POST | Unpin |

#### 7. workspace_cycles.py

**Prefix**: `/api/v1/workspaces/{workspace_id}/cycles`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | List cycles in workspace |
| `/` | POST | Create cycle (sprint) |
| `/{id}` | GET | Get cycle details + velocity metrics |
| `/{id}` | PATCH | Update cycle (dates, name) |
| `/{id}/rollover` | POST | Complete cycle, carry-over issues |

---

### AI Feature Routers (10)

#### 8. ai_chat.py

**Prefix**: `/api/v1/ai/chat`

Unified conversational AI (PilotSpaceAgent orchestrator).

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/chat` | POST | Start/continue chat (SSE or queue job ID) |
| `/chat/stream/{job_id}` | GET | SSE stream (queue mode) |
| `/chat/abort` | POST | Abort in-flight chat |
| `/chat/answer` | POST | Answer AI clarifying question |

**Request**: ChatRequest(message, session_id, fork_session_id, context: ChatContext)

**Response**: SSE events (message_start, text_delta, tool_use, tool_result, task_progress, approval_request, content_update, message_stop, error) or queue job_id/stream_url

**Auth**: Bearer token via query param for SSE (cookies may not work on GET)

#### 9. ghost_text.py

**Prefix**: `/api/v1/ghost-text`

Latency-critical inline completions (<2.5s SLA, independent agent).

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | POST | Get inline completion (SSE, max 50 tokens, <1.5s) |

**Provider**: Google Gemini Flash (cost-optimized)

#### 10. ai_costs.py

**Prefix**: `/api/v1/ai/costs`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | Cost summary (total, by model, by month) |
| `/usage` | GET | Detailed token records (paginated) |
| `/budget` | PATCH | Set monthly budget cap |
| `/export` | GET | Export as CSV |

#### 11. ai_approvals.py

**Prefix**: `/api/v1/ai/approvals`

Human-in-the-loop approval (DD-003).

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | List pending approvals |
| `/{id}` | GET | Get approval details |
| `/{id}/approve` | POST | Approve (with edits) |
| `/{id}/deny` | POST | Reject |
| `/{id}/permissions/{action}` | PATCH | Configure rules |

**Categories**: Non-destructive (auto), content creation (configurable), destructive (always)

#### 12. ai_configuration.py

**Prefix**: `/api/v1/ai/configuration`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | Get workspace AI config |
| `/` | PATCH | Update preferences (approval, budget) |
| `/providers` | GET | List configured providers |
| `/providers/{provider}` | PATCH | Update API key (encrypted via Supabase Vault) |

#### 13. ai_sessions.py

**Prefix**: `/api/v1/ai/sessions`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | List user's sessions |
| `/{session_id}` | GET | Get session + metadata |
| `/{session_id}/messages` | GET | Get paginated messages |
| `/{session_id}` | DELETE | Delete (soft) |

#### 14. ai_extraction.py

**Prefix**: `/api/v1/ai/extraction`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | POST | Extract issues from text/note block |

**Invokes**: `extract-issues` skill, creates issues with NoteIssueLink

#### 15. ai_annotations.py

**Prefix**: `/api/v1/ai/annotations` (Legacy, being migrated)

Margin annotations (AI margin suggestions).

#### 16. notes_ai.py

**Prefix**: `/api/v1/ghost-text` (Note-specific)

Ghost text for note editor (note context variant).

#### 17. ai_context.py / workspace_notes_ai.py

Additional AI endpoints for context generation and note-specific AI features.

---

### Support Routers (3+)

#### 18. auth.py

**Prefix**: `/api/v1/auth`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/login` | POST | OAuth login (Supabase flow) |
| `/callback` | GET | OAuth callback handler |
| `/refresh` | POST | Refresh expired JWT |
| `/logout` | POST | Logout (client clears token) |
| `/profile` | GET | Get current user profile |

#### 19. integrations.py

**Prefix**: `/api/v1/integrations`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/github/connect` | POST | Connect GitHub account |
| `/github/disconnect` | POST | Disconnect GitHub |
| `/slack/connect` | POST | Connect Slack workspace |
| `/slack/disconnect` | POST | Disconnect Slack |

#### 20. webhooks.py

**Prefix**: `/api/v1/webhooks`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/github` | POST | GitHub webhook handler (PR events) |
| `/slack` | POST | Slack event handler |

**Signature Verification**: GitHub uses X-Hub-Signature-256 HMAC-SHA256 header

#### Other Support Routers

- `homepage.py` -- Activity feed, digest, onboarding upsell
- `skills.py` -- Skill discovery (list available `.claude/skills/`)
- `role_skills.py` -- User role/skill assignments
- `mcp_tools.py` -- MCP tool registry, direct execution
- `debug.py` -- Mock generator (dev only)

---

## Middleware Deep-Dives

### 1. RequestContextMiddleware

**File**: `middleware/request_context.py`

Extracts `X-Workspace-ID` and `X-Correlation-ID` headers, stores in `request.state`.

**Usage**: `workspace_id: WorkspaceId, correlation_id: CorrelationId` (type aliases for auto-injection)

### 2. AuthMiddleware

**File**: `middleware/auth_middleware.py`

Validates Bearer token, extracts user_id/workspace_ids, stores in `request.state.user`. Skips public routes (/health, /docs, /login, /callback, /refresh).

**Token Claims**: user_id, email, workspace_ids, role_in_workspace (dict), is_email_verified

### 3. Error Handler

**File**: `middleware/error_handler.py`

Converts all exceptions to RFC 7807 Problem Details.

**Response Format**: `{"type": "...", "title": "...", "status": 400, "detail": "...", "instance": "/api/v1/..."}`

**Handled Types**: HTTPException (400/401/403/404/422/429/500), ValidationError (Pydantic), generic exceptions (500)

### 4. Rate Limiter

**File**: `middleware/rate_limiter.py`

Standard: 1000 req/min per user. AI endpoints: 100 req/min (includes `/ai/*` routes).

**Response**: RFC 7807 with 429 status + retry-after guidance

### 5. CORS Middleware

**File**: `middleware/cors.py`

Localhost 3000 for dev; configured via env var for production. Allows credentials, all methods/headers.

---

## Common Router Patterns

### Pattern 1: List with Pagination

```python
@router.get("/issues")
async def list_issues(
    workspace_id: WorkspaceId,
    page_size: int = Query(20, ge=1, le=100),
    cursor: str | None = None,
) -> PaginatedResponse[IssueResponse]:
    service = ListIssuesService(...)
    page = await service.execute(ListIssuesPayload(..., limit=page_size))
    return PaginatedResponse(items=[...], total=page.total, next_cursor=page.next_cursor, ...)
```

### Pattern 2: Create Resource

```python
@router.post("", status_code=201)
async def create_issue(
    request: IssueCreateRequest,
    service: CreateIssueServiceDep,
    user_id: CurrentUserId,
) -> IssueResponse:
    result = await service.execute(CreateIssuePayload(..., reporter_id=user_id))
    return IssueResponse.from_issue(result.issue)
```

### Pattern 3: Streaming Response (SSE)

```python
@router.post("/chat")
async def chat(request: ChatRequest, agent: PilotSpaceAgentDep) -> StreamingResponse:
    async def event_generator():
        async for event in agent.stream(ChatInput(...)):
            yield f"data: {event.model_dump_json()}\n\n"
    return StreamingResponse(event_generator(), media_type="text/event-stream")
```

### Pattern 4: Update Resource

```python
@router.patch("/{id}")
async def update_issue(id: UUID, request: IssueUpdateRequest, service: UpdateIssueServiceDep) -> IssueResponse:
    result = await service.execute(UpdateIssuePayload(id=id, ...))
    return IssueResponse.from_issue(result.issue)
```

### Pattern 5: Delete Resource

```python
@router.delete("/{id}")
async def delete_issue(id: UUID, service: DeleteIssueServiceDep) -> DeleteResponse:
    await service.execute(DeleteIssuePayload(id=id, ...))
    return DeleteResponse(id=id)
```

---

## Common API Patterns

### Explicit Field Nulling

Distinguish "don't change" (null) vs "clear field" (explicit):

```python
class IssueUpdateRequest(BaseSchema):
    name: str | None = None              # null = don't update
    assignee_id: UUID | None = None
    clear_assignee: bool = False         # true = set to NULL
    clear_cycle: bool = False
```

### Nested Relations in Responses

Include both nested objects (for display) and foreign key IDs (for mutations):

```python
class IssueResponse(BaseSchema):
    id: UUID
    project: ProjectBriefSchema  # Display
    project_id: UUID             # For updates
    assignee: UserBriefSchema | None
    assignee_id: UUID | None
```

### Pagination Cursor Format

Cursors are base64-encoded and opaque (prevents client manipulation):

```
next_cursor = base64.b64encode("2024-02-10-p1.i.3".encode()).decode()
```

---

## Related Documentation

- **Parent API Layer**: [`../CLAUDE.md`](../CLAUDE.md)
- **Backend Architecture**: [`../../../../CLAUDE.md`](../../../../CLAUDE.md) (backend root)
- **Application Services**: [`../../application/CLAUDE.md`](../../application/CLAUDE.md)
- **Infrastructure/Repos**: [`../../infrastructure/CLAUDE.md`](../../infrastructure/CLAUDE.md)
