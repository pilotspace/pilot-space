# Requirements Checklist - Enhanced MCP Tools

## Functional Requirements

### Note Tools (8 tools)

#### NT-001: search_notes
- [ ] FR-NT-001.1: Search by query text in title and content
- [ ] FR-NT-001.2: Filter by workspace_id (defaults to context)
- [ ] FR-NT-001.3: Filter by project_id
- [ ] FR-NT-001.4: Configurable limit (max 100)
- [ ] FR-NT-001.5: Optional content preview in results
- [ ] FR-NT-001.6: RLS enforcement via workspace_id

#### NT-002: create_note
- [ ] FR-NT-002.1: Create with title (required, 1-255 chars)
- [ ] FR-NT-002.2: Optional markdown content converted to TipTap JSON
- [ ] FR-NT-002.3: Optional project association
- [ ] FR-NT-002.4: Optional template initialization
- [ ] FR-NT-002.5: Returns approval_required payload
- [ ] FR-NT-002.6: Generates unique note ID

#### NT-003: update_note
- [ ] FR-NT-003.1: Update title
- [ ] FR-NT-003.2: Update is_pinned status
- [ ] FR-NT-003.3: Update project association (set or clear via null)
- [ ] FR-NT-003.4: Only update provided fields (partial update)
- [ ] FR-NT-003.5: Returns approval_required payload

#### NT-004: search_note_content
- [ ] FR-NT-004.1: Plain text search within single note
- [ ] FR-NT-004.2: Regex pattern search option
- [ ] FR-NT-004.3: Case sensitivity option
- [ ] FR-NT-004.4: Return block IDs with matches
- [ ] FR-NT-004.5: Return match context (surrounding text)

#### NT-005: insert_block
- [ ] FR-NT-005.1: Insert after specified block_id
- [ ] FR-NT-005.2: Insert before specified block_id
- [ ] FR-NT-005.3: Append to end if no position specified
- [ ] FR-NT-005.4: Convert markdown to TipTap block(s)
- [ ] FR-NT-005.5: Assign new block ID(s)

#### NT-006: remove_block
- [ ] FR-NT-006.1: Remove single block by ID
- [ ] FR-NT-006.2: Remove all nested content within block
- [ ] FR-NT-006.3: Preserve document structure

#### NT-007: remove_content
- [ ] FR-NT-007.1: Remove text matching pattern
- [ ] FR-NT-007.2: Regex pattern support
- [ ] FR-NT-007.3: Scope to specific block_ids
- [ ] FR-NT-007.4: Preserve empty blocks or remove them (configurable)

#### NT-008: replace_content
- [ ] FR-NT-008.1: Find and replace text pattern
- [ ] FR-NT-008.2: Regex with capture groups support ($1, $2)
- [ ] FR-NT-008.3: Scope to specific block_ids
- [ ] FR-NT-008.4: Replace first or all occurrences option
- [ ] FR-NT-008.5: Return before/after preview

---

### Issue Tools (10 tools)

#### IS-001: get_issue
- [ ] FR-IS-001.1: Retrieve by UUID or identifier (PILOT-123)
- [ ] FR-IS-001.2: Include linked notes option
- [ ] FR-IS-001.3: Include sub-issues option
- [ ] FR-IS-001.4: Include activity log option
- [ ] FR-IS-001.5: Include AI context option
- [ ] FR-IS-001.6: RLS enforcement
- [ ] FR-IS-001.7: Include issue links option (blocks, blocked_by, duplicates, related)
- [ ] FR-IS-001.8: Include transitive dependency chain when include_links=True

#### IS-002: search_issues
- [ ] FR-IS-002.1: Text search in title and description
- [ ] FR-IS-002.2: Filter by project_id
- [ ] FR-IS-002.3: Filter by state_group
- [ ] FR-IS-002.4: Filter by priority
- [ ] FR-IS-002.5: Filter by assignee_id
- [ ] FR-IS-002.6: Filter by label_ids (AND logic)
- [ ] FR-IS-002.7: Configurable limit (max 100)

