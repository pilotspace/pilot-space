# Knowledge Graph Pipeline — Quick Reference

## File Locations (All Backend)

| Component | File |
|-----------|------|
| **Entry Points** | |
| Issue creation | `backend/src/pilot_space/application/services/issue/create_issue_service.py:243–259` |
| Note creation | `backend/src/pilot_space/application/services/note/create_note_service.py:216–232` |
| Cycle creation | `backend/src/pilot_space/application/services/cycle/create_cycle_service.py:158–174` |
| **Queue Consumer** | |
| MemoryWorker | `backend/src/pilot_space/ai/workers/memory_worker.py` |
| **Job Handler** | |
| KgPopulateHandler | `backend/src/pilot_space/infrastructure/queue/handlers/kg_populate_handler.py` |
| **Graph Write** | |
| GraphWriteService | `backend/src/pilot_space/application/services/memory/graph_write_service.py` |
| **REST API** | |
| Knowledge Graph router | `backend/src/pilot_space/api/v1/routers/knowledge_graph.py:534–674` |
| Regenerate issue | `backend/src/pilot_space/api/v1/routers/knowledge_graph.py:534–577` |
| Regenerate project | `backend/src/pilot_space/api/v1/routers/knowledge_graph.py:580–674` |
| **Frontend** | |
| API client | `frontend/src/services/api/knowledge-graph.ts` |
| Issue KG panel | `frontend/src/features/issues/components/issue-knowledge-graph-full.tsx` |
| Regenerate handler | `frontend/src/features/issues/components/issue-knowledge-graph-full.tsx:137–149` |

---

## Execution Sequence (Create → DB)

```
1. CreateIssueService.execute()
   ├─ Saves issue to DB
   └─ queue.enqueue(QueueName.AI_NORMAL, {task_type: "kg_populate", ...})

2. MemoryWorker.start() (background loop)
   └─ queue.dequeue() → _process(message) → _dispatch(task_type, payload, session)
      ├─ task_type == "kg_populate"
      └─ KgPopulateHandler(session, embedding_service, queue).handle(payload)

3. KgPopulateHandler.handle()
   ├─ Parse payload → _KgPopulatePayload(workspace_id, project_id, entity_type, entity_id)
   ├─ Route by entity_type:
   │  ├─ "issue" → _handle_issue()
   │  ├─ "note" → _handle_note()
   │  ├─ "project" → _handle_project()
   │  └─ "cycle" → _handle_cycle()

4. _handle_issue() (or _handle_note/project/cycle)
   ├─ Fetch entity from DB
   ├─ Create parent node via GraphWriteService.execute()
   ├─ (For issue/note) Create chunk nodes & PARENT_OF edges
   ├─ Create BELONGS_TO edge to project (if exists)
   └─ Create RELATES_TO edges via embedding similarity search

5. GraphWriteService.execute()
   ├─ Convert NodeInput → GraphNode domain objects
   ├─ bulk_upsert_nodes() → persisted nodes with UUIDs
   ├─ Upsert edges (resolve external_id references)
   ├─ Auto-detect issue references (regex "PS-42") → create RELATES_TO
   ├─ session.flush() (assign IDs, no commit)
   ├─ Enqueue "graph_embedding" jobs for each node (async, bounded by Semaphore(10))
   └─ (If auto_commit=True) session.commit()

6. MemoryWorker._dispatch() (continues after GraphWriteService returns)
   ├─ session.commit() (KgPopulateHandler has auto_commit=False)
   ├─ queue.ack(message)
   └─ (On error) queue.nack() or move_to_dead_letter()

7. (Background) MemoryWorker processes "graph_embedding" jobs
   └─ MemoryEmbeddingJobHandler.handle_graph_node()
      └─ EmbeddingService.embed(node.content) → pgvector embedding
```

---

## Queue Message Format

