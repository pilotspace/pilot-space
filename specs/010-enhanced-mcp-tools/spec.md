# Enhanced MCP Tools for PilotSpaceAgent

**Version**: 2.0.0
**Status**: Draft
**Author**: TinDang
**Date**: 2026-02-06

---

## Executive Summary

This specification defines an enhanced set of MCP (Model Context Protocol) tools for the PilotSpaceAgent, expanding from 6 note tools to a **27-tool suite** covering Notes, Issues, Projects, and Comments. The design follows Claude Agent SDK best practices and aligns with Pilot Space's CQRS-lite architecture.

**Key simplification from v1.0**: Reduced from 42 to 27 tools by merging thin wrapper tools into parent CRUD operations, deferring TipTap formatting tools to P2, and removing delete operations (destructive deletions handled via frontend UI, not AI agent).

---

## Business Context

### Problem Statement

The current Pilot Space tool implementation has gaps:

1. **Note Tools (6 existing)**: Limited to update, enhance, summarize, extract issues, create issue, link existing issues
2. **Database Tools (9 existing)**: Read-only context gathering, no CRUD mutations
3. **No Content-Level Operations**: Cannot search/modify content at regex/block level
4. **No Issue Mutation Tools**: Missing update, link/unlink operations
5. **No Project Tools**: Missing CRUD and relationship management
6. **No Comment Tools**: Missing discussion/comment operations

### Solution

Implement a 27-tool suite organized into 4 categories with consistent patterns inspired by Claude Agent SDK built-in tools.

### Success Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| Tool coverage | 27 tools across 4 categories | Tool registry count |
| Tool latency (p95) | <500ms for CRUD, <2s for search | APM metrics |
| Test coverage | >80% per tool | pytest-cov |
| Approval flow compliance | 100% for REQUIRE/ALWAYS actions | Audit log |
| RLS enforcement | 100% workspace isolation | Integration tests |

---

## Architecture Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| AD-001 | Reuse existing ThreadedDiscussion + DiscussionComment models | No migration needed; existing data intact; Comment tools wrap existing models |
| AD-002 | Dynamic tool search via Claude SDK ToolSearch | 27 tools still benefit from on-demand loading; keeps 5-10 tools active |
| AD-003 | Immediate replacement of overlapping tools | Remove deprecated tools when new tools ship; no transition period |
| AD-004 | Single-note scope for content tools | Each content tool targets one note per call; simpler approval/rollback |
| AD-005 | Separate `issue_links` table for issue relationships | Clean separation from note links; optimized indexes for dependency graph queries |
| AD-006 | Shared `resolve_entity_id()` utility | Single resolver accepts UUID or identifier (PROJ-123); all tools use it |
| AD-007 | Include tool-to-skill mapping in spec | Formalize which tools get corresponding `/slash-command` skills |
| AD-008 | No delete tools for AI agent | Destructive deletions via frontend UI only; reduces risk surface; aligns with DD-003 |
| AD-009 | Merge thin attribute tools into parent CRUD | Labels, project association handled via `update_issue`/`update_note` params; fewer tools = simpler agent prompt |
| AD-010 | Defer TipTap formatting tools to P2 | `convert_block_type`, `apply_marks`, `insert_inline_node` are formatting ops; agent uses markdown in `replace_content` instead |

---

## Claude Agent SDK Tool Design Patterns

### Patterns Learned from Built-in Tools

#### 1. Text Editor Tool Pattern
- **Commands**: `view`, `create`, `str_replace`, `insert`, `undo_edit`
- **Design**: Single tool with `command` parameter dispatching to operations
- **Error handling**: Detailed error messages with suggestions

#### 2. Tool Definition Best Practices (from SDK docs)
1. **Names**: Regex pattern `^[a-zA-Z0-9_-]{1,64}$`
2. **Descriptions**: 3-4+ sentences: what it does, when to use, parameter effects, caveats
3. **Input Schema**: JSON Schema with clear property descriptions
4. **Examples**: Include `input_examples` for ambiguous parameters

