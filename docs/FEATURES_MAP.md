# Pilot Space — Features Map

> Reference document of all platform capabilities organized by architectural layer.
> Implementation status: [Implemented] = shipped and live, [Partial] = partially complete, [Planned] = in backlog.
> Last updated: 2026-03-14

---

## Summary Table

| Layer | Feature Count | Implemented | Partial | Planned |
|-------|:---:|:---:|:---:|:---:|
| Layer 1 — Core PM | 8 | 6 | 2 | 0 |
| Layer 2 — AI-Augmented | 10 | 5 | 3 | 2 |
| Layer 3 — Knowledge & Memory | 5 | 2 | 2 | 1 |
| Layer 4 — Integrations | 4 | 1 | 1 | 2 |
| Layer 5 — Enterprise | 7 | 5 | 1 | 1 |
| Layer 6 — PM Intelligence | 5 | 1 | 2 | 2 |
| CLI | 2 | 2 | 0 | 0 |
| **Total** | **41** | **22** | **11** | **8** |

---

## Layer 1 — Core PM

Project management foundations: issues, notes, cycles, projects, members, onboarding, roles, and intent routing.

### Issues [Implemented]

Full CRUD for work items with a state machine (backlog → todo → in-progress → done → cancelled), priority levels (urgent/high/medium/low/none), label tagging, cycle assignment, and multi-assignee support. The issue detail page uses a "Note-First" paradigm: a TipTap rich-text editor is the primary editing surface, with a property block at position 0 rendering structured metadata inline.

Key files: `backend/src/pilot_space/domain/issue.py`, `frontend/src/features/issues/`

### Notes [Implemented]

TipTap-based rich-text editor embedded in the issue detail page. Supports markdown shortcuts, 2-second debounce auto-save, Cmd+S force-flush via `issue-force-save` DOM event, ghost text AI completions injected inline, and property block stripping before persistence.

Key files: `frontend/src/features/issues/components/issue-editor-content.tsx`, `frontend/src/features/issues/editor/property-block-extension.ts`

### Cycles [Implemented]

Time-boxed sprints that group issues into a focused delivery window. Supports start/end dates, issue assignment (add/remove), progress tracking (completed vs total issues), and cycle listing per workspace. Issues can belong to one active cycle at a time.

Key files: `backend/src/pilot_space/api/v1/cycles.py`, `frontend/src/features/cycles/`

### Projects [Implemented]

Logical groupings of issues within a workspace. Each project has a name, status, description, and optional lead assignment. Issues are scoped to projects; workspace navigation shows all projects in the sidebar.

Key files: `backend/src/pilot_space/api/v1/projects.py`, `frontend/src/features/projects/`

### Members [Implemented]

Workspace membership management. Owners can invite members by email, assign roles (Owner/Admin/Member/Guest), and remove members. The members list page shows avatar, name, email, role, and join date. Role-based access control enforces what each role can do across the platform.

Key files: `backend/src/pilot_space/api/v1/members.py`, `frontend/src/features/members/`

### Onboarding [Implemented]

Guided workspace setup checklist shown to new workspaces. Steps include: create first project, invite a team member, create first issue, and set up GitHub integration. The checklist is collapsible. Completion tracking is persisted per workspace.

Key files: `frontend/src/features/onboarding/`

### Skills and Roles [Partial]

Workspace member capability declaration — members can list their skills (e.g., "backend", "frontend", "devops") to support AI-driven assignee suggestions. The data model exists; the UI for editing skills is partially implemented.

Key files: `backend/src/pilot_space/domain/member.py`

### Intents [Partial]

Action routing layer for AI commands. Users type natural language in the AI chat or note canvas; intents classify the request (create issue, assign issue, summarize cycle, etc.) and route to the appropriate handler. Core routing is implemented; full intent library is still expanding.

Key files: `backend/src/pilot_space/ai/skills/`

---

## Layer 2 — AI-Augmented

AI capabilities layered on top of core PM: orchestrator, ghost text, chat, extraction, annotations, context building, PR review, approvals, cost tracking, and provider governance.

### PilotSpaceAgent (Orchestrator) [Implemented]

