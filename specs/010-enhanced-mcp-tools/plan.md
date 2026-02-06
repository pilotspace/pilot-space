# Implementation Plan: Enhanced MCP Tools

**Feature**: Enhanced MCP Tools for PilotSpaceAgent
**Branch**: `010-enhanced-mcp-tools`
**Created**: 2026-02-06
**Spec**: `specs/010-enhanced-mcp-tools/spec.md`
**Author**: Tin Dang

---

## Summary

Expand Pilot Space's MCP tool suite from 6 note tools to 27 tools across Notes, Issues, Projects, and Comments — using dynamic tool search (AD-002), shared entity resolver (AD-006), and reusing existing ThreadedDiscussion models (AD-001). Backend-only; all tools return operation payloads for the SSE transform layer.

---

## Technical Context

| Attribute | Value |
|-----------|-------|
| **Language/Version** | Python 3.12+ |
| **Primary Dependencies** | FastAPI 0.110+, SQLAlchemy 2.0 (async), Claude Agent SDK |
| **Storage** | PostgreSQL 16+ with RLS, Redis 7 |
| **Testing** | pytest + pytest-asyncio, >80% coverage |
| **Target Platform** | Linux server (Docker) |
| **Project Type** | Backend API (MCP tools layer) |
| **Performance Goals** | <500ms P95 CRUD tools, <2s P95 search tools |
| **Constraints** | RLS multi-tenant isolation, 8K token budget per session |
| **Scale/Scope** | 5-100 users per workspace, 27 tools |

---

## Constitution Gate Check

### Technology Standards Gate

- [x] Language/Framework matches constitution mandates (Python 3.12+, FastAPI)
- [x] Database choice aligns (PostgreSQL 16+ with RLS)
- [x] Auth approach follows (Supabase Auth + RLS via workspace_id)
- [x] Architecture patterns match (CQRS-lite, Repository, Clean Architecture)

### Simplicity Gate

- [x] Using minimum number of services (tools layer only, reuses existing services)
- [x] No future-proofing (AD-003: immediate replacement, no transition period)
- [x] No premature abstractions (tools return dicts, not custom types)
- [x] Thin wrappers merged into parent CRUD (AD-009: 42 → 27 tools)
- [x] No delete tools for AI agent (AD-008: destructive ops via UI only)

### Quality Gate

- [x] Test strategy defined: >80% coverage per tool (pytest-cov)
- [x] Type checking enforced: pyright strict
- [x] File size limits: 700 lines max per tool file
- [x] Linting: ruff

---

## Architecture Mapping

### Category-Level Routing

- **Note tools** (8 new): Route through NoteRepository + ContentConverter. Content tools operate on TipTap JSON (single-note scope per AD-004). `update_note` absorbs project association (AD-009).
- **Issue tools** (10 new): Route through IssueRepository + IssueLinkRepository. Use `resolve_entity_id` for UUID/identifier. `update_issue` absorbs label add/remove (AD-009).
- **Project tools** (5 new): Route through ProjectRepository. Issue-project transfer handled via `update_issue`.
- **Comment tools** (4 new): Route through DiscussionService → ThreadedDiscussion + DiscussionComment models (AD-001). `get_linked_issues` absorbed into `get_issue` (IS-001).

### Key Architectural Patterns

| Pattern | Application |
|---------|-------------|
| Entity resolver | All tools use `resolve_entity_id()` for UUID or identifier (PILOT-123) |
| Operation payloads | All mutation tools return `{status: "pending_apply", payload: {...}}` |
| Approval routing | `ApprovalLevel` enum classifies each tool; SSE event flow per level |
| Single-note scope | Content tools target one note per call (AD-004) |
| No delete tools | Destructive ops excluded from AI agent (AD-008) |

---

## Research Decisions

| Question | Options Evaluated | Decision | Rationale |
|----------|-------------------|----------|-----------|
| Comment model strategy | New unified Comment, Reuse existing, Facade pattern | Reuse ThreadedDiscussion + DiscussionComment | AD-001: No migration, existing data intact |
| Tool loading for 27 tools | Dynamic search, Category subsets, All loaded | Dynamic tool search via SDK ToolSearch | AD-002: On-demand loading within 8K budget |
| Deprecated tool migration | Same release with warnings, Feature flag, Immediate removal | Immediate replacement | AD-003: Clean break, no transition debt |
| Content tool scope | Single-note, Multi-note batch, Both with flag | Single-note per call | AD-004: Simpler approval/rollback |
| Issue relationship storage | Separate table, Generic EntityLink, JSONB in Issue | Separate issue_links table | AD-005: Clean indexes for dependency queries |
| ID resolution pattern | Shared resolver, UUID-only, Dual parameter | Shared resolve_entity_id() utility | AD-006: Single query pattern for all tools |
| Delete tools | Include with ALWAYS_REQUIRE, Exclude | Exclude from AI agent | AD-008: Destructive ops via UI only |
| Thin wrapper tools | Separate tools, Merge into parent CRUD | Merge into parent CRUD | AD-009: Fewer tools = simpler prompt |
| TipTap formatting tools | Include now, Defer to P2, Markdown only | Defer to P2 | AD-010: Agent uses markdown in replace_content; formatting is UI-layer concern |

---

## Data Model

### IssueLink (New — AD-005)

**Purpose**: Issue-to-issue relationships for dependency tracking
**Source**: IS-007, IS-008

