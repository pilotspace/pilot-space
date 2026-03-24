# Knowledge Graph Generation Pipeline — Complete Flow

## Overview

The knowledge graph (KG) generation pipeline is a **background job workflow** that automatically populates graph nodes and edges whenever SDLC entities (issues, notes, projects, cycles) are created or regenerated. The pipeline uses a **message queue** (Supabase pgmq via `SupabaseQueueClient`) for reliable job processing with support for retry and dead-letter handling.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ENTRY POINTS (Synchronous)                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  1. Create/Update Services enqueue kg_populate jobs:                    │
│     • CreateIssueService       (line 243–259)                           │
│     • CreateNoteService        (line 216–232)                           │
│     • CreateCycleService       (line 158–174)                           │
│     • UpdateIssueService       (if changed, NOT always)                 │
│                                                                           │
│  2. Regeneration Endpoints manually re-enqueue:                         │
│     • POST /issues/{id}/knowledge-graph/regenerate                      │
│     • POST /projects/{id}/knowledge-graph/regenerate                    │
│     • Frontend calls knowledgeGraphApi.regenerateIssueGraph()           │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                    QUEUE MESSAGE (AI_NORMAL Queue)                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  Message Payload Structure:                                             │
│  {                                                                       │
│    "task_type": "kg_populate",                                          │
│    "entity_type": "issue|note|project|cycle",                          │
│    "entity_id": "<UUID>",                                               │
│    "workspace_id": "<UUID>",                                            │
│    "project_id": "<UUID>"  (or same as entity_id for projects)         │
│  }                                                                       │
│                                                                           │
│  Queue: Supabase pgmq (managed by SupabaseQueueClient)                 │
│  Name: QueueName.AI_NORMAL ("ai_normal")                               │
│  Visibility timeout: 120 seconds                                        │
│  Retry mechanism: 2 attempts before dead-letter                         │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│              MemoryWorker (Background Loop - memory_worker.py)          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  1. Continuously polls AI_NORMAL queue (batch_size=1)                  │
│  2. Calls _dispatch() to route by task_type                            │
│  3. For task_type="kg_populate":                                       │
│     → Creates KgPopulateHandler instance                               │
│     → Calls handler.handle(payload)                                    │
│     → Wraps in per-job AsyncSession (request-scoped)                   │
│  4. On success: ack() the message                                      │
│  5. On failure (attempts < 2): nack() for retry                        │
│  6. On repeated failure: move_to_dead_letter()                         │
│  7. Commits the single transaction for this job                        │
│                                                                           │
│  File: backend/src/pilot_space/ai/workers/memory_worker.py             │
│  Key methods:                                                           │
│    - start()                — poll loop                                 │
│    - _process(message)      — dispatch to handler                       │
│    - _dispatch(task_type, payload, session)  — route by type           │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│        KgPopulateHandler.handle(payload)  (kg_populate_handler.py)      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  Parses payload → _KgPopulatePayload                                   │
│  Dispatches by entity_type:                                            │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ entity_type = "issue"  → _handle_issue(payload)                 │   │
│  │ ┌──────────────────────────────────────────────────────────┐    │   │
│  │ │ 1. Fetch IssueModel from DB                             │    │   │
│  │ │ 2. Create parent ISSUE node (GraphWriteService)         │    │   │
│  │ │    - node_type: ISSUE                                   │    │   │
│  │ │    - label: issue name (max 120 chars)                  │    │   │
│  │ │    - content: "{name}\n\n{description}" (max 2000)      │    │   │
│  │ │    - external_id: issue.id                              │    │   │
│  │ │    - properties: {project_id, identifier, state}        │    │   │
│  │ │                                                           │    │   │
│  │ │ 3. IF description.length > 50 chars:                    │    │   │
│  │ │    a. Delete stale NOTE_CHUNK nodes for this issue      │    │   │
│  │ │    b. Chunk markdown by headings (markdown_chunker)     │    │   │
│  │ │    c. Enrich chunks with context (contextual_enrichment)│    │   │
│  │ │    d. Create NOTE_CHUNK nodes for each chunk            │    │   │
│  │ │    e. Create PARENT_OF edges: ISSUE → chunks            │    │   │
│  │ │                                                           │    │   │
│  │ │ 4. Create BELONGS_TO edge: ISSUE node → PROJECT node    │    │   │
│  │ │    (via _link_to_project)                               │    │   │
│  │ │                                                           │    │   │
│  │ │ 5. Find similar project content (embedding search)      │    │   │
│  │ │    → Create RELATES_TO edges with weight score          │    │   │
│  │ │    (via _find_and_link_similar, similarity >= 0.75)     │    │   │
│  │ │                                                           │    │   │
│  │ │ Returns: {                                               │    │   │
│  │ │   "success": True,                                       │    │   │
│  │ │   "node_ids": [...],                                     │    │   │
│  │ │   "chunks": N,                                           │    │   │
│  │ │   "edges": M                                             │    │   │
│  │ │ }                                                         │    │   │
│  │ └──────────────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ entity_type = "note"  → _handle_note(payload)                   │   │
│  │ ┌──────────────────────────────────────────────────────────┐    │   │
│  │ │ 1. Fetch NoteModel from DB                              │    │   │
│  │ │ 2. Advisory lock on note_id (prevent chunk race)        │    │   │
│  │ │ 3. Convert TipTap JSON → Markdown (ContentConverter)    │    │   │
│  │ │ 4. Create parent NOTE node (GraphWriteService)          │    │   │
│  │ │    - node_type: NOTE                                    │    │   │
│  │ │    - label: note title (max 120 chars)                  │    │   │
│  │ │    - content: markdown (max 2000 chars)                 │    │   │
│  │ │    - external_id: note.id                               │    │   │
│  │ │    - properties: {project_id, title}                    │    │   │
│  │ │                                                           │    │   │
│  │ │ 5. Delete stale NOTE_CHUNK nodes for this note          │    │   │
│  │ │ 6. Chunk markdown by headings                           │    │   │
│  │ │ 7. Enrich chunks with context                           │    │   │
│  │ │ 8. Create NOTE_CHUNK nodes                              │    │   │
│  │ │ 9. Create PARENT_OF edges: NOTE → chunks                │    │   │
│  │ │                                                           │    │   │
│  │ │ 10. Create BELONGS_TO edge: NOTE → PROJECT               │    │   │
│  │ │ 11. Find similar content & create RELATES_TO edges       │    │   │
│  │ │                                                           │    │   │
│  │ │ Returns: {success, node_ids, chunks, edges}              │    │   │
│  │ └──────────────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ entity_type = "project"  → _handle_project(payload)             │   │
│  │ ┌──────────────────────────────────────────────────────────┐    │   │
│  │ │ 1. Fetch ProjectModel from DB                           │    │   │
│  │ │ 2. Create PROJECT node (GraphWriteService)              │    │   │
│  │ │    - node_type: PROJECT                                 │    │   │
│  │ │    - label: project name (max 120 chars)                │    │   │
│  │ │    - content: "{name}\n\n{description}"                 │    │   │
│  │ │    - external_id: project.id                            │    │   │
│  │ │    - properties: {project_id, identifier, icon, lead_id}│    │   │
│  │ │                                                           │    │   │
│  │ │ 3. Link existing child nodes (issues/notes/cycles)      │    │   │
│  │ │    to this project with BELONGS_TO edges                │    │   │
│  │ │    (via _link_existing_children)                        │    │   │
│  │ │                                                           │    │   │
│  │ │ 4. Find similar content & create RELATES_TO edges        │    │   │
│  │ │                                                           │    │   │
│  │ │ Returns: {success, node_ids, children_linked, edges}     │    │   │
│  │ └──────────────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ entity_type = "cycle"  → _handle_cycle(payload)                 │   │
│  │ ┌──────────────────────────────────────────────────────────┐    │   │
│  │ │ 1. Fetch CycleModel from DB                             │    │   │
│  │ │ 2. Create CYCLE node (GraphWriteService)                │    │   │
│  │ │    - node_type: CYCLE                                   │    │   │
│  │ │    - label: cycle name (max 120 chars)                  │    │   │
│  │ │    - content: "{name} ({status}) [date_range]..."       │    │   │
│  │ │    - external_id: cycle.id                              │    │   │
│  │ │    - properties: {project_id, status, dates, owner}     │    │   │
│  │ │                                                           │    │   │
│  │ │ 3. Create BELONGS_TO edge: CYCLE → PROJECT              │    │   │
│  │ │ 4. Find similar content & create RELATES_TO edges        │    │   │
│  │ │                                                           │    │   │
│  │ │ Returns: {success, node_ids, edges}                      │    │   │
│  │ └──────────────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│           GraphWriteService.execute(payload)  (graph_write_service.py)  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  Task: Bulk upsert nodes & edges, enqueue embeddings                   │
│                                                                           │
│  Step 1: Convert NodeInput → GraphNode domain objects                  │
│   • Compute content_hash for unkeyed nodes (hash of content)           │
│   • Handle user-scoped types (USER_PREFERENCE, LEARNED_PATTERN) only   │
│   • For workspace-shared types: no user_id in hash                     │
│                                                                           │
│  Step 2: Bulk upsert nodes (single transaction)                        │
│   • Via KnowledgeGraphRepository.bulk_upsert_nodes()                   │
│   • Returns persisted nodes with assigned UUIDs                        │
│   • Uses UPSERT logic (INSERT ... ON CONFLICT ... DO UPDATE)           │
│                                                                           │
│  Step 3: Resolve edge endpoints by external_id or direct node_id       │
│   • Build external_id → node_id lookup from persisted batch            │
│   • Fall back to DB lookup for cross-batch external IDs                │
│                                                                           │
│  Step 4: Upsert each edge                                              │
│   • Via KnowledgeGraphRepository.upsert_edge()                         │
│   • Skip self-loops                                                    │
│   • Count failures (non-fatal)                                         │
│                                                                           │
│  Step 5: Auto-detect issue references                                  │
│   • Scan node content for patterns like "PS-42"                        │
│   • Create RELATES_TO edges to matching nodes                          │
│   • Check both current batch and cross-batch via DB                    │
│                                                                           │
│  Step 6: Flush to assign edge IDs                                      │
│   • await session.flush()  (doesn't commit)                            │
│                                                                           │
│  Step 7: Enqueue embedding jobs (BEFORE commit for crash recovery)     │
│   • For each persisted node_id:                                        │
│   • Create "graph_embedding" task                                      │
│   • Enqueue to AI_NORMAL queue with bounded concurrency (max 10)       │
│   • Enqueue happens with asyncio.Semaphore to prevent queue overflow   │
│                                                                           │
│  Step 8: Commit (if auto_commit=True)                                  │
│   • In KgPopulateHandler, auto_commit=False (MemoryWorker owns commit) │
│   • In other callers, auto_commit=True (default)                       │
│                                                                           │
│  Returns: GraphWriteResult {                                           │
│    node_ids: [persisted node UUIDs],                                   │
│    edge_ids: [persisted edge UUIDs],                                   │
│    embedding_enqueued: bool,                                           │
│    failed_edge_count: int                                              │
│  }                                                                       │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                 NODE/EDGE DATABASE PERSISTENCE (RLS)                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  Tables (with RLS enabled):                                            │
│    • graph_node (persists NodeType/label/content/properties/embedding) │
│    • graph_edge (persists source_id/target_id/edge_type/weight)       │
│                                                                           │
│  RLS Policy: workspace_id isolation                                    │
│    SET app.current_user_id = '<user_id>'  (via set_rls_context)       │
│    All queries filtered by workspace_id                                │
│                                                                           │
│  Node Types Created:                                                   │
│    • ISSUE, NOTE, NOTE_CHUNK, PROJECT, CYCLE                          │
│    (plus ephemeral for GitHub PRs/branches/commits)                    │
│                                                                           │
│  Edge Types Created:                                                   │
│    • BELONGS_TO   (entity → project, structural)                       │
│    • PARENT_OF    (parent → chunk, structural)                         │
│    • RELATES_TO   (semantic similarity, weighted 0.0–1.0)              │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│            Embedding Queue (graph_embedding jobs enqueued above)        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  Message Payload:                                                      │
│  {                                                                       │
│    "task_type": "graph_embedding",                                     │
│    "node_id": "<UUID>",                                                │
│    "workspace_id": "<UUID>",                                           │
│    "enqueued_at": "<ISO timestamp>"                                    │
│  }                                                                       │
│                                                                           │
│  Processing: MemoryWorker._dispatch():                                 │
│    → Creates MemoryEmbeddingJobHandler                                 │
│    → Calls handler.handle_graph_node(payload)                          │
│    → Generates embedding for node.content (via EmbeddingService)       │
│    → Upserts embedding into graph_node.embedding column (pgvector)     │
│                                                                           │
│  This enables later hybrid search (vector + BM25 full-text)            │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                         MemoryWorker Commit                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  Commits the per-job AsyncSession transaction                          │
│  All nodes, edges, and intermediate flush operations persist           │
│  ACKs the queue message                                                │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Detailed Flow: Entry Points

### 1. CreateIssueService (lines 243–259)

**File**: `/Users/tindang/workspaces/tind-repo/pilot-space/backend/src/pilot_space/application/services/issue/create_issue_service.py`

```python
# Enqueue KG populate job (non-fatal)
if self._queue is not None and issue is not None:
    try:
        await self._queue.enqueue(
            QueueName.AI_NORMAL,
            {
                "task_type": "kg_populate",
                "entity_type": "issue",
                "entity_id": str(issue.id),
                "workspace_id": str(payload.workspace_id),
                "project_id": str(payload.project_id),
            },
        )
    except Exception as exc:
        logger.warning("CreateIssueService: failed to enqueue kg_populate: %s", exc)
```

**Trigger**: Issue created via API → `POST /workspaces/{workspace_id}/issues`

---

### 2. CreateNoteService (lines 216–232)

**File**: `/Users/tindang/workspaces/tind-repo/pilot-space/backend/src/pilot_space/application/services/note/create_note_service.py`

```python
# Enqueue KG populate job if note belongs to a project (non-fatal)
if self._queue is not None and payload.project_id is not None:
    try:
        await self._queue.enqueue(
            QueueName.AI_NORMAL,
            {
                "task_type": "kg_populate",
                "entity_type": "note",
                "entity_id": str(created_note.id),
                "workspace_id": str(payload.workspace_id),
                "project_id": str(payload.project_id),
            },
        )
    except Exception as exc:
        logger.warning("CreateNoteService: failed to enqueue kg_populate: %s", exc)
```

**Trigger**: Note created in a project → `POST /workspaces/{workspace_id}/notes`
**Note**: Only enqueues if `payload.project_id is not None` (personal notes don't get graph nodes)

---

### 3. CreateCycleService (lines 158–174)

**File**: `/Users/tindang/workspaces/tind-repo/pilot-space/backend/src/pilot_space/application/services/cycle/create_cycle_service.py`

```python
# Enqueue KG populate job (non-fatal)
if self._queue is not None and cycle is not None:
    try:
        await self._queue.enqueue(
            QueueName.AI_NORMAL,
            {
                "task_type": "kg_populate",
                "entity_type": "cycle",
                "entity_id": str(cycle.id),
                "workspace_id": str(payload.workspace_id),
                "project_id": str(payload.project_id),
            },
        )
    except Exception as exc:
        logger.warning("CreateCycleService: failed to enqueue kg_populate: %s", exc)
```

**Trigger**: Cycle created → `POST /workspaces/{workspace_id}/projects/{project_id}/cycles`

---

### 4. Regeneration Endpoints

**File**: `/Users/tindang/workspaces/tind-repo/pilot-space/backend/src/pilot_space/api/v1/routers/knowledge_graph.py`

#### Single Issue Regeneration (lines 534–577)

```python
@issues_kg_router.post(
    "/issues/{issue_id}/knowledge-graph/regenerate",
    response_model=RegenerateResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def regenerate_issue_knowledge_graph(
    workspace_id: WorkspaceIdPath,
    issue_id: Annotated[UUID, Path(description="Issue UUID")],
    session: SessionDep,
    current_user_id: SyncedUserId,
    _member: WorkspaceMemberId,
    issue_repo: IssueRepositoryDep,
    queue_client: QueueClientDep,
) -> RegenerateResponse:
    """Re-enqueue kg_populate for a single issue."""
    await set_rls_context(session, current_user_id, workspace_id)

    issue = await issue_repo.get_by_id(issue_id)
    if issue is None or issue.is_deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")

    await queue_client.enqueue(
        QueueName.AI_NORMAL,
        _build_kg_payload("issue", issue.id, issue.workspace_id, issue.project_id),
    )
    return RegenerateResponse(enqueued=1, detail=f"Enqueued kg_populate for issue {issue_id}")
```

**Helper function**:

```python
def _build_kg_payload(
    entity_type: str,
    entity_id: UUID,
    workspace_id: UUID,
    project_id: UUID,
) -> dict[str, str]:
    return {
        "task_type": TASK_KG_POPULATE,
        "entity_type": entity_type,
        "entity_id": str(entity_id),
        "workspace_id": str(workspace_id),
        "project_id": str(project_id),
    }
```

**Trigger**: Manual API call or frontend button → User clicks "Regenerate Knowledge Graph"
**Response**: `202 Accepted` + payload with job count

---

#### Bulk Project Regeneration (lines 580–674)

Enqueues kg_populate for:
1. The project itself (1 job)
2. All non-deleted issues in project (N jobs)
3. All non-deleted notes in project (M jobs)
4. All non-deleted cycles in project (P jobs)

**Total enqueued**: 1 + N + M + P

---

### 5. Frontend Trigger (issue-knowledge-graph-full.tsx)

**File**: `/Users/tindang/workspaces/tind-repo/pilot-space/frontend/src/features/issues/components/issue-knowledge-graph-full.tsx`

```typescript
const handleRegenerate = useCallback(async () => {
  setIsRegenerating(true);
  try {
    const result = await knowledgeGraphApi.regenerateIssueGraph(workspaceId, issueId);
    toast.success(`Knowledge graph regeneration started (${result.enqueued} job enqueued)`);
    // Refetch after a short delay to let the worker process
    setTimeout(() => void refetch(), 3000);
  } catch {
    toast.error('Failed to start knowledge graph regeneration');
  } finally {
    setIsRegenerating(false);
  }
}, [workspaceId, issueId, refetch]);
```

**API Call**: `knowledgeGraphApi.regenerateIssueGraph(workspaceId, issueId)`
- Calls: `POST /workspaces/{workspaceId}/issues/{issueId}/knowledge-graph/regenerate`
- Returns: `{ enqueued: 1, detail: "..." }`
- Refetches graph data after 3s (allows worker time to process)

---

## Node Types and Edges Created

### Node Types

| Type | Created By | Purpose |
|------|-----------|---------|
| `ISSUE` | _handle_issue | Wraps issue name + description |
| `NOTE` | _handle_note | Wraps note title + markdown content |
| `NOTE_CHUNK` | _handle_issue, _handle_note | Section/heading chunks for long content |
| `PROJECT` | _handle_project | Wraps project name + description |
| `CYCLE` | _handle_cycle | Wraps cycle name + status + dates |

### Edge Types

| Type | Created By | Semantics | Weight |
|------|-----------|-----------|--------|
| `BELONGS_TO` | _link_to_project | Entity → Project (structural) | 1.0 (fixed) |
| `PARENT_OF` | _handle_issue/_handle_note | Parent entity → Chunk nodes | 1.0 (fixed) |
| `RELATES_TO` | _find_and_link_similar | Semantic similarity (embedding-based) | 0.0–1.0 (score) |

---

## Key Details & Constraints

### Content Processing

| Entity | Content Source | Chunking | Enrichment |
|--------|---|---|---|
| **Issue** | `{name}\n\n{description}` | Markdown headings (min 50 chars/chunk) | Claude + Anthropic API (contextual) |
| **Note** | TipTap JSON → Markdown | Markdown headings | Claude + Anthropic API |
| **Project** | `{name}\n\n{description}` | None (no chunking) | N/A |
| **Cycle** | `{name} ({status}) [{dates}]...\n\n{description}` | None | N/A |

### Idempotency & Regeneration

- **Stale chunk deletion**: Before creating chunks, existing NOTE_CHUNK nodes for that entity are deleted
- **Advisory lock**: Note processing uses `pg_advisory_xact_lock()` to prevent concurrent chunk race conditions
- **Upsert semantics**: Node/edge upsert uses `INSERT ... ON CONFLICT ... DO UPDATE` for idempotent re-runs

### Embedding Enqueue Timing

- Embedding jobs are enqueued **BEFORE** the MemoryWorker commits
- If worker crashes after embedding enqueue, crash recovery finds orphaned embedding jobs
- Embeddings fill in the graph_node.embedding column (pgvector type)
- Used later for hybrid search (vector + BM25 full-text)

### Similarity Threshold

- Only RELATES_TO edges with similarity **>= 0.75** are created
- Maximum 5 edges per new node (per `_MAX_SIMILAR_EDGES`)
- Similarity search is project-scoped (only nodes in same project)

### Error Handling

**Non-fatal errors** (don't crash job):
- Chunk enrichment fails → log warning, continue
- Edge upsert fails → log warning, count as failed_edge_count
- Project node not found for BELONGS_TO → log debug, skip edge

**Fatal errors** (propagate for worker retry/dead-letter):
- Entity not found in DB
- Session/database errors
- Queue client errors (should not happen)

---

## Database & RLS

**Tables**:
- `graph_node` (node_id, workspace_id, node_type, label, content, embedding, properties, is_deleted)
- `graph_edge` (edge_id, workspace_id, source_id, target_id, edge_type, weight, properties, is_deleted)

**RLS Context**:
- Set by routers via `set_rls_context(session, user_id, workspace_id)`
- MemoryWorker does NOT set RLS (background worker, no user context)
- KgPopulateHandler queries assume RLS is NOT enforced (direct workspace_id filtering)

---

## Performance Characteristics

### Throughput

- **MemoryWorker batch size**: 1 message (forced by design)
- **Visibility timeout**: 120 seconds per job
- **Retry limit**: 2 attempts
- **Parallel embedding enqueue**: up to 10 concurrent

### Latency

- **Create to queue**: < 100ms (in-process enqueue)
- **Queue to processing**: depends on worker poll (default 2s empty sleep)
- **KgPopulateHandler execution**:
  - Simple issue/project/cycle: 200–500ms
  - Note with chunking: 500ms–5s (depends on content length + enrichment)
  - Similarity search: 100–300ms (embedding lookup + BM25)

### Resource Usage

- **Per-job session**: 1 AsyncSession (request-scoped)
- **Advisory lock**: 1 per note regeneration (auto-released on commit/rollback)
- **Embedding requests**: 1 per persisted node (to OpenAI/Ollama/Google)
- **Memory**: ~1 KB per node (metadata), ~1.5 KB per edge

---

## Testing & Validation

### Integration Test Flow

1. Create issue → verify kg_populate job enqueued
2. Run MemoryWorker → process kg_populate
3. Query graph_node/graph_edge tables → verify nodes/edges persisted
4. Call regenerate endpoint → verify re-enqueue works
5. Verify embeddings populated after graph_embedding jobs run

### Known Issues

- **SQLite**: RLS policies are no-ops in SQLite (test DB). Use PostgreSQL for integration tests.
- **pgvector**: Not available in SQLite. Embedding queries silently pass with wrong semantics.
- **Advisory locks**: `pg_advisory_xact_lock()` not available in SQLite (suppressed with `contextlib.suppress`).

---

## Summary

The knowledge graph generation pipeline is a **resilient, idempotent** background job system that:

1. **Enqueues asynchronously** on entity create (issues, notes, projects, cycles)
2. **Supports manual regeneration** via HTTP endpoints (single entity or bulk project)
3. **Processes sequentially** with the MemoryWorker (batch_size=1)
4. **Creates nodes** for issues, notes, note chunks, projects, and cycles
5. **Creates edges** for structural (BELONGS_TO, PARENT_OF) and semantic (RELATES_TO) relationships
6. **Enqueues embedding jobs** for all persisted nodes (before commit for crash recovery)
7. **Commits atomically** with per-job transaction boundaries
8. **Retries on failure** (2 attempts) or moves to dead-letter queue

All operations are **workspace-scoped** via RLS policies and **idempotent** via upsert semantics.