**Enqueue payload**:
```json
{
  "task_type": "kg_populate",
  "entity_type": "issue|note|project|cycle",
  "entity_id": "<UUID>",
  "workspace_id": "<UUID>",
  "project_id": "<UUID>"
}
```

**Queue name**: `QueueName.AI_NORMAL` ("ai_normal")
**Visibility timeout**: 120 seconds
**Max retries**: 2 (then dead-letter)
**Batch size**: 1 (hard limit by design)

---

## Handler Dispatch

| Entity Type | Handler Method | Creates Nodes | Creates Edges |
|-------------|---|---|---|
| `issue` | `_handle_issue()` | ISSUE, NOTE_CHUNK(s) | PARENT_OF, BELONGS_TO, RELATES_TO |
| `note` | `_handle_note()` | NOTE, NOTE_CHUNK(s) | PARENT_OF, BELONGS_TO, RELATES_TO |
| `project` | `_handle_project()` | PROJECT | RELATES_TO, (child BELONGS_TO via _link_existing_children) |
| `cycle` | `_handle_cycle()` | CYCLE | BELONGS_TO, RELATES_TO |

---

## Node Creation Rules

### ISSUE Node
- **Node type**: `NodeType.ISSUE`
- **Label**: issue name (max 120 chars)
- **Content**: `"{name}\n\n{description}"` (max 2000 chars)
- **External ID**: issue.id
- **Properties**: `{ project_id, identifier, state }`
- **Chunking**: If description > 50 chars → NOTE_CHUNK nodes created (by heading)

### NOTE Node
- **Node type**: `NodeType.NOTE`
- **Label**: note title (max 120 chars)
- **Content**: TipTap JSON → Markdown (max 2000 chars)
- **External ID**: note.id
- **Properties**: `{ project_id, title }`
- **Chunking**: Markdown → NOTE_CHUNK nodes (by heading)
- **Lock**: `pg_advisory_xact_lock()` prevents chunk race conditions

### NOTE_CHUNK Node
- **Node type**: `NodeType.NOTE_CHUNK`
- **Label**: `"{parent_label} › {heading}"` or parent label if no heading
- **Content**: chunk markdown (max 2000 chars)
- **Properties**: `{ chunk_index, heading, heading_level, parent_note_id | parent_issue_id, project_id }`
- **No external_id** (generated node, not tied to external entity)
- **Content-hashed**: uses `compute_content_hash()` for deduplication

### PROJECT Node
- **Node type**: `NodeType.PROJECT`
- **Label**: project name (max 120 chars)
- **Content**: `"{name}\n\n{description}"`
- **External ID**: project.id
- **Properties**: `{ project_id, identifier, icon, lead_id }`
- **Special**: Existing child nodes (ISSUE, NOTE, CYCLE) linked with BELONGS_TO

### CYCLE Node
- **Node type**: `NodeType.CYCLE`
- **Label**: cycle name (max 120 chars)
- **Content**: `"{name} ({status}) [{date_range}]\n\n{description}"`
- **External ID**: cycle.id
- **Properties**: `{ project_id, status, start_date, end_date, owned_by_id }`

---

## Edge Creation Rules

### BELONGS_TO Edge
- **Source**: ISSUE, NOTE, CYCLE node
- **Target**: PROJECT node
- **Weight**: 1.0 (fixed)
- **Created by**: `_link_to_project(entity_node_id, workspace_id, project_id)`
- **Special**: Stale BELONGS_TO edges removed if entity moved to different project

### PARENT_OF Edge
- **Source**: Parent node (ISSUE or NOTE)
- **Target**: NOTE_CHUNK node
- **Weight**: 1.0 (fixed)
- **Created after**: Chunk nodes created
- **For**: Issues → issue chunks, Notes → note chunks

### RELATES_TO Edge
- **Source**: New node (ISSUE, NOTE, CYCLE, PROJECT)
- **Target**: Existing same-project node with similar content
- **Weight**: similarity score (0.0–1.0, clamped)
- **Threshold**: similarity >= 0.75
- **Max per node**: 5 edges
- **Created by**: `_find_and_link_similar()` (embedding search + filter)