---

## Tool Categories Overview

### Category Summary

| Category | Tool Count | Approval Level | Description |
|----------|------------|----------------|-------------|
| Note | 8 | Mixed | Note CRUD + content manipulation |
| Issue | 10 | Mixed | Issue CRUD + relationships + state |
| Project | 5 | Mixed | Project CRUD + settings |
| Comment | 4 | Mixed | Comment CRUD + search |

### Approval Levels (DD-003)

| Level | Tools | Behavior |
|-------|-------|----------|
| AUTO_EXECUTE | Search, Read, Get, Add Comment | Execute immediately, notify user |
| REQUIRE_APPROVAL | Create, Update, Link, Transition | Request approval, configurable by user |
| ALWAYS_REQUIRE | Unlink | Always require explicit approval |

### Design Principle: No Delete Tools (AD-008)

Destructive deletions (delete note, issue, project, comment) are **excluded** from the AI agent tool suite. Rationale:
- DD-003 requires ALWAYS_REQUIRE approval for destructive actions — adds friction without value for AI workflows
- Users delete via UI with undo/trash support; AI agent has no undo mechanism
- Reduces attack surface and accidental data loss risk
- AI agent focuses on creation, enhancement, and organization — not destruction

---

## Tool Specifications

### Representative Example (all tools follow this pattern)

```python
@register_tool("issue")
async def get_issue(
    issue_id: str,
    ctx: ToolContext,
    include_notes: bool = True,
    include_sub_issues: bool = True,
    include_activity: bool = False,
    include_ai_context: bool = False,
) -> dict[str, Any]:
    """Get comprehensive details for a single issue.

    Use this tool to retrieve full issue information including
    relationships, activity history, and AI-generated context.

    Prefer this over get_issue_context when you need all details
    for a specific known issue.

    Args:
        issue_id: UUID or identifier (e.g., "PILOT-123") of the issue
        ctx: Tool context
        include_notes: Include linked notes (default True)
        include_sub_issues: Include child issues (default True)
        include_activity: Include activity log (default False)
        include_ai_context: Include AI context if available (default False)

    Returns:
        Dict with full issue details and requested relationships
    """
```

### Note Tools (8 tools)

#### Existing Tools (Retained)

| Tool | Operation | Approval |
|------|-----------|----------|
| `update_note_block` | Replace/append block content | REQUIRE_APPROVAL |
| `enhance_text` | Improve text clarity | AUTO_EXECUTE |
| `extract_issues` | Create issues from blocks | REQUIRE_APPROVAL |
| `create_issue_from_note` | Create single linked issue | REQUIRE_APPROVAL |
| `link_existing_issues` | Search and link issues | REQUIRE_APPROVAL |
| `write_to_note` | Append markdown to note | REQUIRE_APPROVAL |

> **Removed**: `summarize_note` — redundant. Note content is injected into `<note_context>` by `build_contextual_message()`.

#### New Note Tools

| ID | Tool | Key Params | Returns | Approval |
|----|------|-----------|---------|----------|
| NT-001 | `search_notes` | query, project_id?, limit=20, include_content? | {notes[], total} | AUTO_EXECUTE |
| NT-002 | `create_note` | title, content_markdown?, project_id?, template_id? | approval payload | REQUIRE_APPROVAL |
| NT-003 | `update_note` | note_id, title?, is_pinned?, project_id? | approval payload | REQUIRE_APPROVAL |
| NT-004 | `search_note_content` | note_id, pattern, regex?, case_sensitive? | {matches[], total_matches} | AUTO_EXECUTE |
| NT-005 | `insert_block` | note_id, content_markdown, after_block_id?, before_block_id? | operation payload with new block IDs | REQUIRE_APPROVAL |
| NT-006 | `remove_block` | note_id, block_id | operation payload | REQUIRE_APPROVAL |
| NT-007 | `remove_content` | note_id, pattern, regex?, block_ids? | {affected_blocks[]} | REQUIRE_APPROVAL |
| NT-008 | `replace_content` | note_id, old_pattern, new_content, regex?, block_ids?, replace_all? | {affected_blocks[], replacements_count, preview} | REQUIRE_APPROVAL |

