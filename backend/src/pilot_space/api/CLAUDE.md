# API Layer Documentation - Pilot Space

**For backend architecture context, see `/backend/CLAUDE.md`**

---

## Quick Reference

### API Base Path

```
/api/v1/
```

### Middleware Pipeline

```
RequestContextMiddleware (extract headers)
  |
CORSMiddleware (allow origins)
  |
ExceptionHandler (RFC 7807)
  |
RateLimiter (1000 req/min, 100 req/min AI)
  |
AuthMiddleware (JWT validation)
  |
Router Endpoint
```

### Router Count: 20 Active

| Category | Routers | Endpoints |
|----------|---------|-----------|
| **Core Resources** | 7 | 35+ |
| **AI Features** | 10 | 40+ |
| **Support** | 3+ | 15+ |

### Key Constants

| Setting | Value |
|---------|-------|
| API version | v1 |
| Pagination default limit | 20 (1-100) |
| AI rate limit | 100 req/min (vs 1000 standard) |
| Max text field length | 10,000 chars |
| Issue name max | 255 chars |
| Token validation | Supabase JWT |

---

## Submodule Documentation

| Module | Doc | Covers |
|--------|-----|--------|
| **Router Details** | [`v1/CLAUDE.md`](v1/CLAUDE.md) | All 20 individual router endpoints, middleware deep-dives, 5 common router patterns with code, API patterns (field nulling, nested relations, cursors) |

---

## Architecture Overview

### Request Lifecycle

```
1. Client Request (HTTP/SSE)
   +-- Headers: Authorization: Bearer <jwt>, X-Workspace-ID: <uuid>

2. RequestContextMiddleware
   +-- Extract workspace_id, correlation_id from headers
   +-- Store in request.state

3. AuthMiddleware
   +-- Validate JWT token via SupabaseAuth
   +-- Extract user_id, workspace_ids from token payload
   +-- Skip for public routes (/health, /docs, /login)

4. Router Endpoint Handler
   +-- Dependency injection (services, repos, DB session)
   +-- Validate request schema (Pydantic v2)
   +-- Call service layer (CQRS-lite pattern)
   +-- Return response schema (camelCase JSON)

5. Exception Handler (middleware)
   +-- Convert Python exceptions to RFC 7807

6. Response
   +-- JSON (standard endpoints) or SSE (streaming endpoints)
```

### Key Components

**Location**: `/backend/src/pilot_space/api/`

```
api/
├── middleware/                    # Request processing pipeline
│   ├── error_handler.py           # RFC 7807 Problem Details
│   ├── auth_middleware.py         # JWT validation
│   ├── request_context.py         # Workspace/correlation ID extraction
│   ├── rate_limiter.py            # Rate limiting
│   └── cors.py                    # CORS configuration
├── v1/
│   ├── routers/                   # 20 domain routers
│   ├── schemas/                   # Pydantic v2 request/response models
│   ├── middleware/
│   │   └── ai_context.py
│   ├── streaming.py               # SSE event definitions
│   └── CLAUDE.md                  # Router details
└── utils/
   └── sse.py                     # SSE utility functions
```

---

## Authentication & Authorization

### JWT Token Validation

**Token Source**: Supabase Auth (GoTrue)

**Flow**: Client sends `Authorization: Bearer <jwt>` -> AuthMiddleware validates signature/expiry -> Extracts user_id, email, workspace_ids, role_in_workspace

**Token Claims**: sub (user_id), email, workspace_ids, role_in_workspace (dict), iat, exp

### Authorization Checks

**Workspace Membership**: Every endpoint queries WorkspaceMember to verify user belongs to workspace.

**Role-Based**: Some operations check role (owner/admin/member). Raise 403 if insufficient permissions.

---

## Router Overview

**Core Resources** (7): workspaces, workspace_members, workspace_invitations, projects, issues, workspace_notes, workspace_cycles

**AI Features** (10): ai_chat, ghost_text, ai_costs, ai_approvals, ai_configuration, ai_sessions, ai_extraction, ai_annotations, notes_ai, ai_context

**Support** (3+): auth, integrations, webhooks, homepage, skills, role_skills, mcp_tools, debug

**Individual router details with endpoint tables**: See [`v1/CLAUDE.md`](v1/CLAUDE.md)

---

## Dependency Injection Pattern (Updated 2026-02-10)

**Location**: `/backend/src/pilot_space/dependencies/` + `api/v1/dependencies.py`