Single entry point for all user-facing AI interactions. Built on the Claude Agent SDK, routes requests to skills (single-turn, stateless) and subagents (multi-turn, stateful). Streams responses via Server-Sent Events (SSE). All AI requests flow through this orchestrator except GhostTextAgent (performance-isolated) and PR Review Agent (background).

Key files: `backend/src/pilot_space/ai/agents/pilotspace_agent.py`

### Ghost Text [Implemented]

Independent inline completion agent bypassing the orchestrator to achieve sub-2-second latency. Triggered by user typing in the TipTap note canvas; provides grey ghost text suggestions the user can accept with Tab. Uses a fast provider (Haiku/Flash) with a short context window.

Key files: `backend/src/pilot_space/ai/agents/ghost_text_agent.py`, `frontend/src/features/issues/editor/`

### AI Chat [Implemented]

Conversational sidebar agent. Users ask questions, issue commands, or request summaries. Supports tool use (fetch issue details, search knowledge graph, update issue state). Streaming responses rendered in real time. Accessible from the workspace sidebar.

Key files: `frontend/src/features/ai-chat/`, `backend/src/pilot_space/api/v1/ai_chat.py`

### Issue Extraction [Implemented]

Parses free-form note text and identifies candidate issues (action items, bugs, tasks). Presents extracted issues as a list for the user to accept/reject/edit before creating them. Human-in-the-loop confirmation required before any issue is created (DD-003).

Key files: `backend/src/pilot_space/ai/skills/issue_extraction.py`

### Margin Annotations [Partial]

Contextual AI suggestions displayed in the margin of the note editor. Triggered by content analysis (e.g., detects a potential bug mention and offers to create an issue). UI component scaffolded; annotation generation partially wired to editor events.

Key files: `frontend/src/features/issues/components/margin-annotations.tsx`

### AI Context Builder [Implemented]

Codebase summarization subagent that ingests repository content, generates a structured AI context document, and stores it for LLM retrieval. Used by the PR Review Agent and AI Chat to ground responses in project-specific knowledge. Background job triggered on repository sync.

Key files: `backend/src/pilot_space/ai/agents/ai_context_agent.py`

### PR Review Agent [Partial]

Multi-turn, stateful subagent that reviews GitHub pull requests. Reads diff and changed files, cross-references issues, and posts structured review comments. Results stream back through the orchestrator SSE. Currently triggered manually; automatic trigger on PR open is planned.

Key files: `backend/src/pilot_space/ai/agents/pr_review_agent.py`

### AI Approvals [Implemented]

Human-in-the-loop approval gate for destructive or content-creating AI actions (DD-003). Non-destructive actions auto-approve; content creation is configurable per workspace; destructive actions always require explicit user confirmation. Approval state is persisted and auditable.

Key files: `backend/src/pilot_space/services/approval_service.py`

### AI Cost Tracking [Partial]

Per-user and per-workspace token usage tracking. Every LLM call records input/output tokens, model, and cost estimate to the database. Cost summary is exposed in workspace settings. Reporting dashboard is planned.

Key files: `backend/src/pilot_space/services/cost_tracker.py`

### AI Governance [Planned]

Provider routing (DD-011) selects the optimal LLM provider and model for each task type (ghost text → fast/cheap, PR review → capable/expensive). BYOK (Bring Your Own Key) — users supply their own API keys, no AI cost pass-through from Pilot Space. Per-user model defaults and base_url overrides are implemented (quick task 5). Full governance dashboard is planned.

Key files: `backend/src/pilot_space/ai/providers/provider_selector.py`, `backend/src/pilot_space/api/v1/user_settings.py`

---

## Layer 3 — Knowledge and Memory

Graph-based long-term memory, semantic search, and dependency visualization.

### Knowledge Graph [Implemented]

Visual graph of workspace knowledge: issues, notes, note chunks, members, and their relationships (RELATES_TO, BLOCKS, ASSIGNED_TO, etc.). Rendered in the browser using D3/force-graph. Nodes are clickable to navigate to the related entity. Accessible from the workspace sidebar at `/knowledge-graph`.

Key files: `backend/src/pilot_space/domain/graph_node.py`, `frontend/src/features/knowledge-graph/`

### KG Auto-Population [Implemented]