#### IS-003: create_issue
- [ ] FR-IS-003.1: Require project_id and title
- [ ] FR-IS-003.2: Auto-assign sequence_id
- [ ] FR-IS-003.3: Default to backlog state if not specified
- [ ] FR-IS-003.4: Support all optional fields
- [ ] FR-IS-003.5: Validate priority enum
- [ ] FR-IS-003.6: Validate target_date format

#### IS-004: update_issue
- [ ] FR-IS-004.1: Partial update (only provided fields)
- [ ] FR-IS-004.2: Support identifier lookup
- [ ] FR-IS-004.3: Record activity for each change
- [ ] FR-IS-004.4: No state_id param (state changes via transition_issue_state IS-010 only)
- [ ] FR-IS-004.5: Support add_label_ids param (list of label UUIDs to add)
- [ ] FR-IS-004.6: Support remove_label_ids param (list of label UUIDs to remove)
- [ ] FR-IS-004.7: Validate labels belong to project

#### IS-005: link_issue_to_note
- [ ] FR-IS-005.1: Create NoteIssueLink record
- [ ] FR-IS-005.2: Support link types: created, extracted, referenced
- [ ] FR-IS-005.3: Optional block_id for precise linking
- [ ] FR-IS-005.4: Prevent duplicate links

#### IS-006: unlink_issue_from_note
- [ ] FR-IS-006.1: Remove NoteIssueLink record
- [ ] FR-IS-006.2: Remove inline issue badge from note content
- [ ] FR-IS-006.3: Always require approval

#### IS-007: link_issues
- [ ] FR-IS-007.1: Create IssueLink record
- [ ] FR-IS-007.2: Support types: blocks, blocked_by, duplicates, related
- [ ] FR-IS-007.3: Create inverse link for bidirectional types
- [ ] FR-IS-007.4: Prevent self-linking

#### IS-008: unlink_issues
- [ ] FR-IS-008.1: Remove IssueLink record
- [ ] FR-IS-008.2: Remove inverse link
- [ ] FR-IS-008.3: Always require approval

#### IS-009: add_sub_issue
- [ ] FR-IS-009.1: Set parent_id on child issue
- [ ] FR-IS-009.2: Re-parent if already has parent
- [ ] FR-IS-009.3: Prevent circular hierarchy
- [ ] FR-IS-009.4: Maximum depth limit (configurable, default 3)

#### IS-010: transition_issue_state
- [ ] FR-IS-010.1: Validate state belongs to project
- [ ] FR-IS-010.2: Validate transition is allowed
- [ ] FR-IS-010.3: Record activity with old/new state
- [ ] FR-IS-010.4: Optional transition comment

---

### Project Tools (5 tools)

#### PR-001: get_project
- [ ] FR-PR-001.1: Retrieve by UUID or identifier
- [ ] FR-PR-001.2: Include labels and states
- [ ] FR-PR-001.3: Include issue counts by state
- [ ] FR-PR-001.4: Include recent issues option

#### PR-002: search_projects
- [ ] FR-PR-002.1: Text search in name and identifier
- [ ] FR-PR-002.2: Configurable limit
- [ ] FR-PR-002.3: RLS enforcement

#### PR-003: create_project
- [ ] FR-PR-003.1: Validate identifier format (2-10 uppercase)
- [ ] FR-PR-003.2: Unique identifier within workspace
- [ ] FR-PR-003.3: Create default states
- [ ] FR-PR-003.4: Create default labels (optional)

#### PR-004: update_project
- [ ] FR-PR-004.1: Partial update
- [ ] FR-PR-004.2: Cannot change identifier
- [ ] FR-PR-004.3: Validate lead_id if provided