**Notes**:
- All content tools operate on a single note per call (AD-004). Agent loops for multi-note.
- `update_note` absorbs project association (was PR-008/PR-009 in v1.0) via `project_id` param (set to null to unlink) (AD-009).
- TipTap formatting tools (`convert_block_type`, `apply_marks`, `insert_inline_node`) deferred to P2 (AD-010). Use `replace_content` with markdown for formatting.

### Issue Tools (10 tools)

| ID | Tool | Key Params | Returns | Approval |
|----|------|-----------|---------|----------|
| IS-001 | `get_issue` | issue_id, include_notes?, include_sub_issues?, include_links?, include_activity?, include_ai_context? | full issue details + relationships | AUTO_EXECUTE |
| IS-002 | `search_issues` | query, project_id?, state_group?, priority?, assignee_id?, label_ids?, limit=20 | matching issues list | AUTO_EXECUTE |
| IS-003 | `create_issue` | project_id, title, description?, priority?, state_id?, assignee_id?, label_ids?, parent_id?, estimate_points?, target_date? | approval payload | REQUIRE_APPROVAL |
| IS-004 | `update_issue` | issue_id, title?, description?, priority?, assignee_id?, estimate_points?, start_date?, target_date?, add_label_ids?, remove_label_ids? | approval payload with change diff | REQUIRE_APPROVAL |
| IS-005 | `link_issue_to_note` | issue_id, note_id, link_type=referenced, block_id? | operation payload | REQUIRE_APPROVAL |
| IS-006 | `unlink_issue_from_note` | issue_id, note_id | approval request | ALWAYS_REQUIRE |
| IS-007 | `link_issues` | source_issue_id, target_issue_id, link_type (blocks/blocked_by/duplicates/related) | operation payload | REQUIRE_APPROVAL |
| IS-008 | `unlink_issues` | source_issue_id, target_issue_id | approval request | ALWAYS_REQUIRE |
| IS-009 | `add_sub_issue` | parent_issue_id, child_issue_id | operation payload | REQUIRE_APPROVAL |
| IS-010 | `transition_issue_state` | issue_id, target_state_id, comment? | operation payload with state change + activity | REQUIRE_APPROVAL |

**Notes**:
- `update_issue` now absorbs label operations via `add_label_ids` / `remove_label_ids` params (AD-009). No separate `add_label`/`remove_label` tools.
- Issue link types: blocks, blocked_by, duplicates, related. Stored in new `issue_links` table (AD-005).
- `get_linked_issues` absorbed into `get_issue` via `include_links` param — returns blocks/blocked_by/duplicates/related relationships. For transitive dependency chain, use `IssueLinkRepository.find_dependency_chain()` (BFS).
- State changes must go through `transition_issue_state` (IS-010) for proper validation + activity logging. `update_issue` does NOT accept `state_id`.

### Project Tools (5 tools)

| ID | Tool | Key Params | Returns | Approval |
|----|------|-----------|---------|----------|
| PR-001 | `get_project` | project_id, include_stats?, include_recent_issues? | project details + labels/states/stats | AUTO_EXECUTE |
| PR-002 | `search_projects` | query, limit=20 | matching projects list | AUTO_EXECUTE |
| PR-003 | `create_project` | name, identifier (2-10 uppercase), description?, lead_id?, icon? | approval payload | REQUIRE_APPROVAL |
| PR-004 | `update_project` | project_id, name?, description?, lead_id?, icon? | approval payload with diff | REQUIRE_APPROVAL |
| PR-005 | `update_project_settings` | project_id, settings (JSONB merge) | approval payload with settings diff | REQUIRE_APPROVAL |

**Notes**:
- Issue-project transfer handled via `update_issue` (change `project_id` field). No separate `add_issues_to_project`/`remove_issues_from_project` tools (AD-009).
- Note-project association handled via `update_note` (change `project_id` field). No separate `link_project_to_note`/`unlink_project_from_note` tools (AD-009).
- Identifier cannot be changed after creation.