**Architecture**: FastAPI + dependency-injector integration

### Session Management

**SessionDep**: Triggers ContextVar session context
```python
from pilot_space.dependencies.auth import SessionDep

async def handler(session: SessionDep):
    # SessionDep calls get_session() which sets ContextVar
    # Container providers can now access session via get_current_session()
```

### Service Injection

**Pattern**: Use type aliases from `api/v1/dependencies.py`
```python
from dependency_injector.wiring import inject
from pilot_space.api.v1.dependencies import CreateIssueServiceDep

@router.post("/issues")
@inject
async def create_issue(
    session: SessionDep,
    service: CreateIssueServiceDep,  # Auto-injected
):
    result = await service.execute(...)
```

### Repository Injection

**Pattern**: Use repository type aliases
```python
from pilot_space.api.v1.dependencies import ProjectRepositoryDep

@router.get("/projects")
@inject
async def list_projects(
    session: SessionDep,
    repo: ProjectRepositoryDep,  # Auto-injected
):
    projects = await repo.list_by_workspace(...)
```

### When to Use @inject

**Use @inject** only when endpoint parameters include:
- ServiceDep type aliases (CreateIssueServiceDep, etc.)
- RepositoryDep type aliases (ProjectRepositoryDep, etc.)

**Don't use @inject** when endpoint only uses:
- SessionDep, CurrentUser, WorkspaceId (standard FastAPI Depends)
- Query(), Path(), Body() (FastAPI parameter functions)

### Complete Type Alias List

**Services (35)**: See `api/v1/dependencies.py` lines 86-286
**Repositories (9)**: See `api/v1/dependencies.py` (after service imports)

### Testing Pattern

```python
from pilot_space.main import app
from pilot_space.container import Container

# Override service in tests
mock_service = Mock(spec=CreateIssueService)
app.dependency_overrides[Container.create_issue_service] = lambda: mock_service
```

---

## Error Handling

### RFC 7807 Problem Details

All errors return RFC 7807 format: `{"type": "...", "title": "...", "status": 400, "detail": "...", "instance": "..."}`

### Status Codes

| Code | Meaning | When to Use |
|------|---------|------------|
| 400 | Bad Request | Validation failures |
| 401 | Unauthorized | Missing/expired JWT |
| 403 | Forbidden | User not authorized for resource |
| 404 | Not Found | Resource doesn't exist |
| 422 | Unprocessable Entity | Pydantic validation errors (includes field details) |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Unhandled exceptions |

---

## Schema Design (Pydantic v2)

### Base Classes

All schemas inherit `BaseSchema` (ConfigDict: from_attributes=True, alias_generator=to_camel for camelCase JSON).

**Hierarchy**: BaseSchema -> TimestampSchema, EntitySchema, SoftDeleteSchema, PaginationParams, PaginatedResponse[T], ErrorResponse, DeleteResponse, BulkResponse[T]

### Request Schemas

Validate at API boundary with Field constraints:

```python
class IssueCreateRequest(BaseSchema):
    name: str = Field(..., min_length=1, max_length=255)
    priority: IssuePriority = IssuePriority.NONE
    project_id: UUID
```

### Response Schemas

Include factory method for ORM -> response mapping:

```python
class IssueResponse(BaseSchema):
    id: UUID
    name: str
    project: ProjectBriefSchema  # Nested

    @classmethod
    def from_issue(cls, issue: Issue) -> IssueResponse:
        return cls(id=issue.id, name=issue.name, ...)
```

---

## Example: Create Issue

**Request** (POST /api/v1/issues):

```json
{"name": "Fix login bug", "projectId": "...", "priority": "high", "enhanceWithAi": true}
```

**Response** (201):

```json
{"id": "...", "sequenceId": 42, "name": "Fix login bug", "project": {...}, "state": {...}}
```

---

## Related Documentation

- **Router Details (all 20 routers)**: [`v1/CLAUDE.md`](v1/CLAUDE.md)
- **Backend Architecture**: [`../../../../CLAUDE.md`](../../../../CLAUDE.md) (backend root)
- **Application Services**: [`../application/CLAUDE.md`](../application/CLAUDE.md)
- **Infrastructure/Repos**: [`../infrastructure/CLAUDE.md`](../infrastructure/CLAUDE.md)
- **Design Decisions**: `docs/DESIGN_DECISIONS.md`