#### PR-005: update_project_settings
- [ ] FR-PR-005.1: Merge settings dict (upsert keys)
- [ ] FR-PR-005.2: Return diff of changes
- [ ] FR-PR-005.3: Validate settings schema

---

### Comment Tools (4 tools)

#### CM-001: create_comment
- [ ] FR-CM-001.1: Create comment on issue, note, or discussion
- [ ] FR-CM-001.2: Support markdown content
- [ ] FR-CM-001.3: Support threaded replies
- [ ] FR-CM-001.4: Set author_id from context

#### CM-002: update_comment
- [ ] FR-CM-002.1: Update comment content
- [ ] FR-CM-002.2: Only author can update
- [ ] FR-CM-002.3: Record edited_at timestamp

#### CM-003: search_comments
- [ ] FR-CM-003.1: Text search in content
- [ ] FR-CM-003.2: Regex search option
- [ ] FR-CM-003.3: Filter by target_type
- [ ] FR-CM-003.4: Filter by target_id
- [ ] FR-CM-003.5: Filter by author_id

#### CM-004: get_comments
- [ ] FR-CM-004.1: Retrieve all comments for entity
- [ ] FR-CM-004.2: Build threaded structure
- [ ] FR-CM-004.3: Include author info
- [ ] FR-CM-004.4: Configurable limit

> **CM-005 removed**: `get_linked_issues` absorbed into IS-001 `get_issue` via `include_links` param. Requirements moved to FR-IS-001.7 and FR-IS-001.8.

---

## Non-Functional Requirements

### Security

- [ ] NFR-SEC-001: All tools enforce RLS via workspace_id
- [ ] NFR-SEC-002: Tools validate user permissions before mutations
- [ ] NFR-SEC-003: Approval flow for REQUIRE_APPROVAL and ALWAYS_REQUIRE
- [ ] NFR-SEC-004: No SQL injection via input validation
- [ ] NFR-SEC-005: Audit log for all mutations

### Performance

- [ ] NFR-PERF-001: CRUD tools <500ms p95 latency
- [ ] NFR-PERF-002: Search tools <2s p95 latency
- [ ] NFR-PERF-003: No N+1 queries (eager loading)
- [ ] NFR-PERF-004: Content tools process up to 50KB documents

### Reliability

- [ ] NFR-REL-001: Idempotent operations where possible
- [ ] NFR-REL-002: Transactional consistency for multi-step operations
- [ ] NFR-REL-003: Graceful error messages with recovery hints

### Compatibility

- [ ] NFR-COMPAT-001: Backward compatible with existing 6 note tools
- [ ] NFR-COMPAT-002: SSE event format unchanged
- [ ] NFR-COMPAT-003: Approval flow unchanged
- [ ] NFR-COMPAT-004: ContentConverter compatibility maintained

### Testing

- [ ] NFR-TEST-001: >80% code coverage per tool
- [ ] NFR-TEST-002: Unit tests for each tool
- [ ] NFR-TEST-003: Integration tests for tool chains
- [ ] NFR-TEST-004: RLS isolation tests
- [ ] NFR-TEST-005: Approval flow tests

---

## Architecture Decision Requirements

### AD-001: Reuse ThreadedDiscussion + DiscussionComment

- [ ] FR-AD-001.1: Comment tools use DiscussionService (no new Comment model)
- [ ] FR-AD-001.2: ThreadedDiscussion extended with target_type column
- [ ] FR-AD-001.3: DiscussionComment extended with reactions JSONB column
- [ ] FR-AD-001.4: DiscussionComment extended with edited_at column
- [ ] FR-AD-001.5: Migration for new columns (additive, backward compatible)

### AD-002: Dynamic Tool Search

- [ ] FR-AD-002.1: ToolSearch enabled for PilotSpaceAgent
- [ ] FR-AD-002.2: Tool index (names + summaries) fits in ~300 tokens
- [ ] FR-AD-002.3: Max 10 active tool definitions at any time
- [ ] FR-AD-002.4: Category-based loading supported