### Comment Tools (5 tools)

> **AD-001**: Comment tools reuse existing `ThreadedDiscussion` + `DiscussionComment` models.

| ID | Tool | Key Params | Returns | Approval |
|----|------|-----------|---------|----------|
| CM-001 | `create_comment` | target_type (issue/note/discussion), target_id, content, parent_comment_id? | operation payload | AUTO_EXECUTE |
| CM-002 | `update_comment` | comment_id, content | approval payload | REQUIRE_APPROVAL |
| CM-003 | `search_comments` | query, target_type?, target_id?, author_id?, limit=20 | matching comments list | AUTO_EXECUTE |
| CM-004 | `get_comments` | target_type, target_id, include_replies?, limit=50 | threaded comment list | AUTO_EXECUTE |

**Notes**:
- `create_comment` is AUTO_EXECUTE because comments are non-destructive additions.
- `update_comment` requires approval since it modifies existing content.
- `get_linked_issues` removed as standalone tool — absorbed into `get_issue` (IS-001) via `include_links` param.
- Reactions deferred — not core AI agent functionality.

---

## Tool Registration Architecture

### Registry Enhancement

```python
_TOOL_CATEGORIES: dict[str, list[str]] = {
    "note": [],           # Note CRUD + content tools
    "issue": [],          # Issue CRUD + relationships + state
    "project": [],        # Project CRUD + settings
    "comment": [],        # Comment operations
    "database": [],       # Legacy read-only context (retained)
    "github": [],         # GitHub integration (retained)
    "search": [],         # Semantic/text search (retained)
}
```

### Approval Handler Integration

```python
class ApprovalLevel(str, Enum):
    AUTO_EXECUTE = "auto_execute"
    REQUIRE_APPROVAL = "require_approval"
    ALWAYS_REQUIRE = "always_require"

@dataclass
class ToolResult:
    tool: str
    operation: str
    status: str  # "pending_apply" | "approval_required" | "executed"
    approval_level: ApprovalLevel
    payload: dict[str, Any]
    preview: dict[str, Any] | None = None
```

### SSE Event Flow

```
AUTO_EXECUTE:
  ToolResult(status="pending_apply") → Apply → SSE(content_update)

REQUIRE_APPROVAL:
  ToolResult(status="approval_required") → SSE(approval_request) →
  User Approval → Apply → SSE(content_update)

ALWAYS_REQUIRE:
  Same as REQUIRE_APPROVAL, but user cannot disable
```

---

## Integration with PilotSpaceAgent

### Tool Selection per Agent

```python
# PilotSpaceAgent (orchestrator) — all 27 tools
PILOTSPACE_TOOLS = ToolRegistry.get_tools(
    categories=["note", "issue", "project", "comment", "search"]
)

# PRReviewAgent (subagent) — issue + comment + github
PRREVIEW_TOOLS = ToolRegistry.get_tools(
    categories=["issue", "comment", "github"]
)

# AIContextAgent (subagent) — read-only
CONTEXT_TOOLS = ToolRegistry.get_tools(
    categories=["database", "search"]
)
```

### Dynamic Tool Search (AD-002)

27 tools generate ~5K tokens in tool definitions. ToolSearch loads tools on-demand:

1. Agent starts with tool index (names + 1-line summaries) in context (~300 tokens)
2. When user intent matches a tool, SDK loads full tool definition dynamically
3. Active tools rotate based on conversation context (LRU eviction, max 10)
4. Category hints: "I want to edit note content" loads `note` category tools

---

## Shared Utilities

### Entity Identifier Resolver (AD-006)

All tools accepting `issue_id`, `project_id`, or `note_id` use a shared resolver:

```python
async def resolve_entity_id(
    entity_type: str,          # "issue", "project", or "note"
    id_or_identifier: str,     # UUID or "PILOT-123" or "PILOT"
    ctx: ToolContext,
) -> tuple[uuid.UUID | None, str | None]:
    """Resolve UUID or human-readable identifier to entity UUID.

    Returns (resolved_uuid, None) on success.
    Returns (None, error_message) on failure.
    """
```

