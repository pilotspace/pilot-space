# **Pilot Space** is an AI-augmented SDLC platform built on a "Note-First" paradigm

## Project Overview

### Mission

**Pilot Space** is an AI-augmented SDLC platform built on a "Note-First" paradigm. It enables software development teams to ship quality software faster through intelligent AI assistance that augments human expertise in architecture design, documentation, code review, and project management -- while maintaining full human oversight and control.

### Business Context

**Problem**: Traditional issue trackers force form-filling before thinking is complete. Teams brainstorm in Slack/Notion, then manually transcribe into tickets, losing context. AI in existing tools is bolt-on autocomplete, not embedded intelligence.

**Solution**: Users start with a collaborative note canvas. AI acts as an embedded co-writing partner -- suggesting inline completions (ghost text), asking clarifying questions in the margin (annotations), and detecting actionable items. Issues emerge naturally from refined thinking, pre-filled with context.

**Value Proposition**: "Think first, structure later" -- issues emerge from refined thinking rather than form-filling.

Traditional PM: Start with forms → structure upfront → AI bolt-on → dashboard home.
Pilot Space: Start with notes → structure emerges → AI embedded → **Note Canvas home**.


### Target Personas

- **Sarah (Architect)**: AI-powered code review + architecture analysis in PR reviews
- **Marcus (Tech Lead)**: Unified PR review + task decomposition + velocity tracking
- **Elena (PM)**: AI issue enhancement + Note-First workflow for natural requirement capture
- **Dev (Junior)**: AI Context per issue with ready-to-use Claude Code prompts

### Scale & Monetization

- **Target Scale**: 5-100 team members per workspace
- **Pricing Model**: All features free (open source, self-hosted). Paid tiers for support SLAs only. BYOK (Bring Your Own Key) -- no AI cost pass-through. See Pricing Tiers below.

---

## Business Strategy & Metrics

*Source: `specs/001-pilot-space-mvp/business-design.md` v2.0*

### Competitive Moat

moat[6]{layer,depth,time_to_copy}
Note-First philosophy,Deep,12-18 months
1 orchestrator + 3 subagents + 8 skills,Deep,6-12 months
MCP Tool ecosystem (6 note tools + DB/GitHub/Search),Medium,6-9 months
Session persistence (relationship AI),Medium,3-6 months
Knowledge graph (cumulative value),Deep,Grows with usage
BYOK model (trust architecture),Medium,3 months to copy


### Anti-Personas (Do Not Target)

Enterprise 500+ (procurement cycles), solo developers (no collaboration value), non-technical teams, highly regulated industries (BYOK + cloud AI = compliance complexity).

### Pricing Tiers

Community: Free / Best effort. Pro: $10/seat/mo / 48h. Business: $18/seat/mo / 24h. Enterprise: Custom.

### BYOK Cost Estimates (Per User/Month)

Light (~$2), Medium (~$8), Heavy (~$20) depending on ghost text, PR review, and agent usage frequency.

### North Star Metric

**Weekly Active Writing Minutes (WAWM)** -- directly measures Note-First engagement, leading indicator of retention.

### Success Criteria

success_criteria[10]{id,criterion,target}
SC-001,Issue creation time,<2 minutes
SC-002,AI task decomposition,<60 seconds
SC-003,AI PR Review completion,<5 minutes
SC-004,AI label acceptance rate,80%
SC-005,Sprint planning reduction,30%
SC-006,Search response time,<2 seconds
SC-007,Page load time,<3 seconds
SC-010,AI feature weekly usage,70% of members
SC-012,PR linking success,95%
SC-019,RLS enforcement,100%


### Guardrail Metrics

guardrails[6]{metric,alert_if}
Ghost text dismissal rate,>80%
AI label rejection rate,>40%
Issue completion rate,<20%
Churn rate,>8%/month
Subagent latency (p95),>15s
MCP tool error rate,>5%


### Business Rules

