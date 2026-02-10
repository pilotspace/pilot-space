# MCP Tools System - Pilot Space AI Layer

**For AI layer overview, see parent [ai/CLAUDE.md](../CLAUDE.md)**

---

## Overview

The MCP (Model Context Protocol) Tools System provides 33 tools across 6 servers that enable PilotSpaceAgent to interact with the platform's data layer. All tools return operation payloads (never mutate directly) and enforce RLS workspace isolation at every level.

---

## Tool Servers Overview

| Server | Count | Purpose | Key Tools |
|--------|-------|---------|-----------|
| `note_server` | 9 | Note writing/mutation | write_to_note, update_note_block, extract_issues, create_issue_from_note, link_existing_issues, enhance_text, summarize_note, search_notes, create_note |
| `note_content_server` | 5 | Block-level operations | search_note_content, insert_block, remove_block, remove_content, replace_content |
| `issue_server` | 4 | Issue CRUD | get_issue, search_issues, create_issue, update_issue |
| `issue_relation_server` | 6 | Issue relations + state | link_issue_to_note, unlink_issue_from_note, link_issues, unlink_issues, add_sub_issue, transition_issue_state |
| `project_server` | 5 | Project management | get_project, search_projects, create_project, update_project, update_project_settings |
| `comment_server` | 4 | Comment management | create_comment, update_comment, search_comments, get_comments |
| **Total** | **33** | **All AI mutations** | **All return operation payloads** |

---

## Tool Categories by RLS Scope

### Note Tools (14 tools: 9 note_server + 5 note_content_server)

- **Scope**: Note + workspace
- **Operations**: Create, read, update, extract, enhance
- **Constraint**: No cross-note linking (note-to-note relationships not supported via tools)

### Issue Tools (10 tools: 4 CRUD in issue_server + 6 relations in issue_relation_server)

- **Scope**: Issue + workspace
- **Operations**: CRUD, state transition, note linking, issue linking, sub-issues
- **Constraint**: Cross-issue and issue-to-note relationships supported within workspace

### Project Tools (5 tools)

- **Scope**: Project + workspace
- **Operations**: CRUD, archiving
- **Constraint**: Contains issues; project deletion cascades

### Comment Tools (4 tools)

- **Scope**: Comment + parent (issue/note) + workspace
- **Operations**: CRUD
- **Constraint**: Always tied to parent entity (issue or note)

---

## Tool Registration & Discovery

### MCP Server Creation

Tools use the `@tool` decorator and return operation payloads (JSON with `status: pending_apply`):

```python
@tool("update_note_block", "Update or append block by ID")
def update_note_block(note_id: str, block_id: str, operation: str, content: str) -> str:
    resolved_note_id = _resolve_note_id({"note_id": note_id})
    return json.dumps({
        "status": "pending_apply",
        "note_id": resolved_note_id,
        "block_id": block_id,
        "operation": operation,
        "content": content,
    })
```

### Tool Aggregation

Server aggregates tools via `create_sdk_mcp_server()`:

```python
create_sdk_mcp_server(name="pilot-notes", tools=[...])
```

Exported tool names follow the `mcp__server__tool` format and are gathered in `pilotspace_agent.py` for the `allowed_tools` configuration (33 total across 6 servers).

---

## Tool Execution Flow

### Request to Payload to Transform to SSE

The complete flow from user intent to frontend update:

1. **User**: "Add a task to the note"
2. **PilotSpaceAgent.stream()**: Routes to `write_to_note` MCP tool
3. **Tool returns operation payload**:
   ```json
   {
     "status": "pending_apply",
     "note_id": "550e8400-e29b-41d4-a716-446655440000",
     "blocks": [{"block_id": "p1", "operation": "append", "content": "<p>New task</p>"}]
   }
   ```
4. **transform_sdk_message()**: Converts payload to SSE event:
   ```json
   {
     "type": "content_update",
     "note_id": "550e8400-e29b-41d4-a716-446655440000",
     "blocks": [{"block_id": "p1", "operation": "append", "content": "<p>New task</p>"}]
   }
   ```
5. **Frontend useContentUpdates hook**: Processes `content_update` event
6. **TipTap mutation**: Editor updates + optional API persist call

### Operation Payload Contract

All tools return JSON with one of two statuses:

| Status | Meaning | Next Step |
|--------|---------|-----------|
| `pending_apply` | Ready for frontend application | SSE `content_update` event emitted |
| `pending_approval` | Requires human approval (DD-003) | SSE `approval_request` event emitted |

