# Tasks: Enhanced MCP Tools

**Feature**: Enhanced MCP Tools for PilotSpaceAgent
**Branch**: `010-enhanced-mcp-tools`
**Created**: 2026-02-06
**Source**: `specs/010-enhanced-mcp-tools/`
**Author**: Tin Dang

---

## Phase 1: Foundation

### Tool Architecture Decision

- [ ] T001 Decide and document tool registration pattern for new tools
  - **Context**: Codebase has TWO tool systems:
    1. **SDK MCP Server** (`ai/mcp/note_server.py`): `create_sdk_mcp_server()` → tools push SSE to `event_queue` directly
    2. **ToolRegistry** (`ai/tools/mcp_server.py`): `@register_tool()` → tools return dicts → transformed by `transform_tool_result()`
  - **Decision needed**: Which pattern for new issue/project/comment tools?
  - **Output**: Architecture decision documented in spec.md (next available AD number)

### Infrastructure

- [ ] T002 Extend ToolRegistry with new categories and ApprovalLevel enum in `mcp_server.py`
  - Add categories: issue, project, comment
  - Add `ApprovalLevel` enum (auto_execute, require_approval, always_require)
  - Add `ToolResult` dataclass with approval_level field
  - Write unit tests in `test_tool_registry.py` for registry + categories

- [ ] T003 Create shared `resolve_entity_id()` utility in `entity_resolver.py` with unit tests
  - Accept UUID string or identifier (PILOT-123, PILOT)
  - Workspace-scoped queries (RLS enforcement)
  - Return tuple[UUID | None, str | None]
  - Tests: UUID passthrough, PROJ-NNN resolution, not-found, invalid format

### Data Model

- [ ] T004 Create IssueLink model + extend ThreadedDiscussion/DiscussionComment/NoteIssueLink + migration
  - IssueLink: source_issue_id, target_issue_id, link_type enum, unique constraint, no self-links
  - ThreadedDiscussion: add target_type (String(20)), target_id (UUID nullable)
  - DiscussionComment: add reactions (JSONB, P2 consumer), edited_at (DateTime)
  - NoteIssueLink: add block_id (String, nullable) for precise block-level linking
  - Export IssueLink in models `__init__.py`
  - Run `alembic revision --autogenerate`

- [ ] T005 Create IssueLinkRepository extending BaseRepository[IssueLink]
  - `find_by_source()`, `find_by_target()`, `find_all_for_issue()`, `find_dependency_chain()` (BFS)

**Checkpoint**: Foundation complete. Architecture decided, resolver works, IssueLink model created, migration applied.

---

## Phase 2: Note Tools (NT-001 to NT-008)

- [ ] T006 Write unit tests for all note tools in `test_note_tools.py`
  - CRUD: search_notes, create_note, update_note (with project_id absorb)
  - Content: search_note_content, insert_block, remove_block, remove_content, replace_content

- [ ] T007 Implement note CRUD tools (NT-001 to NT-003) in `note_tools.py`
  - search_notes: ILIKE on title, project_id filter, AUTO_EXECUTE
  - create_note: title + optional markdown/template, REQUIRE_APPROVAL
  - update_note: partial update (title, is_pinned, project_id), REQUIRE_APPROVAL

- [ ] T008 Implement note content tools (NT-004 to NT-008) in `note_content_tools.py`
  - search_note_content: TipTap JSON → text → regex/text match, AUTO_EXECUTE
  - insert_block: after/before positioning, markdown → TipTap, REQUIRE_APPROVAL
  - remove_block: by block_id, REQUIRE_APPROVAL
  - remove_content: pattern match removal, REQUIRE_APPROVAL
  - replace_content: find/replace with regex capture groups, REQUIRE_APPROVAL