---

## Tool Deprecation Plan (AD-003)

### Immediately Replaced Tools

| Old Tool | File | Replaced By |
|----------|------|-------------|
| `get_issue_context` | `database_tools.py` | `get_issue` (IS-001) |
| `get_note_content` | `database_tools.py` | `<note_context>` + `search_note_content` (NT-004) |
| `get_project_context` | `database_tools.py` | `get_project` (PR-001) |
| `find_similar_issues` | `database_tools.py` | `search_issues` (IS-002) |
| `create_issue` | `database_tools.py` | `create_issue` (IS-003) |
| `get_page_content` | `database_tools.py` | Removed (placeholder; no model) |
| `summarize_note` | `note_server.py` | Removed (redundant) |

### Retained Tools

| Tool | File | Reason |
|------|------|--------|
| `get_workspace_members` | `database_tools.py` | No replacement; needed by agents |
| `get_cycle_context` | `database_tools.py` | Cycle tools out of scope |
| `create_note_annotation` | `database_tools.py` | Unique functionality |
| `semantic_search` | `search_tools.py` | Complementary (embedding-based) |
| `search_codebase` | `search_tools.py` | GitHub domain; no overlap |
| All GitHub tools | `github_tools.py` | Different domain |

---

## Tool-to-Skill Mapping (AD-007)

### Slash Command Skills

| Slash Command | Tool | Skill Purpose |
|---------------|------|---------------|
| `/search-notes` | `search_notes` (NT-001) | Quick note search from chat |
| `/create-note` | `create_note` (NT-002) | Create note with AI-suggested structure |
| `/find-replace` | `replace_content` (NT-008) | Find and replace across note content |
| `/search-issues` | `search_issues` (IS-002) | Search issues with natural language |
| `/create-issue` | `create_issue` (IS-003) | Create issue with AI enhancement |
| `/link-issues` | `link_issues` (IS-007) | Establish issue dependencies |
| `/extract-issues` | `extract_issues` (existing) | Retained: extract from note content |
| `/create-project` | `create_project` (PR-003) | Create project with defaults |
| `/add-comment` | `create_comment` (CM-001) | Add comment to current context |

### Multi-Tool Skills (Orchestrator Logic)

| Skill | Tools Used |
|-------|-----------|
| `/enhance-issue` | `get_issue` + `update_issue` |
| `/improve-writing` | `search_note_content` + `replace_content` |
| `/decompose-tasks` | `get_issue` + `create_issue` (loop) |
| `/generate-diagram` | `get_project` + `get_issue` (include_links) |

---

## Data Model Dependencies

### Required Model Changes

| Model | Change | Description | Decision |
|-------|--------|-------------|----------|
| `Note` | None | Existing model supports all operations | - |
| `Issue` | None | Existing model supports all operations | - |
| `Project` | None | Existing model supports all operations | - |
| `ThreadedDiscussion` | Extend | Add `target_type` enum for issue/note scoping | AD-001 |
| `DiscussionComment` | Extend | Add `reactions` JSONB, `edited_at` column | AD-001 |
| `IssueLink` | **New** | Issue-to-issue relationships | AD-005 |
| `NoteIssueLink` | Extend | Add `block_id` column for precise linking | - |

> Full model definitions (IssueLink, ThreadedDiscussion/DiscussionComment extensions) are in `plan.md` Data Model section.

---

## Testing Strategy

### Unit Tests

Each tool requires:
1. Happy path test
2. Validation failure test (invalid inputs)
3. Authorization failure test (RLS)
4. Approval flow test (for REQUIRE_APPROVAL tools)

### Integration Tests

1. **Cross-tool workflows**: Create note → Extract issue → Link to project
2. **Approval flow**: Tool call → Approval request → User action → Completion
3. **SSE event verification**: Verify correct events for each operation type

---

## Implementation Phases