---

## RLS Enforcement in Tools

Every MCP tool enforces workspace isolation through a 3-layer pattern:

### Layer 1: Context Retrieval

```python
workspace_id = get_workspace_context()
```

Retrieves the current workspace from the request context set by middleware.

### Layer 2: Explicit Repository Filter

```python
issue = await issue_repo.get(issue_id=issue_id, workspace_id=workspace_id)
```

All repository calls include explicit `workspace_id` filtering.

### Layer 3: PostgreSQL RLS Policies

Database-level enforcement via session variables (`app.current_workspace_id`) ensures no data leaks even if application-level checks are bypassed.

### RLS Enforcement Pattern

```python
async def issue_tool(issue_id: str) -> str:
    workspace_id = get_workspace_context()
    issue = await issue_repo.get(issue_id=UUID(issue_id), workspace_id=workspace_id)
    if not issue:
        raise PermissionError(f"Issue not found in workspace {workspace_id}")
    # Proceed with operation...
```

See [infrastructure/auth/CLAUDE.md](../../infrastructure/auth/CLAUDE.md) for full RLS architecture documentation.

---

## Approval Classification for Tools

Tools are classified by the PermissionHandler (DD-003):

| Category | Approval | Tool Examples |
|----------|----------|---------------|
| Non-destructive | Auto-execute | get_issue, search_issues, search_notes, get_project |
| Content creation | Configurable | create_issue, create_comment, extract_issues, write_to_note |
| Destructive | Always required | unlink_issue_from_note, unlink_issues |

---

## Adding a New MCP Tool

1. Create tool handler with `@tool` decorator in relevant server file (e.g., `mcp/note_server.py`)
2. Return operation payload: `{"status": "pending_apply", "note_id": "...", ...}`
3. Export tool name: `TOOL_NAMES = ["mcp__pilot-notes__new_tool"]`
4. Aggregate in `pilotspace_agent.py` ALL_TOOL_NAMES list
5. Add to PilotSpaceAgent system prompt (tool categories section)
6. Test: `pytest tests/ai/mcp/test_note_server.py`
7. Verify RLS: Add workspace scoping + explicit filter

See: [mcp/](../mcp/) for 6 existing server implementations.

---

## Common Pitfalls & Solutions

| Pitfall | Problem | Solution |
|---------|---------|----------|
| Tool not returning payload | SDK cannot transform to SSE | Return JSON `{"status": "pending_apply", ...}` |
| Missing RLS context | Cross-workspace data leak | Always call `get_workspace_context()` + explicit filter |
| Approval not awaited | Tool executes destructive action immediately | Return `{"status": "pending_approval"}` + wait for user |
| Blocking I/O in tools | Blocks event loop | Use `loop.run_in_executor()` for file I/O |
| Tool not registered | Agent cannot invoke tool | Add to ALL_TOOL_NAMES in `pilotspace_agent.py` |

---

## Key Files

| File | Purpose |
|------|---------|
| `note_server.py` | 9 note tools: write, update, extract, enhance, search |
| `note_content_server.py` | 5 block-level tools: insert, remove, replace, search |
| `issue_server.py` | 4 issue CRUD tools |
| `issue_relation_server.py` | 6 relation tools: link/unlink notes, link/unlink issues, sub-issues, state transition |
| `project_server.py` | 5 project management tools |
| `comment_server.py` | 4 comment CRUD tools |
| `registry.py` | Tool registry management and aggregation |

---

## Related Documentation

- **AI Layer Parent**: [ai/CLAUDE.md](../CLAUDE.md) - Orchestrator, skills, providers, sessions
- **Agents**: [agents/CLAUDE.md](../agents/CLAUDE.md) - PilotSpaceAgent, subagents
- **Providers**: [providers/CLAUDE.md](../providers/CLAUDE.md) - Provider routing, resilience, cost tracking
- **RLS Security**: [infrastructure/auth/CLAUDE.md](../../infrastructure/auth/CLAUDE.md) - RLS policies, enforcement patterns
- **Application Services**: [application/services/CLAUDE.md](../../application/services/CLAUDE.md) - CQRS-lite services called by tools
- **Design Decisions**: DD-088 (MCP tool registry), DD-003 (approval workflow)
- **Pilot Space Patterns**: `docs/dev-pattern/45-pilot-space-patterns.md` (AI agent patterns)