```python
class IssueLinkType(str, Enum):
    BLOCKS = "blocks"
    BLOCKED_BY = "blocked_by"
    DUPLICATES = "duplicates"
    RELATED = "related"


class IssueLink(WorkspaceScopedModel):
    """Issue-to-issue relationships (AD-005)."""

    __tablename__ = "issue_links"

    source_issue_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("issues.id", ondelete="CASCADE"), nullable=False,
    )
    target_issue_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("issues.id", ondelete="CASCADE"), nullable=False,
    )
    link_type: Mapped[IssueLinkType] = mapped_column(
        SQLEnum(IssueLinkType, name="issue_link_type", create_type=False), nullable=False,
    )

    source_issue: Mapped[Issue] = relationship("Issue", foreign_keys=[source_issue_id], lazy="joined")
    target_issue: Mapped[Issue] = relationship("Issue", foreign_keys=[target_issue_id], lazy="joined")

    __table_args__ = (
        UniqueConstraint("source_issue_id", "target_issue_id", "link_type", name="uq_issue_links_source_target_type"),
        Index("ix_issue_links_source", "source_issue_id"),
        Index("ix_issue_links_target", "target_issue_id"),
        Index("ix_issue_links_workspace_type", "workspace_id", "link_type"),
        CheckConstraint("source_issue_id != target_issue_id", name="ck_issue_links_no_self"),
    )
```

### ThreadedDiscussion (Extended — AD-001)

| Field | Type | Change | Notes |
|-------|------|--------|-------|
| target_type | String(20) | ADD, NOT NULL, default "note" | "note" or "issue" |
| target_id | UUID | ADD, nullable | Generic target reference |

### DiscussionComment (Extended — AD-001)

| Field | Type | Change | Notes |
|-------|------|--------|-------|
| reactions | JSONB | ADD, nullable, default {} | P2 consumer (react_to_comment deferred); additive migration is low-cost |
| edited_at | DateTime(tz) | ADD, nullable | Set on content update |

### NoteIssueLink (Extended)

| Field | Type | Change | Notes |
|-------|------|--------|-------|
| block_id | String | ADD, nullable | Precise block-level linking for IS-005 |

All migrations additive only. No data transformation needed.

---

## Project Structure

```text
specs/010-enhanced-mcp-tools/
├── spec.md
├── plan.md                 # This file
├── checklists/
│   └── requirements.md
└── tasks.md

backend/src/pilot_space/
├── ai/tools/
│   ├── mcp_server.py          # EDIT: Add categories, ApprovalLevel, resolver
│   ├── note_tools.py          # EDIT: Add NT-001 to NT-003 (CRUD)
│   ├── note_content_tools.py  # NEW: NT-004 to NT-008 (content operations)
│   ├── issue_tools.py         # NEW: IS-001 to IS-010
│   ├── project_tools.py       # NEW: PR-001 to PR-005
│   ├── comment_tools.py       # NEW: CM-001 to CM-004
│   └── database_tools.py      # EDIT: Remove 7 deprecated tools
├── infrastructure/database/
│   ├── models/
│   │   ├── issue_link.py              # NEW: IssueLink model
│   │   ├── threaded_discussion.py     # EDIT: Add target_type, target_id
│   │   ├── discussion_comment.py      # EDIT: Add reactions, edited_at
│   │   └── __init__.py                # EDIT: Export IssueLink
│   └── repositories/
│       └── issue_link_repository.py   # NEW: IssueLinkRepository

backend/tests/unit/ai/tools/
├── test_note_tools.py                 # NEW: NT-001 to NT-008 tests
├── test_issue_tools.py                # NEW: IS-001 to IS-010 tests
├── test_project_tools.py              # NEW: PR-001 to PR-005 tests
├── test_comment_tools.py              # NEW: CM-001 to CM-004 tests
├── test_entity_resolver.py            # NEW: resolve_entity_id tests
└── test_tool_registry.py              # NEW: Registry + categories tests

backend/tests/integration/
└── test_mcp_tool_chains.py            # NEW: Cross-tool workflow tests
```

**Note**: Note tools split across two files (CRUD + content) to stay under 700 lines.

---

## Quickstart Validation

### Scenario 1: Create Issue from Chat

1. User says "Create a bug issue for the login timeout problem"
2. Agent → `create_issue` (IS-003) → SSE `approval_request` → User approves → Issue created as PILOT-NNN

### Scenario 2: Find and Replace in Note

1. User says "Replace all TODO: with DONE: in this note"
2. Agent → `replace_content` (NT-008) → Payload shows affected blocks + preview

### Scenario 3: Link Issues with Dependencies

1. User says "PILOT-10 blocks PILOT-15"
2. Agent → `link_issues` (IS-007, link_type="blocks") → IssueLink created

### Scenario 4: Invalid Identifier

1. User says "Show me issue FAKE-999"
2. `resolve_entity_id` returns error → Tool returns `{error: "Issue FAKE-999 not found"}`

### Scenario 5: RLS Isolation

1. User in workspace A searches issues → Only workspace A results returned

---

## Validation Checklists

- [x] Every tool from spec has architectural routing defined
- [x] Data model covers new entity (IssueLink) and extensions
- [x] Research documents each decision with alternatives (8 decisions)
- [x] Project structure defines all new/modified files
- [x] Technology standards gate passed
- [x] Simplicity gate passed (27 tools, no delete, merged wrappers)
- [x] Quality gate passed
- [x] No `[NEEDS CLARIFICATION]` remaining
- [x] Performance constraints have concrete targets
- [x] Security documented (RLS, approval flow)