### Auto-Detected RELATES_TO (from issue references)
- **Pattern**: Regex `\b([A-Z]{1,10}-\d+)\b` (e.g., "PS-42")
- **Source**: ISSUE node
- **Target**: Node with matching label
- **Weight**: 0.5 (fixed)
- **Lookup**: current batch first, then cross-batch DB lookup

---

## Similarity Search (RELATES_TO Creation)

```python
# 1. Generate embedding for new content
embedding = await embedding_service.embed(query_text)

# 2. Hybrid search (vector + BM25)
similar_nodes = await repo.hybrid_search(
    query_embedding=embedding,
    query_text=query_text,
    workspace_id=workspace_id,
    limit=_MAX_SIMILAR_EDGES + len(node_ids),  # 5 + current batch
)

# 3. Filter
candidates = [
    sn for sn in similar_nodes
    if sn.score >= 0.75  # threshold
    and sn.node.id not in node_id_set  # exclude self
    and sn.node.properties.get("project_id") == str(project_id)  # same project
][:5]  # max 5

# 4. Create RELATES_TO edges
for sn in candidates:
    edge = GraphEdge(
        source_id=node_ids[0],  # anchor to first node
        target_id=sn.node.id,
        edge_type=EdgeType.RELATES_TO,
        weight=min(max(round(sn.score, 4), 0.0), 1.0),  # clamp [0.0, 1.0]
    )
    await repo.upsert_edge(edge)
```

---

## Chunking Strategy

**Markdown chunking** (via `chunk_markdown_by_headings()`):
- Split by markdown headings (H1, H2, H3, etc.)
- Minimum chunk size: 50 characters
- Heading preserved in chunk properties
- Example:
  ```markdown
  # Overview
  Some text here...

  ## Details
  More text...
  ```
  Becomes 2 chunks with headings "Overview" and "Details"

**Contextual enrichment** (via `enrich_chunks_with_context()`):
- Calls Anthropic API with full content + chunk
- Generates summary/context for each chunk
- Optional (failures are logged, not fatal)
- Use case: understand chunk's role in full content

---

## Regeneration Endpoints

### Single Issue

```
POST /workspaces/{workspace_id}/issues/{issue_id}/knowledge-graph/regenerate

Response:
{
  "enqueued": 1,
  "detail": "Enqueued kg_populate for issue {issue_id}"
}
```

### Single Project (Bulk)

```
POST /workspaces/{workspace_id}/projects/{project_id}/knowledge-graph/regenerate

Enqueues:
1. Project itself (1)
2. All issues in project (N)
3. All notes in project (M)
4. All cycles in project (P)

Response:
{
  "enqueued": 1 + N + M + P,
  "detail": "Enqueued {count} kg_populate jobs for project {project_id}"
}
```

---

## Frontend Integration

**API client**: `frontend/src/services/api/knowledge-graph.ts`

```typescript
knowledgeGraphApi.regenerateIssueGraph(workspaceId, issueId)
  // POST /workspaces/{workspaceId}/issues/{issueId}/knowledge-graph/regenerate
  // Returns: { enqueued: number, detail: string }

knowledgeGraphApi.regenerateProjectGraph(workspaceId, projectId)
  // POST /workspaces/{workspaceId}/projects/{projectId}/knowledge-graph/regenerate
```

**UI trigger**: `issue-knowledge-graph-full.tsx:137–149`

```typescript
const handleRegenerate = useCallback(async () => {
  setIsRegenerating(true);
  try {
    const result = await knowledgeGraphApi.regenerateIssueGraph(workspaceId, issueId);
    toast.success(`Knowledge graph regeneration started (${result.enqueued} job enqueued)`);
    setTimeout(() => void refetch(), 3000);  // Refetch after 3s
  } catch {
    toast.error('Failed to start knowledge graph regeneration');
  } finally {
    setIsRegenerating(false);
  }
}, [workspaceId, issueId, refetch]);
```