- [ ] T009 Extend NoteAIUpdateService + SSE handlers for new content operations
  - Add AIUpdateOperation enum values: INSERT_BLOCK, REMOVE_BLOCK, REMOVE_CONTENT, REPLACE_CONTENT
  - Implement handlers in ai_update_service.py
  - Add emit_*_event() functions in pilotspace_note_helpers.py
  - Register handlers in operation_handlers dict
  - Write unit tests for SSE event format + operation routing

**Checkpoint**: Note tools complete. 8 new tools + SSE pipeline functional.

---

## Phase 3: Issue Tools (IS-001 to IS-010)

- [ ] T010 Write unit tests for all issue tools in `test_issue_tools.py`
  - CRUD: get_issue (UUID + identifier), search_issues (filters), create_issue, update_issue (with label absorb)
  - Relations: link/unlink_issue_to_note, link/unlink_issues, add_sub_issue (cycle detection)
  - State: transition_issue_state (validation + activity)

- [ ] T011 Implement issue read + CRUD tools (IS-001 to IS-004) in `issue_tools.py`
  - get_issue: resolve_entity_id + eager-load, AUTO_EXECUTE
  - search_issues: compound WHERE + filters, AUTO_EXECUTE
  - create_issue: approval payload, sequence_id, default state, REQUIRE_APPROVAL
  - update_issue: partial update + add_label_ids/remove_label_ids, REQUIRE_APPROVAL

- [ ] T012 Implement issue relationship + state tools (IS-005 to IS-010) in `issue_tools.py`
  - link_issue_to_note: NoteIssueLink creation, REQUIRE_APPROVAL
  - unlink_issue_from_note: NoteIssueLink removal, ALWAYS_REQUIRE
  - link_issues: IssueLink creation via repository, REQUIRE_APPROVAL
  - unlink_issues: IssueLink removal, ALWAYS_REQUIRE
  - add_sub_issue: parent_id + cycle check, REQUIRE_APPROVAL
  - transition_issue_state: state validation + Activity record, REQUIRE_APPROVAL

**Checkpoint**: Issue tools complete. 10 tools functional.

---

## Phase 4: Project Tools (PR-001 to PR-005)

- [ ] T013 Write unit tests for project tools in `test_project_tools.py`
  - get_project, search_projects, create_project (identifier validation), update_project, update_project_settings

- [ ] T014 Implement all project tools in `project_tools.py`
  - get_project: resolve_entity_id + stats, AUTO_EXECUTE
  - search_projects: ILIKE on name/identifier, AUTO_EXECUTE
  - create_project: identifier validation + default states, REQUIRE_APPROVAL
  - update_project: partial update (identifier immutable), REQUIRE_APPROVAL
  - update_project_settings: JSONB merge, REQUIRE_APPROVAL

**Checkpoint**: Project tools complete. 5 tools functional.

---

## Phase 5: Comment Tools (CM-001 to CM-004)

- [ ] T015 Write unit tests for comment tools in `test_comment_tools.py`
  - create_comment (target types, threading), update_comment (edited_at, author check), search_comments, get_comments (threaded)

- [ ] T016 Implement all comment tools in `comment_tools.py`
  - create_comment: resolve target → ThreadedDiscussion → DiscussionComment, AUTO_EXECUTE
  - update_comment: content update + edited_at, REQUIRE_APPROVAL
  - search_comments: ILIKE on content + filters, AUTO_EXECUTE
  - get_comments: threaded structure query, AUTO_EXECUTE

**Checkpoint**: Comment tools complete. 4 tools functional.

---

## Phase 6: Integration + Cleanup

- [ ] T017 Add SSE events + PermissionHandler for issue/project/comment tools
  - Define SSE event types: issue_created, issue_updated, issue_linked, project_created, project_updated, comment_created
  - Add `transform_entity_tool_result()` for non-note pending_apply results
  - Update ACTION_CLASSIFICATIONS with all 27 tool action names
  - Write unit tests for event format + permission classification