> **Note**: Phases map directly to `tasks.md` phase structure.

### Phase 1: Foundation (T001-T005)

| Task | Scope | Priority |
|------|-------|----------|
| Tool architecture decision | Choose registration pattern | P0 |
| ToolRegistry + ApprovalLevel | Infrastructure enums + resolver | P0 |
| IssueLink model + migration | Data model extensions | P0 |

### Phase 2: Note Tools (T006-T009)

| Task | Tools | Priority |
|------|-------|----------|
| Note CRUD + Content | NT-001 to NT-008 | P0 |
| SSE handlers for content ops | AIUpdateService extensions | P0 |

### Phase 3: Issue Tools (T010-T012)

| Task | Tools | Priority |
|------|-------|----------|
| Issue CRUD + Relations + State | IS-001 to IS-010 | P0 |

### Phase 4: Project Tools (T013-T014)

| Task | Tools | Priority |
|------|-------|----------|
| Project CRUD + Settings | PR-001 to PR-005 | P1 |

### Phase 5: Comment Tools (T015-T016)

| Task | Tools | Priority |
|------|-------|----------|
| Comment CRUD + Search | CM-001 to CM-004 | P1 |

### Phase 6: Integration + Cleanup (T017-T023)

| Task | Scope | Priority |
|------|-------|----------|
| SSE events + PermissionHandler | Entity event pipeline | P1 |
| Agent registration + prompts | PilotSpaceAgent config | P1 |
| Tool deprecation + skill YAMLs | Cleanup | P1 |

### Deferred (P2 — AD-010)

| Task | Tools | Priority |
|------|-------|----------|
| TipTap formatting tools | convert_block_type, apply_marks, insert_inline_node | P2 |

---

## Tool Summary Table

| ID | Tool | Category | Approval |
|----|------|----------|----------|
| NT-001 | search_notes | note | AUTO |
| NT-002 | create_note | note | REQUIRE |
| NT-003 | update_note | note | REQUIRE |
| NT-004 | search_note_content | note | AUTO |
| NT-005 | insert_block | note | REQUIRE |
| NT-006 | remove_block | note | REQUIRE |
| NT-007 | remove_content | note | REQUIRE |
| NT-008 | replace_content | note | REQUIRE |
| IS-001 | get_issue | issue | AUTO |
| IS-002 | search_issues | issue | AUTO |
| IS-003 | create_issue | issue | REQUIRE |
| IS-004 | update_issue | issue | REQUIRE |
| IS-005 | link_issue_to_note | issue | REQUIRE |
| IS-006 | unlink_issue_from_note | issue | ALWAYS |
| IS-007 | link_issues | issue | REQUIRE |
| IS-008 | unlink_issues | issue | ALWAYS |
| IS-009 | add_sub_issue | issue | REQUIRE |
| IS-010 | transition_issue_state | issue | REQUIRE |
| PR-001 | get_project | project | AUTO |
| PR-002 | search_projects | project | AUTO |
| PR-003 | create_project | project | REQUIRE |
| PR-004 | update_project | project | REQUIRE |
| PR-005 | update_project_settings | project | REQUIRE |
| CM-001 | create_comment | comment | AUTO |
| CM-002 | update_comment | comment | REQUIRE |
| CM-003 | search_comments | comment | AUTO |
| CM-004 | get_comments | comment | AUTO |

**Totals**: 27 tools (AUTO: 9, REQUIRE: 16, ALWAYS: 2)

---

## References

- [Claude Agent SDK Tool Use Overview](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview.md)
- [Claude Agent SDK Custom Tools](https://platform.claude.com/docs/en/agent-sdk/custom-tools.md)
- [Text Editor Tool Pattern](https://platform.claude.com/docs/en/agents-and-tools/tool-use/text-editor-tool.md)
- Pilot Space DD-003: Human-in-the-Loop Approval
- Pilot Space DD-086: Centralized Agent Architecture
- Pilot Space DD-087: Skill System
- Pilot Space DD-088: MCP Tool Registry