Background job pipeline that automatically populates the knowledge graph when issues or notes are created/updated. Uses a markdown heading-based chunker (`markdown-it-py`) to split notes into `NOTE_CHUNK` nodes. Jobs dispatched via Supabase Queues (pgmq). Non-fatal: queue enqueue failures do not block the primary write path.

Key files: `backend/src/pilot_space/ai/kg_populate_handler.py`, `backend/src/pilot_space/ai/markdown_chunker.py`, `backend/src/pilot_space/services/memory_worker.py`

### Memory/Recall [Partial]

Semantic search over workspace knowledge graph using vector embeddings. Given a query (e.g., from AI Chat), retrieves contextually relevant issues, notes, and chunks. Embedding generation and pgvector storage is implemented; retrieval scoring and ranking is still being tuned.

Key files: `backend/src/pilot_space/repositories/memory_repository.py`

### Related Issues [Partial]

Similarity-based suggestions shown on the issue detail page — "You may also be interested in...". Computed from vector similarity between issue embeddings. UI widget exists; latency optimization for real-time display is in progress.

Key files: `frontend/src/features/issues/components/related-issues.tsx`

### Dependency Graph [Planned]

Cross-issue dependency visualization: "Issue A blocks Issue B". Data model for blocking relationships exists on the issue domain model. Dedicated visualization UI and enforcement rules (e.g., cycle detection) are planned.

Key files: `backend/src/pilot_space/domain/issue.py` (blocking_issues field)

---

## Layer 4 — Integrations

External system connectivity: GitHub, MCP servers, plugins, and webhooks.

### GitHub [Partial]

OAuth app authorization linking a workspace to a GitHub organization/repo. Repository sync populates branches and PRs. PR linking connects GitHub PRs to Pilot Space issues. Automatic PR Review Agent trigger on PR open is planned. Current state: OAuth and manual repo sync are implemented; webhook-based auto-trigger is not.

Key files: `backend/src/pilot_space/api/v1/github.py`, `backend/src/pilot_space/services/github_service.py`

### MCP Servers [Planned]

Model Context Protocol tool registration for Claude Agent SDK. Planned to support dynamic tool routing so workspace-specific tools (e.g., internal APIs, custom data sources) can be registered and discovered by the AI agents at runtime.

Key files: `backend/src/pilot_space/ai/` (MCP wiring planned)

### Plugins [Planned]

Extensibility framework allowing third-party integrations to hook into Pilot Space events (issue created, cycle started, PR merged). Plugin manifest format and registration API are designed but not yet implemented.

### Webhooks [Planned]

Outbound event dispatch to external systems on workspace events. Supports configurable endpoint URLs, secret signing, retry logic, and event filtering. Design complete; implementation planned for a future milestone.

---

## Layer 5 — Enterprise

Security, compliance, and governance capabilities for team deployments.

### RBAC [Implemented]

Role-Based Access Control with four workspace-scoped roles: Owner, Admin, Member, Guest. Permissions enforced at the API layer (FastAPI route guards) and at the database layer (PostgreSQL RLS policies). Roles stored in lowercase in the database; RLS policies reference uppercase enum values.

Key files: `backend/src/pilot_space/domain/member.py`, `backend/alembic/versions/`

### SSO [Implemented]

Authentication via Supabase Auth (self-hosted). Supports email/password login. Social login providers (Google, GitHub OAuth) are configurable through Supabase dashboard. JWTs issued by Supabase are validated on every API request via middleware.

Key files: `authcore/`, `backend/src/pilot_space/dependencies/auth.py`

### Audit [Implemented]

Action logging for workspace-level events (member invited, role changed, issue deleted, AI action approved/rejected). Audit records are persisted to the database and queryable by workspace owners and admins.

Key files: `backend/src/pilot_space/repositories/audit_repository.py`

### Encryption [Implemented]

At-rest encryption via Supabase managed PostgreSQL (AES-256). In-transit encryption via TLS enforced on all API and WebSocket connections. API keys stored with encryption at the application layer before persisting to the database.

### RLS [Implemented]

PostgreSQL Row-Level Security provides database-level multi-tenant isolation. Every table has RLS enabled and forced. Workspace isolation policy gates all reads/writes using `current_setting('app.current_user_id', true)::uuid`. Service role bypass policy for internal jobs. `set_rls_context()` called at the start of every workspace-scoped query.

Key files: `backend/src/pilot_space/infrastructure/database/rls.py`