**AI Approval Thresholds**: See [Human-in-the-Loop Approval (DD-003)](#human-in-the-loop-approval-dd-003) in AI Agent Architecture.

**BYOK Requirements**: Anthropic (required), Google Gemini (required -- embeddings + ghost text fallback)

**Workspace Constraints**: Max 50,000 issues, 5,000+ blocks/note (virtual scroll), 1,000 req/min standard, 100 req/min AI, 30-day soft deletion, 8,000 token budget/session, 500ms ghost text trigger, 1-2s autosave debounce.

### Go-to-Market Phases

Private Alpha (8 weeks): 10 teams → NPS>30. Closed Beta (12 weeks): 200 waitlist → 25% activation. Public Beta: PLG → 500 WAU. GA (Q2 2026): $5K MRR.

**Activation Criteria** (within 14 days): Create note >500 chars, accept 1+ ghost text, create first issue from note, invite 1 teammate.

### Risk Mitigations

Note-First doesn't resonate → Templates; pivot "Quick Issue" if <20% after 60 days.
AI feels generic → Confidence gating >=80%; default AI off if accept <15%.
SDK dependency → Abstraction layer; skills SDK-independent; fallback to direct API.
Incumbents add AI → Philosophy moat + AI depth (1+3+8).

---

## Technology Stack

### Backend

backend_tech[5]{component,technology,version,decision}
Framework,FastAPI,0.110+,DD-001
ORM,SQLAlchemy 2.0 (async),2.0+,DD-001
Validation,Pydantic v2,2.6+,DD-001
DI,dependency-injector,4+,DD-064
Runtime,Python,3.12+,--


### Frontend

frontend_tech[6]{component,technology,version,decision}
Framework,Next.js (App Router),14+,--
UI State,MobX,6+,DD-065
Server State,TanStack Query,5+,DD-065
Styling,TailwindCSS + shadcn/ui,3.4+,--
Rich Text,TipTap/ProseMirror,2+,--
Language,TypeScript,5.3+,--


### AI & Orchestration

ai_tech[5]{component,technology,decision}
Orchestration,Claude Agent SDK,"DD-002, DD-086"
Primary LLM,Anthropic Claude (BYOK),DD-002
Latency LLM,Google Gemini Flash (BYOK),DD-011
Embeddings,Google Gemini gemini-embedding-001 (BYOK),"DD-011, DD-070"
Streaming,SSE via FastAPI StreamingResponse,DD-066

See [Provider Routing (DD-011)](#provider-routing-dd-011) for task-to-provider mapping and fallback chain.


### Infrastructure & Platform

infra_tech[8]{component,technology,decision}
Database,PostgreSQL 16+ with pgvector,DD-060
Auth,Supabase Auth (GoTrue) + RLS,DD-061
Cache,Redis 7 (sessions 30-min TTL; AI cache 7-day TTL),--
Search,Meilisearch 1.6 (typo-tolerant full-text),--
Queues,Supabase Queues (pgmq + pg_cron),DD-069
Storage,Supabase Storage (S3-compatible),DD-060
Realtime,Supabase Realtime (Phoenix WebSocket),DD-060
Secrets,Supabase Vault (AES-256-GCM),DD-060


---

## Production Architecture Overview

### Infrastructure Topology

Three-tier containerized architecture with dependencies flowing inward: Presentation → Application → Infrastructure.

**Frontend Tier** (Next.js 14, App Router): SSR, REST API for CRUD, SSE for AI streaming. Auth via Supabase JWT (cookies for SSE, Bearer for REST).

**Backend Tier** (FastAPI on port 8000): Clean Architecture with 5 layers: Presentation → Application (CQRS-lite) → Domain → Infrastructure → AI. PilotSpaceAgent orchestrator runs within this tier.

**Data Tier**: PostgreSQL 16+ with RLS for multi-tenant isolation. pgvector for 768-dim HNSW-indexed embeddings. Redis for session/AI caching. Meilisearch for full-text search. Supabase Queues (pgmq) for async jobs.

**External Services**: Anthropic Claude API, Google Gemini API, GitHub API, Slack API (all BYOK where applicable).

### Request Flows

**Standard CRUD**: Frontend → REST → Middleware (auth, rate limit) → Router → Service → Domain Entity → Repository → Commit + Events → Response.

**AI Conversation**: Frontend → SSE POST `/api/v1/ai/pilot-space/chat` → PilotSpaceAgent syncs note → SDK processes with MCP tools → Tool handler creates operation payload → Backend transforms → SSE events (message_start, text_delta, tool_use, tool_result, message_stop) → Frontend store updates.

**Ghost Text** (<2s): 500ms typing pause → SSE GET → GhostTextAgent (Gemini Flash) → Streaming tokens → TipTap renders at 40% opacity → Tab accept, Escape dismiss.

**AI PR Review** (<5min): GitHub webhook → Queue (pgmq) → PRReviewAgent (Claude Opus) → Comments posted to GitHub PR with severity tags → SSE notification.

### Note-First Data Flow

1. **Capture**: User opens app → Note Canvas is home. User writes freely in block-based editor.
2. **AI Assists**: 500ms pause triggers ghost text. Margin annotations detect ambiguity. Threaded AI discussions per block.
3. **Extract**: `extract_issues` categorizes items as Explicit/Implicit/Related. Rainbow-bordered boxes wrap source text.
4. **Approve**: Human-in-the-loop (DD-003). User previews, edits, approves. Destructive actions always require approval.
5. **Track**: Issues link back via `NoteIssueLink` (EXTRACTED). Inline `[PS-42]` badges. Bidirectional updates.

### Multi-Tenant Isolation

**RLS**: Every table has Row-Level Security. Policies use `auth.uid()` + `auth.user_workspace_ids()`. Four roles: owner, admin, member, guest. Default-deny.

**Agent Sandboxing**: Isolated workspace at `/sandbox/{user_id}/{workspace_id}/` with `.claude/` and `notes/` directories. API keys encrypted via Supabase Vault (AES-256-GCM).

**Session Security**: 256-bit session IDs, IP binding, 24h TTL, Redis with 30-min sliding expiration, PostgreSQL persistence for resumption.

---

## AI Agent Architecture

### Design Philosophy (DD-086)

Migrated from 13 siloed agents to a **centralized conversational agent**. Single `PilotSpaceAgent` orchestrator handles all AI through:

- **Skills**: Single-turn, stateless, filesystem-based (`.claude/skills/`). For focused tasks (extraction, enhancement, duplicates). Invoked via slash commands or intent detection.
- **Subagents**: Multi-turn, stateful, spawned by orchestrator. For complex tasks (PR review, AI context, docs). Results flow through orchestrator's SSE stream.

### Agent Roster

agents[5]{agent,type,model,latency,purpose}
GhostTextAgent,Independent,Gemini Flash,<2s,Inline completions on 500ms typing pause; max 50 tokens; code-aware
PilotSpaceAgent,Orchestrator,Claude Sonnet,<10s,Routes requests to skills/subagents; manages sessions; note sync; tool auth
PRReviewAgent,Subagent,Claude Opus,<5min,Unified code review (architecture; security; quality; docs) with severity tags
AIContextAgent,Subagent,Claude Opus,<30s,Aggregates issue context: related issues; notes; code files; dependency graphs
DocGeneratorAgent,Subagent,Claude Sonnet,<60s,Generates ADR; API docs; technical specs from code/issues/notes


### Skill System (DD-087)

Filesystem-based `.claude/skills/` with YAML frontmatter, auto-discovered by SDK.

skills[8]{skill,purpose,output}
extract-issues,Detect actionable items; categorize Explicit/Implicit/Related,Issue candidates with title/description/priority/type
enhance-issue,Improve issue quality at creation,Enhanced title; acceptance criteria; suggested labels
improve-writing,Enhance text clarity preserving meaning,Improved text preserving user voice
summarize,Multi-format content summarization,Bullet; executive; or detailed breakdown
find-duplicates,Semantic similarity detection (threshold: 70%),Ranked similar issues with scores
recommend-assignee,Expertise matching for team members,Ranked assignees with expertise %
decompose-tasks,Break features into subtasks,Subtask list with Fibonacci points; dependency graph
generate-diagram,Create architecture diagrams,Mermaid or PlantUML output


### Human-in-the-Loop Approval (DD-003)

**Non-destructive** → Auto-execute, notify (labels, ghost text, annotations, auto-transition).
**Content creation** → Require approval, configurable (create issues, PR comments, docs).
**Destructive** → **Always require approval** (delete issues, merge PRs, archive workspaces).

Implementation: SDK `canUseTool` → `PermissionHandler` → `ApprovalStore` with 24h auto-expiry.

### MCP Note Tools (6 tools)

Registered via `create_note_tools_server()`. All return operation payloads (`status: pending_apply`), not direct DB mutations. Backend `transform_sdk_message()` converts markdown to TipTap JSON and emits SSE `content_update` events.

mcp_tools[6]{tool,operation,use_case}
update_note_block,Replace or append block content,Precise text modification by block ID
enhance_text,Improve clarity without meaning change,Professional polish; expand abbreviations
summarize_note,Read full note with metadata,Context gathering before modifications
extract_issues,Create multiple linked issues from blocks,Bulk extraction from meeting notes
create_issue_from_note,Create single linked issue,Convert selection to bug/feature/task
link_existing_issues,Search and link workspace issues,Find related work; duplicate prevention


### Provider Routing (DD-011)

Agentic (PR review, AI context) → Anthropic Claude Opus/Sonnet. One-shot (enhance, summarize) → Claude Sonnet via `query()`. Latency-critical (ghost text) → Google Gemini 2.0 Flash. Embeddings (search, RAG) → Google Gemini gemini-embedding-001.

Fallback chain on circuit breaker (5 failures / 60s recovery). Prompt caching (`cache_control: ephemeral`) saves 63%. Context window pruned at 50k tokens, preserving 10 most recent messages.

### Error Handling & Resilience

- **Retry**: `ResilientExecutor` exponential backoff (1s base, 60s cap, 30% jitter, 3 attempts). Retries on timeout/rate limit only.
- **Circuit Breaker**: Per-provider. CLOSED → OPEN (5 failures) → HALF_OPEN (60s, 1 probe).
- **SSE Abort**: Backend `AbortController`. Frontend max 3 reconnects with exponential backoff.
- **Offline Queue**: pgmq when API unavailable, retry on reconnection.
- **Cost Tracking**: Per-request token logging, per-provider pricing, budget alerts at 90%.

---

## Design Decisions Summary

88 decisions in `docs/DESIGN_DECISIONS.md`. Key decisions by category:

### Foundational (DD-001 to DD-013)

dd_foundational[8]{id,decision,rationale}
DD-001,FastAPI replaces Django,Async-first; OpenAPI; Pydantic v2 native
DD-002,BYOK + Claude Agent SDK,Users control costs; no vendor lock-in; Claude best for code
DD-003,Critical-only AI approval,Balance speed with safety
DD-004,MVP: GitHub + Slack only,Focus scope on largest market share
DD-005,No real-time collab in MVP,Last-write-wins; Supabase Realtime for Phase 2
DD-006,Unified AI PR Review,Single pass cheaper; cross-aspect references
DD-011,Provider routing per task,Optimize cost/latency per task type
DD-013,Note-First workflow,Core differentiator


### Infrastructure (DD-059 to DD-070)

dd_infra[8]{id,decision,impact}
DD-060,Supabase platform,Consolidates 10+ services; 60-90% cost savings
DD-061,Supabase Auth + RLS,Database-level authorization; defense-in-depth
DD-064,CQRS-lite + Service Classes,Clean command/query separation without Event Sourcing
DD-065,MobX (UI) + TanStack Query (server),MobX for observable state; TanStack for caching
DD-066,SSE for AI streaming,Simpler than WebSocket; HTTP/2 compatible; cookie auth
DD-067,Ghost text: 500ms/50 tokens/code-aware,Balance responsiveness with cost
DD-069,Supabase Queues (pgmq),Native PostgreSQL; exactly-once; 3 priority levels
DD-070,Gemini embeddings 768-dim HNSW,Best quality; sub-linear search on 100K+ vectors


### Agent Architecture (DD-086 to DD-088)

DD-086: Centralized agent (1+3+8) → unified context, single SSE stream, 8K token budget.
DD-087: Filesystem skill system → auto-discovery, version-controlled, easy to modify.
DD-088: MCP tool registry → RLS-enforced, operation payloads, decorator-based.

---

## Development Commands

### Backend (Python 3.12+)

Setup: `cd backend && uv venv && source .venv/bin/activate && uv sync && pre-commit install`

Dev server: `uvicorn pilot_space.main:app --reload --host 0.0.0.0 --port 8000`

Quality gates: `uv run pyright && uv run ruff check && uv run pytest --cov=.`

Migrations: `alembic revision --autogenerate -m "Description"` then `alembic upgrade head`

### Frontend (Node 20+, pnpm 9+)

Setup: `cd frontend && pnpm install`

Dev server: `pnpm dev`

Quality gates: `pnpm lint && pnpm type-check && pnpm test`

E2E: `pnpm test:e2e`

### Docker Compose

`docker compose up -d` → Frontend :3000, Backend API :8000/docs, Supabase Studio :54323

---

## Project Structure

**Backend** (`backend/src/pilot_space/`): 5-layer Clean Architecture

- `api/v1/` — 20 FastAPI routers + Pydantic v2 schemas + middleware (auth, CORS, rate limiting, RFC 7807 errors)
- `domain/` — Rich domain entities (Issue, Note, Cycle) with behavior + validation, domain services (pure logic, no I/O)
- `application/services/` — 8 domain services: note (CRUD + ContentConverter + AIUpdate), issue (state machine + Meilisearch), cycle (velocity + rollover), ai_context, annotation, discussion, integration (GitHub sync)
- `ai/` — PilotSpaceAgent orchestrator + subagents, Claude Agent SDK integration (config, sessions, permissions, hooks), MCP tools (6 note + DB + search + GitHub), providers (routing, mock, factory), prompts, session management (Redis + PostgreSQL), infrastructure (cost tracking, Vault keys, rate limiting, circuit breaker), workers (async queue consumer)
- `infrastructure/` — 22 SQLAlchemy models, 15 repositories, 21 Alembic migrations, RLS helpers, Redis cache, pgmq queue, Supabase JWT auth, Meilisearch client
- `spaces/` — Agent workspace sync (SpaceManager, LocalFileSystemSpace, ProjectBootstrapper)
- `integrations/` — GitHub (OAuth, API, webhooks, sync) + Slack (placeholder)
- Root files: `config.py` (Pydantic Settings), `container.py` (DI container), `dependencies.py` (FastAPI Depends), `main.py` (lifespan, routers, middleware)

**Frontend** (`frontend/src/`): Feature-based architecture

- `app/` — Next.js App Router: auth, workspace/[slug], public routes
- `features/` — Domain modules: notes (canvas + 13 TipTap extensions + ghost text), issues (detail + AI context + duplicates), ai (ChatView 25-component tree), approvals, cycles (board + charts), github (PR review), costs (dashboard + charts), settings (AI providers + integrations)
- `components/` — Shared UI (25 shadcn/ui primitives + custom), editor (canvas + toolbar + annotations + TOC + history), layout (shell + sidebar + header + outline)
- `stores/` — MobX: RootStore, AuthStore, UIStore, WorkspaceStore, 11 AI stores (PilotSpaceStore, GhostTextStore, ApprovalStore, etc.)
- `services/api/` — 9 typed API clients with RFC 7807 error handling
- `hooks/`, `lib/` (supabase, SSE client, query client), `types/`

---

## Quality Gates

**Backend**: `uv run pyright && uv run ruff check && uv run pytest --cov=.`

**Frontend**: `pnpm lint && pnpm type-check && pnpm test`

### Non-Negotiable Standards

quality_gates[9]{standard,enforcement}
Strict type checking (pyright / TypeScript strict),Pre-commit; CI
Test coverage > 80%,pytest-cov; vitest
No N+1 queries,SQLAlchemy eager loading; review
No blocking I/O in async functions,pyright analysis; review
File size: 700 lines max,Pre-commit
No TODOs; mocks; placeholder code,Pre-commit
AI features respect DD-003 (human-in-the-loop),PermissionHandler; review
RLS verified for multi-tenant data,DB enforcement; integration tests
Conventional commits,feat|fix|refactor|docs|test|chore(scope): description


---

## Architecture Patterns

**Load `docs/dev-pattern/45-pilot-space-patterns.md` first** for project-specific patterns.

### Backend Patterns

backend_patterns[8]{pattern,implementation,rationale}
CQRS-lite (DD-064),Service.execute(Payload) → Result,Separate read/write without Event Sourcing
Repository,BaseRepository[T] + 15 repos; async SQLAlchemy,Abstract persistence; testable; RLS-enforced
Unit of Work,SQLAlchemyUnitOfWork transaction boundaries,Atomic operations + event publishing
Domain Events,IssueCreated; IssueStateChanged after commit,Decouple side effects
DI (DD-064),dependency-injector: Singleton (config/engine); Factory (repos/sessions),Testable; explicit; no global state
Errors,RFC 7807 Problem Details,Standard machine-readable format
Validation,Pydantic v2 at boundary; domain invariants in entities,Fail fast at edge; rich behavior inside
Auth (DD-061),Supabase Auth + RLS: JWT → workspace_id → RLS enforcement,Defense-in-depth


### AI Agent Patterns

ai_patterns[9]{pattern,implementation,rationale}
Centralized agent (DD-086),PilotSpaceAgent orchestrator + skills + subagents,Unified context; eliminates 13 siloed agents
SDK integration (DD-002),query() one-shot; ClaudeSDKClient multi-turn,Fast for simple; stateful for complex
Skill system (DD-087),Filesystem .claude/skills/ YAML frontmatter,Auto-discovered; version-controlled
MCP tools (DD-088),create_sdk_mcp_server() for domain operations,RLS-enforced; operation payloads
Provider routing (DD-011),See Provider Routing section,Optimize cost/latency + fallback chain
Approval (DD-003),canUseTool → PermissionHandler → ApprovalStore,Human oversight; configurable autonomy
Streaming (DD-066),SSE; 8 event types,Real-time; simpler than WebSocket
Resilience,ResilientExecutor + CircuitBreaker per provider,Prevent cascade; graceful degradation
Sessions,Redis (30-min hot) + PostgreSQL (durable),Fast resumption + persistent history


### Frontend Patterns

frontend_patterns[7]{pattern,implementation,rationale}
State split (DD-065),MobX for UI; TanStack Query for server data,Clear ownership; never store API data in MobX
Feature folders,features/{domain}/ per business domain,Colocated components; hooks; stores
Editor extensions,13 TipTap extensions (independently testable),Modular editor capabilities
Optimistic updates,TanStack onMutate + snapshot + rollback,Instant feedback; MobX tracks in-flight ops
SSE handling,Custom sse-client.ts (fetch ReadableStream for POST),EventSource is GET-only; custom supports POST + auth
Auto-save,MobX reaction → 2s debounce → saveNote(),No save button; dirty state tracked
Accessibility,WCAG 2.2 AA: keyboard nav; ARIA; focus management; prefers-reduced-motion,Inclusive by default


---

## UI/UX Design System

*Source: `specs/001-pilot-space-mvp/ui-design-spec.md` v4.0*

### Design Philosophy

Three adjectives: **Warm, Capable, Collaborative**.

**Inspirations**: Craft (layered surfaces), Apple (squircle corners, frosted glass), Things 3 (natural colors, spacious calm).

**NOT**: Cold enterprise software, generic shadcn/ui defaults, AI as separate "system", dense displays.

### Color System

#### Base Palette (Warm Neutrals)

base_palette[6]{token,light,dark,usage}
--background,#FDFCFA,#1A1A1A,Primary surface
--background-subtle,#F7F5F2,#1F1F1F,Secondary surface
--foreground,#171717,#EDEDED,Primary text
--foreground-muted,#737373,#999999,Secondary text
--border,#E5E2DD,#2E2E2E,Borders
--border-subtle,#EBE8E4,#262626,Subtle borders


#### Accent Colors

accent_colors[7]{token,value,usage}
--primary,#29A386 / #34B896,Primary actions (teal-green)
--primary-hover,#238F74,Hover state
--primary-muted,#29A38615,Subtle backgrounds
--ai,#6B8FAD / #7DA4C4,AI elements (dusty blue)
--ai-muted,#6B8FAD15,AI annotation backgrounds
--ai-border,#6B8FAD30,AI element borders
--destructive,#D9534F / #E06560,Delete/remove actions


#### Issue State Colors

Backlog `#9C9590`, Todo `#5B8FC9`, In Progress `#D9853F`, In Review `#8B7EC8`, Done `#29A386`, Cancelled `#D9534F`

#### Priority Colors

Urgent `#D9534F` (4 bars), High `#D9853F` (3 bars), Medium `#C4A035` (2 bars), Low `#5B8FC9` (1 bar), None `#9C9590` (line)

### Typography

**Fonts**: Geist (UI), Geist Mono (code). Fallbacks: system-ui, SF Mono.

typography[7]{name,size_lh_weight,usage}
text-xs,11px/16px/400,Labels; badges
text-sm,13px/20px/400,Body; descriptions
text-base,15px/24px/400,Primary content
text-lg,17px/26px/500,Card titles
text-xl,20px/28px/600,Section headers
text-2xl,24px/32px/600,Page titles
text-3xl,30px/38px/700,Hero text


Rules: `text-balance` on headings, `tabular-nums` for metrics, AI voice uses regular weight italic.

### Spacing, Radius & Effects

**Spacing** (4px grid): space-1 (4), space-2 (8), space-3 (12), space-4 (16), space-6 (24), space-8 (32), space-12 (48), space-16 (64).

**Border Radius** (squircle): `rounded-sm` 6px, `rounded` 10px, `rounded-lg` 14px, `rounded-xl` 18px, `rounded-2xl` 24px, `rounded-full` 9999px.

**Shadows**: Warm-tinted, layered. Levels: SM, Standard, MD, LG, Elevated.

**Noise Overlay**: 2% opacity, multiply blend (removed in dark mode).

**Frosted Glass**: 20px blur, 180% saturation, 72% bg opacity. For modals, popovers, overlays.

### Component Design Language

**Buttons**: 6 variants (default/secondary/outline/ghost/destructive/ai). 5 sizes (sm 32px, default 38px, lg 44px, icon 38px, icon-sm 32px). Hover: scale 2% + shadow. Active: scale back. Focus: 3px teal ring 30%.

**Cards**: 4 variants (default/elevated/interactive/glass). Interactive: translateY -2px + scale 1% + shadow on hover (200ms).

**Inputs**: 38px height, rounded 10px, 14px font, focus primary border + 3px ring.

**Modals**: 40% overlay + 8px blur. Content: frosted glass, rounded-xl, shadow LG.

**Dark Mode**: `class="dark"` toggle, respects `prefers-color-scheme`, 200ms transition. Sidebar `#161616`, noise removed, ghost text 30% opacity, VS Code Dark+ for code.

---

## Page & Feature Catalog

*Full wireframes: `specs/001-pilot-space-mvp/ui-design-spec.md` Sections 7-9*

### Application Layout

**AppShell**: Sidebar (260px/60px collapsed) + Header (56px) + Main (max 1200px, unlimited for editor). Sidebar: workspace selector, navigation, project tree, settings/user footer.

### Pages

pages[12]{page,route,capabilities}
Login,/login,Centered form; email/password + OAuth; Zod validation
Home,/[workspaceSlug],Redirects to Notes List (DD-013: Note Canvas = home)
Notes List,.../notes,Grid/List toggle; search; sort; filters; infinite scroll; pinned section
Note Editor,.../notes/[noteId],**Primary page** -- 65/35 split (canvas + ChatView); full bleed; auto-save 2s
Issues,.../issues,Board (6-col Kanban)/List/Table; filters; keyboard nav (C/J/K/Enter)
Issue Detail,.../issues/[issueId],70/30 split; inline edit; AI Context tabs; activity timeline
Projects,.../projects,3-col grid; progress bars; active cycle info
Cycle Detail,.../cycles/[cycleId],Burndown + Velocity charts (Recharts); filtered issue board
AI Chat,.../chat,Full-page ChatView; session list (recent 5); workspace-wide
Approvals,.../approvals,Tabs (Pending/Approved/Rejected/Expired); countdown timer; content diff
AI Costs,.../costs,Summary cards; cost-by-agent chart; trends chart; export CSV
Settings,.../settings/*,General; Members; AI Providers (key management + feature toggles); Integrations (GitHub + Slack)


### Note Canvas (Primary Entry Point)

**Layout**: Outline Tree (220px left) + Document Canvas (65%, max 720px, 32px padding) + Margin Annotations (200px right) + ChatView (35%, min 320px). Resizable 4px drag handle.

**Editor Features** (13 TipTap extensions): Block ID assignment/preservation, ghost text autocomplete (Tab/Right Arrow/Escape), margin annotation marks with CSS Anchor Positioning, auto-trigger after >20% block delta, inline issue badges with state colors, inline issue extraction boxes with rainbow border, syntax-highlighted code blocks, @mentions for notes/issues/agents, /slash commands for block types, custom Enter handling preserving block IDs, floating selection toolbar (formatting + AI actions).

**Rich Note Header**: Title, created/edited dates, word count, reading time (~200 WPM), AI topic tags (max 3).

**Auto-Generated TOC**: Fixed 200px right panel, current section highlighted, smooth scroll, auto-collapses below 1024px.

**Issue Extraction Flow**: AI identifies items → rainbow-bordered boxes (2px gradient: primary→blue→purple→pink). Bidirectional sync: state↔badge, note edits→issue sync (requires approval).

**Empty Note**: Pilot star icon, "What would you like to work on?", suggested templates, blank note option.

### ChatView System

Dual-context: embedded in Note Editor (35% sidebar) and full-page AI Chat.

**Functional areas**: Header (title, session selector, streaming indicator), message list (auto-scroll, grouped by role, streaming with blinking cursor, expandable tool details), task panel (collapsible, active/completed with progress bars), chat input (auto-expanding 1-6 rows, context badges, /skill menu, @agent menu), approval overlay (modal, non-dismissable, 24h expiry countdown).

**UI State Machine**: IDLE → STREAMING → APPROVAL_PENDING → IDLE. Skill/Agent menus from IDLE. Input disabled during streaming and approval.

**SSE Events**: message_start, text_delta, tool_use, tool_result, task_progress, approval_request, content_update, message_stop, error.

### AI Collaborative Features

**Ghost Text**: 40% muted italic, 150ms fade-in, 500ms trigger, Tab accept all, Right Arrow word-by-word, Escape dismiss. Disabled in code blocks.

**Selection Toolbar**: Floating on selection. Standard formatting + AI actions (Improve, Simplify, Expand, Ask, Extract). AI buttons: dusty blue styling.

**Confidence Tags**: Recommended (primary), Default (muted), Current (AI blue), Alternative (dashed border).

**Empty States**: All pages follow consistent pattern -- 80px illustration, text-lg heading, muted description, primary CTA, 48px padding.

**Error States**: Network offline (amber banner + retry), API 5xx (red banner), 401 (redirect), 403 (inline), 404 (full-page), AI key missing/invalid (banner/toast), rate limited (countdown), SSE disconnect (auto-reconnect max 3), auto-save failure (IndexedDB fallback).

### Interaction Patterns

**Drag & Drop**: Elevated shadow on lift, 4px drop indicator, 200ms transitions, Escape cancel.

**Hover/Focus**: Cards translateY -2px, buttons scale 2%, all elements 3px primary ring 30% on focus.

**Loading**: Skeleton shimmer 1.5s, button spinner, AI animated ellipsis, streaming blinking cursor.

**Key Animations**: Button hover 150ms, card hover 200ms, ghost text appear 150ms, loading shimmer 1.5s, rainbow pulse 2s, toast 200ms, sidebar collapse 200ms, modal 200ms, dropdown 150ms.

**Reduced Motion**: All animations instant via `prefers-reduced-motion`, Tailwind `motion-safe:`/`motion-reduce:`.

### Keyboard Shortcuts

Global: `Cmd+P` (palette), `Cmd+K` (search), `Cmd+N` (new note), `?` (guide), `F6` (focus regions). Navigation: `G H`/`G I`/`G C`/`G S`. Lists: `C` (new issue), `J`/`K` (nav), `Enter` (open). Editor: `/` (slash), `@` (mention), `Tab` (ghost text), `Escape` (dismiss).

### Accessibility

WCAG 2.2 AA: 4.5:1 text contrast, 3px focus rings, keyboard-accessible, ARIA labels/roles/live regions, 44px touch targets, 200% zoom functional. Focus traps in modals, F6 region cycling, `aria-live` for AI streaming/tasks/approvals/toasts.

### Responsive Breakpoints

sm (640px), md (768px), lg (1024px), xl (1280px), 2xl (1536px), 3xl (1920px).

**Note Editor**: 3xl full canvas + ChatView, xl-2xl 65/35, lg ChatView overlay 400px, md overlay 70%, sm ChatView full-screen modal with FAB toggle.

**Issue Board**: xl+ 6 cols, lg 4+scroll, md 3+scroll, sm accordion.

**Mobile**: Hamburger sidebar, full-screen modals/palette, 44px targets, swipe gestures, pull-to-refresh.

### Performance Targets

FCP <1.5s, LCP <2.5s, TTI <3s, CLS <0.1, INP <200ms.

Virtual scroll (`@tanstack/react-virtual`) for 500+ blocks. Dynamic imports for >50KB gzipped (Recharts, Mermaid, AI Panel).

---

## Key Entities

entities[10]{entity,purpose,relationships}
Note,Block-based TipTap document; home view default,Has annotations; issue links; discussions
NoteAnnotation,AI margin suggestion per block (suggestion/question/issue_detected),Belongs to Note + block_id; confidence 0-1
NoteIssueLink,Bidirectional note↔issue connection,CREATED/EXTRACTED/REFERENCED types; sync_direction
Issue,Work item with state machine; AI-enhanced at creation,Belongs to Project; has State/Cycle/Labels/Assignee
AIContext,Aggregated issue context: docs; code (AST-aware); tasks; prompts,Belongs to Issue
Cycle,Sprint container with velocity metrics,Contains Issues; belongs to Project
Module,Epic grouping with progress tracking,Contains Issues; optional hierarchy
ChatSession,Multi-turn conversation; SDK session for resumption,Has messages; 24h TTL
ChatMessage,Role + content + tool_calls + token_usage,Belongs to ChatSession
TokenUsage,Per-request BYOK cost tracking,prompt/completion/cached tokens; cost_usd


**Issue State Machine**: Backlog → Todo → In Progress → In Review → Done. Any → Cancelled. Done → Todo (reopen). No skipping (e.g., Backlog → Done invalid).

---

## Current Implementation Status

**Overall MVP**: 75-80% | **Remaining**: ~43 tasks

### Backend (69,435 lines Python)

backend_status[7]{layer,completion}
API (20 routers),95%
Application Services (8 domains),90%
Domain (entities; value objects),95%
Infrastructure (22 models; 15 repos; 21 migrations),95%
AI Agent (PilotSpaceAgent; SDK; sessions),85%
AI Tools (6 note tools; search; DB; GitHub),70%
AI Infrastructure (cost; keys; rate limit; resilience),90%


### Frontend (60,010 lines TypeScript)

frontend_status[9]{feature,completion}
ChatView (25 components),95%
MobX Stores (12 stores),80%
UI Components (25 shadcn/ui),95%
API Services (9 clients),90%
Note Editor (TipTap; 13 extensions),65%
Ghost Text,30%
Margin Annotations,25%
Issue Extraction UI,30%
Cycle/Sprint Charts,60%


### Critical Remaining Work

1. Ghost Text Extension -- TipTap extension + SSE streaming (P4-005:009)
2. Margin Annotations UI -- card + positioning + real-time sync (P4-010:013)
3. Issue Extraction Approval -- preview modal + diff + bulk ops (P4-014:017)
4. Note MCP Tools E2E -- all 6 tools tested (P3-005:010)
5. PilotSpaceStore Wiring -- MobX → API → SSE mapping (P4-001:002)
6. SSE Transform Pipeline -- SDK message → Frontend event (P3-014:015)
7. E2E Tests -- 6 critical paths + perf + security (P5-001:024)

---

## Implementation Roadmap

See `docs/architect/pilotspace-implementation-plan.md` for full 173-task plan.

roadmap[6]{phase,name,tasks,status}
1,Foundation & SDK Integration,25,85% Done
2,Skill Migration,11,70% Done
3,Backend Consolidation,15,80% Done
4,Frontend Architecture,34,60% Done
5,Integration & Testing,26,15% Started
6,Polish & Refinement,41,Not Started


**Critical Path**: P3 MCP Tools E2E → P4 PilotSpaceStore → P4 Ghost Text → P4 Annotations → P4 Issue Extraction → P5 E2E Tests → MVP

---

## Documentation Entry Points

### Specifications

spec_docs[6]{topic,document}
MVP specification,specs/001-pilot-space-mvp/spec.md
MVP implementation plan,specs/001-pilot-space-mvp/plan.md
Phase 2/3 specs,specs/002-*/spec.md; specs/003-*/spec.md
Data model (21 entities),specs/001-pilot-space-mvp/data-model.md
UI/UX spec (v4.0),specs/001-pilot-space-mvp/ui-design-spec.md
Business design (v2.0),specs/001-pilot-space-mvp/business-design.md


### Architecture (docs/architect/)

arch_docs[8]{topic,document}
Architecture overview,docs/architect/README.md
Agent architecture,docs/architect/pilotspace-agent-architecture.md
Implementation plan (detailed),docs/architect/pilotspace-implementation-plan.md
Claude SDK integration,docs/architect/claude-agent-sdk-architecture.md
Feature-to-component mapping,docs/architect/feature-story-mapping.md
Backend architecture,docs/architect/backend-architecture.md
Frontend architecture,docs/architect/frontend-architecture.md
RLS security patterns,docs/architect/rls-patterns.md


### Standards & Patterns

pattern_docs[5]{topic,document}
Architecture decisions (88),docs/DESIGN_DECISIONS.md
Dev patterns (start here),docs/dev-pattern/README.md
Pilot Space patterns,docs/dev-pattern/45-pilot-space-patterns.md
MobX patterns,docs/dev-pattern/21c-frontend-mobx-state.md
Feature specs (17 features),docs/PILOT_SPACE_FEATURES.md


---

## Dev-Pattern Quick Reference

Load order for new features:

1. `feature-story-mapping.md` → Find US-XX and components
2. `45-pilot-space-patterns.md` → Project-specific overrides
3. Domain-specific pattern → (e.g., 07-repository, 20-component)
4. Cross-cutting patterns → (e.g., 26-di, 06-validation)

**Pilot Space Overrides** (from pattern 45): Zustand→MobX (complex observable state, auto-save reactions). Custom JWT→Supabase Auth+RLS (database-level auth). Kafka→Supabase Queues/pgmq (native PostgreSQL, exactly-once).

---

## AI Agent Instructions

### For All Agents

- Read this file first before implementation work
- Load dev patterns in the order above
- Check `feature-story-mapping.md` for affected components
- Follow quality gates (see [Quality Gates](#quality-gates) and [Development Commands](#development-commands))
- 700 lines max per file. Conventional commits.

### For Backend Agents

- CQRS-lite: `Service.execute(Payload) → Result`, not direct DB manipulation
- dependency-injector for DI (Singleton config/engine, Factory repos/sessions)
- RFC 7807 Problem Details for all errors
- Async SQLAlchemy (`AsyncSession`) only. No blocking I/O.
- Verify RLS policies for all multi-tenant queries (scoped by `workspace_id`)
- AI features respect DD-003 (human-in-the-loop via PermissionHandler)
- New AI goes through PilotSpaceAgent as skills or subagents

### For Frontend Agents

- MobX for client state (`makeAutoObservable`, `observer()`). Never store API data in MobX.
- TanStack Query for server state (`useQuery` reads, `useMutation` with optimistic updates)
- shadcn/ui base components, extend with feature variants
- WCAG 2.2 AA: keyboard nav, ARIA labels, focus management
- AI interactions through PilotSpaceStore (unified), not siloed stores
- SSE event mapping per `pilotspace-agent-architecture.md` section 8

### For AI/Agent Layer Agents

- PilotSpaceAgent is the single orchestrator -- no new independent agents
- Simple → skills (`.claude/skills/`). Complex → subagents.
- All tools return operation payloads (`status: pending_apply`), not direct mutations
- ContentConverter for TipTap ↔ Markdown with block ID preservation
- SSE: SDK message → `transform_sdk_message()` → Frontend event
- Prompt caching enabled (`cache_control: ephemeral`)
- ResilientExecutor for retries, CircuitBreaker for provider failures

### For Testing Agents

- Backend: pytest `--cov=.`, async with pytest-asyncio, fixture-based DB sessions
- Frontend: Vitest unit, Playwright E2E
- Coverage > 80%
- E2E critical paths: skill invocation, subagent invocation, approval flow, session resumption, error recovery