- [ ] T018 Register new tools in PilotSpaceAgent + update agent prompt
  - Register tool servers per T001 architecture decision
  - Update allowed_tools, PILOTSPACE_TOOLS, PRREVIEW_TOOLS, CONTEXT_TOOLS
  - Configure ToolSearch with max_active_tools=10
  - Update system prompt: category-based guidance, approval tier hints, entity resolution hint

- [ ] T019 Remove deprecated tools + update registry
  - database_tools.py: Remove get_issue_context, get_note_content, get_project_context, find_similar_issues, create_issue, get_page_content
  - note_server.py: Remove summarize_note + update TOOL_NAMES
  - Update _TOOL_CATEGORIES to remove deprecated names

- [ ] T020 Remove note file sync layer
  - Remove `note_space_sync.py` (sync_note_to_space, sync_space_to_note, etc.)
  - Remove `_sync_note_if_present()` call from pilotspace_agent.py
  - Keep `build_contextual_message()` for `<note_context>` injection
  - Update/remove tests referencing note_space_sync

- [ ] T021 Create skill YAML files in `.claude/skills/`
  - manage-issues.yml, manage-projects.yml, manage-comments.yml, edit-note-content.yml
  - Each: frontmatter with triggers, description, tool_names list

- [ ] T022 Write cross-tool integration tests in `test_mcp_tool_chains.py`
  - Create note → Extract issues → Link to project
  - Search issues → Link dependencies → Get issue (include_links)
  - Create comment → Search comments
  - RLS isolation (workspace A cannot see workspace B)

- [ ] T023 Run quality gates + verify file sizes
  - `uv run pyright && uv run ruff check && uv run pytest --cov=.`
  - Verify all tool files under 700 lines
  - Fill coverage gaps to >80% per tool file

**Checkpoint**: Feature complete. 27 tools registered. SSE pipeline handles all operations. Quality gates pass. >80% coverage.

---

## Dependencies

### Phase Order

```text
Phase 1 (Foundation) → Phase 2-5 (Tool Categories) → Phase 6 (Integration)
```

**Critical**: T001 (tool architecture decision) MUST complete before any implementation task.

### Category Independence

- Phase 2 (Note) and Phase 3 (Issue) can run in parallel after Foundation
- Phase 4 (Project) can run in parallel with Phase 2-3 (uses resolve_entity_id only)
- Phase 5 (Comment) depends on Phase 1 (ThreadedDiscussion extensions + migration)
- Phase 6 (Integration) depends on all Phases 2-5

### Within Each Phase

```text
Tests (write first) → Implementation → SSE/Service Integration → Checkpoint
```

### Cross-Phase Dependencies

| Task | Depends On | Reason |
|------|-----------|--------|
| T009 (AIUpdateService) | T007-T008 (note tools) | Handlers match tool operations |
| T017 (entity SSE) | T011-T016 (all entity tools) | Needs operation definitions |
| T018 (agent registration) | T001 (arch decision) | Depends on tool registration pattern choice |
| T020 (note sync removal) | T007-T009 (note tools + SSE) | Custom tools must work first |
| T021 (skill YAMLs) | T019 (deprecation) | Needs final tool name list |

---

## Summary

| Phase | Tasks | New Files | Modified Files |
|-------|-------|-----------|----------------|
| Phase 1: Foundation | T001-T005 | 3 new | 4 modified |
| Phase 2: Note Tools | T006-T009 | 2 new (tests + content_tools) | 2 modified (note_tools, AIUpdateService) |
| Phase 3: Issue Tools | T010-T012 | 2 new (tests + tools) | - |
| Phase 4: Project Tools | T013-T014 | 2 new (tests + tools) | - |
| Phase 5: Comment Tools | T015-T016 | 2 new (tests + tools) | - |
| Phase 6: Integration | T017-T023 | 2 new (integration tests, skills) | 6+ modified + 1 removed |
| **Total** | **23 tasks** | **13 new files** | **12+ modified, 1 removed** |