### AD-003: Immediate Tool Replacement

- [ ] FR-AD-003.1: Remove get_issue_context from database_tools.py
- [ ] FR-AD-003.2: Remove get_note_content from database_tools.py
- [ ] FR-AD-003.3: Remove get_project_context from database_tools.py
- [ ] FR-AD-003.4: Remove find_similar_issues from database_tools.py
- [ ] FR-AD-003.5: Remove create_issue from database_tools.py
- [ ] FR-AD-003.6: Remove get_page_content from database_tools.py
- [ ] FR-AD-003.7: Update all agent tool configurations
- [ ] FR-AD-003.8: Update all tests referencing removed tools

### AD-004: Single-Note Content Tool Scope

- [ ] FR-AD-004.1: All content tools accept single note_id (not list)
- [ ] FR-AD-004.2: Error message suggests looping for multi-note operations

### AD-005: Separate IssueLink Table

- [ ] FR-AD-005.1: Create issue_links table with migration
- [ ] FR-AD-005.2: Unique constraint on (source, target, type)
- [ ] FR-AD-005.3: Indexes on source_issue_id, target_issue_id
- [ ] FR-AD-005.4: Workspace-scoped (workspace_id column + RLS)
- [ ] FR-AD-005.5: CASCADE delete on issue removal

### AD-006: Shared Entity Resolver

- [ ] FR-AD-006.1: resolve_entity_id() utility created
- [ ] FR-AD-006.2: Accepts UUID string format
- [ ] FR-AD-006.3: Accepts PROJ-NNN identifier format
- [ ] FR-AD-006.4: Accepts project identifier format (PROJ)
- [ ] FR-AD-006.5: RLS enforcement in resolver queries
- [ ] FR-AD-006.6: All tools use resolver (no direct UUID parsing)

### AD-007: Tool-to-Skill Mapping

- [ ] FR-AD-007.1: YAML skill files created for mapped tools
- [ ] FR-AD-007.2: Skills invoke corresponding MCP tools

### AD-008: No Delete Tools

- [ ] FR-AD-008.1: No delete_note tool in AI agent
- [ ] FR-AD-008.2: No delete_issue tool in AI agent
- [ ] FR-AD-008.3: No delete_project tool in AI agent
- [ ] FR-AD-008.4: No delete_comment tool in AI agent
- [ ] FR-AD-008.5: Destructive deletions handled exclusively via frontend UI

### AD-009: Merged Attribute Tools

- [ ] FR-AD-009.1: update_issue supports add_label_ids/remove_label_ids
- [ ] FR-AD-009.2: update_note supports project_id (set or null to unlink)
- [ ] FR-AD-009.3: Issue-project transfer via update_issue project_id field

### AD-010: Defer TipTap Formatting Tools to P2

- [ ] FR-AD-010.1: No convert_block_type tool in AI agent
- [ ] FR-AD-010.2: No apply_marks tool in AI agent
- [ ] FR-AD-010.3: No insert_inline_node tool in AI agent
- [ ] FR-AD-010.4: Agent uses markdown in replace_content for formatting

---

## Acceptance Criteria

### Definition of Done

1. [ ] Tool implementation complete
2. [ ] Docstring with 3-4+ sentences per SDK guidelines
3. [ ] Input validation with clear error messages
4. [ ] Approval level correctly assigned
5. [ ] RLS enforcement verified
6. [ ] Unit tests passing (>80% coverage)
7. [ ] Integration test with PilotSpaceAgent
8. [ ] SSE event format verified
9. [ ] Error handling for all edge cases
10. [ ] Performance benchmarks met

### Validation Sign-off

| Category | Implementer | Reviewer | Date |
|----------|-------------|----------|------|
| Note Tools | | | |
| Issue Tools | | | |
| Project Tools | | | |
| Comment Tools | | | |
| Integration | | | |