### SCIM [Planned]

Automated user provisioning/deprovisioning via SCIM 2.0 protocol for enterprise identity providers (Okta, Azure AD). Data model design is in progress; implementation is planned for a post-MVP enterprise tier.

### Quotas [Partial]

Usage limits per workspace: maximum members, maximum AI requests per day, maximum storage. Limit definitions exist in the configuration layer. Enforcement middleware and self-service limit management UI are partially implemented.

Key files: `backend/src/pilot_space/config.py`

---

## Layer 6 — PM Intelligence

Higher-order project management features: board views, release notes, capacity planning, and bottleneck detection.

### Sprint Board (Kanban) [Implemented]

Kanban view of issues organized by state columns. Supports drag-and-drop reordering within and between columns. Column scroll with fade effect for overflow indication. Filtered by active cycle or all issues.

Key files: `frontend/src/features/issues/components/kanban-board.tsx`

### Release Notes [Partial]

AI-generated release notes from a completed cycle. Summarizes shipped issues grouped by type (features, fixes, chores). Narrative text generated by PilotSpaceAgent. Output can be exported to Markdown. Currently triggered manually from the cycle detail page; auto-generation on cycle close is planned.

Key files: `backend/src/pilot_space/ai/skills/release_notes.py`

### Capacity Planning [Partial]

Workload distribution view showing how many issues/points are assigned to each member in a given cycle. Helps PMs identify overloaded or underutilized contributors. Data aggregation is implemented; visual distribution chart is in progress.

Key files: `frontend/src/features/cycles/components/capacity-view.tsx`

### PM Dependency Graph [Planned]

Cross-issue blocking visualization for project managers. Shows the critical path across a cycle's issues. Requires dependency data (BLOCKS relationships in knowledge graph) and a DAG rendering layer. Planned for a future milestone.

### Block Insights [Planned]

Automated bottleneck detection: identifies issues that have been in "blocked" state longest, members with the most blockers assigned, and cycles at risk of slipping due to unresolved dependencies. Planned as an AI skill that runs nightly and surfaces alerts in the workspace dashboard.

---

## CLI

Developer-facing command-line tools for authentication and AI-driven issue implementation.

### `pilot login` [Implemented]

Authenticates the developer's local environment against a Pilot Space workspace. Prompts for workspace URL and credentials, stores a JWT in the local config file (`~/.pilot/config.json`). Used as a prerequisite for all other CLI commands.

Key files: `cli/src/pilot_cli/commands/login.py`

### `pilot implement` [Implemented]

AI-driven issue implementation workflow. Given a Pilot Space issue ID (e.g., `PS-42`), fetches the issue description, generates an implementation plan, and guides the developer step-by-step through writing code. Two modes:
- **Interactive** (`pilot implement PS-42`): streams plan and waits for user confirmation at each step.
- **Oneshot** (`pilot implement PS-42 --oneshot`): runs end-to-end non-interactively for CI pipelines.

Key files: `cli/src/pilot_cli/commands/implement.py`

---

## Cross-Cutting Concerns

These are not features per se but architectural foundations that underpin all layers.

| Concern | Approach | Status |
|---------|----------|--------|
| Multi-tenancy | PostgreSQL RLS + workspace_id scoping | [Implemented] |
| Async I/O | SQLAlchemy async, FastAPI async routes | [Implemented] |
| Streaming | Server-Sent Events (SSE) for AI responses | [Implemented] |
| Queue | Supabase Queues (pgmq), exactly-once delivery | [Implemented] |
| Vector Store | pgvector on PostgreSQL | [Implemented] |
| State Management (FE) | MobX observables + TanStack Query | [Implemented] |
| Error Handling | RFC 7807 Problem+JSON on all API errors | [Implemented] |
| API Design | FastAPI, Clean Architecture, CQRS-lite | [Implemented] |
| Auth | Supabase JWT, validated per request | [Implemented] |
| Migrations | Alembic, sequential numbered, immutable once committed | [Implemented] |

---

*For the older feature specification with user stories and UX wireframes, see `docs/PILOT_SPACE_FEATURES.md`.*
*For architectural decisions, see `docs/DESIGN_DECISIONS.md`.*
*For dev patterns and conventions, see `docs/dev-pattern/`.*