---

## Error Handling

### Non-Fatal (logged, continue)
- Chunk enrichment fails → log warning, skip enrichment
- Edge upsert fails → log warning, increment failed_edge_count
- Project node not found → log debug, skip BELONGS_TO edge
- Similar node search fails → log warning, return 0 edges

### Fatal (propagate for retry/dead-letter)
- Entity not found in DB → return `{"success": False, "error": "..."}`
- Session/database errors → exception propagates
- Invalid payload (bad UUID) → return `{"success": False, "error": "..."}`

### Worker Retry Logic
- Attempts < 2 → `queue.nack()` (retry with new visibility)
- Attempts >= 2 → `queue.move_to_dead_letter()` (manual inspection needed)

---

## Constants & Thresholds

| Constant | Value | Purpose |
|----------|-------|---------|
| `_SIMILARITY_THRESHOLD` | 0.75 | Min score for RELATES_TO edges |
| `_MAX_SIMILAR_EDGES` | 5 | Max RELATES_TO edges per node |
| `_MIN_CHUNK_CHARS` | 50 | Minimum chunk size (chars) |
| `_BATCH_SIZE` | 1 | Queue batch size (hard constraint) |
| `_VISIBILITY_TIMEOUT_S` | 120 | Seconds before message re-visible |
| `_MAX_NACK_ATTEMPTS` | 2 | Retries before dead-letter |
| `_MAX_EMBEDDING_CONCURRENCY` | 10 | Max parallel embedding enqueues |

---

## Testing Notes

### Unit Tests
- **Mock queue client**: disable actual enqueue
- **Mock embedding service**: return hardcoded vectors
- **SQLite DB**: Advisory locks + RLS policies don't work (use PostgreSQL for integration)

### Integration Tests
- **PostgreSQL required**: for RLS, pgvector, advisory locks
- **Set TEST_DATABASE_URL**: env var to real PostgreSQL instance
- **Run MemoryWorker**: in test or mock the queue processing

### Debugging
- **Enable worker logging**: Check `logger.info()` calls in `memory_worker.py`
- **Query graph tables**: `SELECT * FROM graph_node WHERE workspace_id = ...`
- **Check dead-letter queue**: Failed jobs visible there
- **Monitor embedding enqueue**: Log in `GraphWriteService._enqueue_embedding_jobs()`

---

## Idempotency & Regeneration

**Key feature**: Operations are **idempotent** via upsert semantics

- **Chunk deletion**: Before creating chunks, delete stale ones (replace on regenerate)
- **Node upsert**: `INSERT ... ON CONFLICT(external_id, workspace_id) DO UPDATE`
- **Edge upsert**: `INSERT ... ON CONFLICT(source_id, target_id, edge_type) DO UPDATE`
- **Advisory lock**: Prevents concurrent chunk delete/recreate races (notes only)

**Result**: Running the same kg_populate job twice is safe (overwrites with same content)

---

## Related Services

| Service | Purpose | Called By |
|---------|---------|-----------|
| **EmbeddingService** | Generates embeddings for content | GraphWriteService, KgPopulateHandler |
| **ContentConverter** | TipTap JSON → Markdown | KgPopulateHandler._handle_note() |
| **markdown_chunker** | Splits markdown by headings | KgPopulateHandler |
| **enrich_chunks_with_context** | Calls Claude to generate chunk context | KgPopulateHandler |
| **KnowledgeGraphRepository** | DB access for nodes/edges | GraphWriteService, KgPopulateHandler |
| **SupabaseQueueClient** | Enqueue/dequeue messages | Services, MemoryWorker |
| **MemoryEmbeddingJobHandler** | Generates graph_embedding jobs | MemoryWorker |
