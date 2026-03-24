# Knowledge Graph Pipeline — Visual Diagrams

## 1. Complete Pipeline Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          USER ACTION (Synchronous)                        │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  Scenario A: Create Issue              Scenario B: Create Note            │
│  ──────────────────────────            ──────────────────────             │
│  POST /issues                           POST /notes                        │
│         ↓                                    ↓                             │
│  CreateIssueService.execute()          CreateNoteService.execute()        │
│         ↓                                    ↓                             │
│  Saves issue to DB                      Saves note to DB                  │
│  ISSUE { id, name, desc }              NOTE { id, title, content }        │
│                                                                            │
│  Scenario C: Manual Regeneration       Scenario D: Bulk Regeneration      │
│  ────────────────────────────          ──────────────────────────         │
│  POST /issues/{id}/kg/regenerate       POST /projects/{id}/kg/regenerate  │
│         ↓                                    ↓                             │
│  regenerate_issue_knowledge_graph()    regenerate_project_knowledge_graph()
│                                                                            │
└──────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌──────────────────────────────────────────────────────────────────────────┐
│                  ENQUEUE kg_populate Job (Non-blocking)                   │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  await queue.enqueue(QueueName.AI_NORMAL, {                              │
│    "task_type": "kg_populate",                                           │
│    "entity_type": "issue|note|cycle|project",                            │
│    "entity_id": "<UUID>",                                                │
│    "workspace_id": "<UUID>",                                             │
│    "project_id": "<UUID>"                                                │
│  })                                                                       │
│                                                                            │
│  SUCCESS → Returns immediately                                           │
│  FAILURE → Logged as warning (non-fatal)                                 │
│                                                                            │
│  Queue: Supabase pgmq ("ai_normal")                                      │
│  Visibility timeout: 120 seconds                                         │
│                                                                            │
└──────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌──────────────────────────────────────────────────────────────────────────┐
│          MemoryWorker Background Loop (async, continuous)                │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  while running:                                                          │
│    try:                                                                  │
│      messages = await queue.dequeue(batch_size=1, timeout=120s)         │
│      if messages:                                                        │
│        message = messages[0]                                             │
│        await _process(message)    ← DISPATCH                            │
│      else:                                                               │
│        sleep(2.0)  # no messages available                              │
│    except CancelledError:                                                │
│      break                                                               │
│    except Exception:                                                     │
│      logger.exception(...)                                               │
│      sleep(5.0)  # back off on error                                    │
│                                                                            │
│  Location: backend/src/pilot_space/ai/workers/memory_worker.py           │
│                                                                            │
└──────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌──────────────────────────────────────────────────────────────────────────┐
│              _process(message) → _dispatch(task_type, ...)               │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  Extract payload = message.payload                                       │
│  task_type = payload.get("task_type")                                   │
│                                                                            │
│  ┌──────────────────────┐                                                │
│  │ task_type            │                                                │
│  ├──────────────────────┤                                                │
│  │ "kg_populate"    ───→ KgPopulateHandler(session, ...).handle()        │
│  │ "memory_embedding"  → MemoryEmbeddingJobHandler.handle()              │
│  │ "graph_embedding"  → MemoryEmbeddingJobHandler.handle_graph_node()    │
│  │ "intent_dedup"     → IntentDedupJobHandler                            │
│  │ "memory_dlq_rec..."→ MemoryDLQJobHandler                              │
│  │ "graph_expiration" → expire_stale_graph_nodes()                       │
│  │ "artifact_cleanup" → run_artifact_cleanup()                           │
│  └──────────────────────┘                                                │
│                                                                            │
│  async with session_factory() as session:                                │
│    result = await _dispatch(task_type, payload, session)                │
│    await session.commit()     ← COMMIT HAPPENS HERE                      │
│    await queue.ack(msg_id)                                               │
│                                                                            │
│  On error:                                                               │
│    attempts = message.attempts                                           │
│    if attempts < 2: nack(msg_id, error=str(e))      # retry              │
│    else: move_to_dead_letter(msg_id, error, payload)  # final failure    │
│                                                                            │
└──────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌──────────────────────────────────────────────────────────────────────────┐
│   KgPopulateHandler.handle(payload) → dispatch by entity_type           │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  ┌─── ISSUE BRANCH ────────────────────────────────────────────┐         │
│  │ entity_type = "issue"                                        │         │
│  │ _handle_issue(payload)                                       │         │
│  │                                                               │         │
│  │ 1. Fetch Issue from DB                                       │         │
│  │ 2. Create ISSUE node                                         │         │
│  │    GraphWriteService.execute({                               │         │
│  │      nodes: [NodeInput(type=ISSUE, ...)]                     │         │
│  │    })                                                         │         │
│  │                                                               │         │
│  │ 3. IF description > 50 chars:                                │         │
│  │    a. Delete stale NOTE_CHUNK nodes                          │         │
│  │    b. Chunk description by markdown headings                 │         │
│  │    c. Enrich chunks with context (Claude)                    │         │
│  │    d. Create NOTE_CHUNK nodes                                │         │
│  │    e. Create PARENT_OF edges (ISSUE → chunks)                │         │
│  │                                                               │         │
│  │ 4. Create BELONGS_TO edge (ISSUE → PROJECT)                 │         │
│  │    via _link_to_project()                                    │         │
│  │                                                               │         │
│  │ 5. Find similar project content (embedding)                  │         │
│  │    Create RELATES_TO edges (weight = similarity score)        │         │
│  │    via _find_and_link_similar()                              │         │
│  │                                                               │         │
│  │ Returns: {success, node_ids, chunks, edges}                  │         │
│  └────────────────────────────────────────────────────────────┘         │
│                                                                            │
│  ┌─── NOTE BRANCH ─────────────────────────────────────────────┐         │
│  │ entity_type = "note"                                         │         │
│  │ _handle_note(payload)                                        │         │
│  │                                                               │         │
│  │ 1. Fetch Note from DB                                        │         │
│  │ 2. Get advisory lock (prevent chunk race)                    │         │
│  │ 3. Convert TipTap JSON → Markdown                            │         │
│  │ 4. Create NOTE node                                          │         │
│  │ 5. Delete stale NOTE_CHUNK nodes                             │         │
│  │ 6. Chunk markdown by headings                                │         │
│  │ 7. Enrich chunks with context (Claude)                       │         │
│  │ 8. Create NOTE_CHUNK nodes                                   │         │
│  │ 9. Create PARENT_OF edges (NOTE → chunks)                    │         │
│  │ 10. Create BELONGS_TO edge (NOTE → PROJECT)                 │         │
│  │ 11. Find similar content & create RELATES_TO edges           │         │
│  │                                                               │         │
│  │ Returns: {success, node_ids, chunks, edges}                  │         │
│  └────────────────────────────────────────────────────────────┘         │
│                                                                            │
│  ┌─── PROJECT BRANCH ──────────────────────────────────────────┐         │
│  │ entity_type = "project"                                      │         │
│  │ _handle_project(payload)                                     │         │
│  │                                                               │         │
│  │ 1. Fetch Project from DB                                     │         │
│  │ 2. Create PROJECT node                                       │         │
│  │ 3. Link existing child nodes (ISSUE, NOTE, CYCLE)           │         │
│  │    Create BELONGS_TO edges (child → project)                 │         │
│  │ 4. Find similar content & create RELATES_TO edges            │         │
│  │                                                               │         │
│  │ Returns: {success, node_ids, children_linked, edges}         │         │
│  └────────────────────────────────────────────────────────────┘         │
│                                                                            │
│  ┌─── CYCLE BRANCH ───────────────────────────────────────────┐         │
│  │ entity_type = "cycle"                                        │         │
│  │ _handle_cycle(payload)                                       │         │
│  │                                                               │         │
│  │ 1. Fetch Cycle from DB                                       │         │
│  │ 2. Create CYCLE node (with status/dates in content)         │         │
│  │ 3. Create BELONGS_TO edge (CYCLE → PROJECT)                 │         │
│  │ 4. Find similar content & create RELATES_TO edges            │         │
│  │                                                               │         │
│  │ Returns: {success, node_ids, edges}                          │         │
│  └────────────────────────────────────────────────────────────┘         │
│                                                                            │
└──────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌──────────────────────────────────────────────────────────────────────────┐
│          GraphWriteService.execute(GraphWritePayload) ← Core             │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  INPUT: nodes: [NodeInput, ...], edges: [EdgeInput, ...] = []            │
│                                                                            │
│  STEP 1: Convert NodeInput → GraphNode domain objects                   │
│  ─────────────────────────────────────────────────────                  │
│  For each NodeInput:                                                     │
│    ├─ Compute content_hash (for unkeyed, non-external nodes)            │
│    ├─ Hash includes workspace_id + node_type + content                  │
│    └─ For user-scoped types: also include user_id in hash               │
│                                                                            │
│  STEP 2: Bulk upsert nodes                                               │
│  ──────────────────────────                                              │
│  domain_nodes = [GraphNode.create(...) for ni in nodes]                 │
│  persisted_nodes = await repo.bulk_upsert_nodes(domain_nodes)           │
│                                                                            │
│  SQL (PostgreSQL):                                                       │
│    INSERT INTO graph_node                                                │
│    VALUES (id, workspace_id, node_type, label, content, ...)            │
│    ON CONFLICT (external_id, workspace_id)                               │
│      DO UPDATE SET updated_at = NOW(), ...                               │
│                                                                            │
│  STEP 3: Build external_id → node_id mapping                             │
│  ────────────────────────────────────────────                            │
│  ext_id_map = {node.external_id: node.id for node in persisted_nodes}   │
│                                                                            │
│  STEP 4: Upsert edges                                                    │
│  ────────────────────                                                    │
│  For each EdgeInput:                                                     │
│    ├─ Resolve source_id (from node_id or external_id)                   │
│    ├─ Resolve target_id (from node_id or external_id)                   │
│    ├─ Check for self-loops (skip if source_id == target_id)             │
│    └─ Upsert edge (INSERT ... ON CONFLICT ... DO UPDATE)                │
│                                                                            │
│  STEP 5: Auto-detect issue references                                    │
│  ─────────────────────────────────────                                   │
│  For each ISSUE node:                                                    │
│    ├─ Scan content for regex \b([A-Z]{1,10}-\d+)\b  (e.g., "PS-42")    │
│    ├─ Look up label in current batch + DB (cross-batch)                 │
│    └─ Create RELATES_TO edge (source=current, target=matched, weight=0.5)
│                                                                            │
│  STEP 6: Flush to assign IDs                                             │
│  ──────────────────────────────                                          │
│  await session.flush()  ← Not a commit; IDs assigned                     │
│                                                                            │
│  STEP 7: Enqueue embedding jobs (BEFORE commit)                          │
│  ──────────────────────────────────────────────                          │
│  for node_id in persisted_node_ids:                                      │
│    await queue.enqueue(QueueName.AI_NORMAL, {                            │
│      "task_type": "graph_embedding",                                     │
│      "node_id": str(node_id),                                            │
│      "workspace_id": str(workspace_id),                                  │
│      "enqueued_at": ISO_timestamp                                        │
│    })                                                                     │
│                                                                            │
│  Bounded concurrency: asyncio.Semaphore(max=10)                          │
│                                                                            │
│  STEP 8: Commit (if auto_commit=True)                                    │
│  ──────────────────────────────────────                                  │
│  if auto_commit:                                                         │
│    await session.commit()                                                │
│                                                                            │
│  (In KgPopulateHandler: auto_commit=False, MemoryWorker does commit)     │
│                                                                            │
│  OUTPUT: GraphWriteResult {                                              │
│    node_ids: [list of persisted node UUIDs],                             │
│    edge_ids: [list of persisted edge UUIDs],                             │
│    embedding_enqueued: bool,                                             │
│    failed_edge_count: int                                                │
│  }                                                                        │
│                                                                            │
└──────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌──────────────────────────────────────────────────────────────────────────┐
│                  DATABASE: graph_node & graph_edge                        │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  graph_node:                                                             │
│  ┌─────────────────────────────────────────────────────────────┐        │
│  │ id (UUID)       │ external_id (UUID) │ workspace_id (UUID)   │        │
│  │ node_type       │ label              │ content               │        │
│  │ summary         │ embedding (pgvector) properties (JSONB)    │        │
│  │ created_at      │ updated_at         │ is_deleted            │        │
│  └─────────────────────────────────────────────────────────────┘        │
│                                                                            │
│  graph_edge:                                                             │
│  ┌─────────────────────────────────────────────────────────────┐        │
│  │ id (UUID)      │ source_id (UUID)    │ target_id (UUID)     │        │
│  │ edge_type      │ weight (float)      │ workspace_id (UUID)  │        │
│  │ properties (JSONB) │ created_at      │ updated_at           │        │
│  │ is_deleted     │                                            │        │
│  └─────────────────────────────────────────────────────────────┘        │
│                                                                            │
│  RLS Policy: WHERE workspace_id = current_setting('app.current_user_id')│
│  (or direct filtering in KgPopulateHandler since it's background job)   │
│                                                                            │
└──────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌──────────────────────────────────────────────────────────────────────────┐
│       MemoryWorker continues: await session.commit() & queue.ack()      │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  await session.commit()  ← All nodes/edges persist                       │
│  await queue.ack(msg_id) ← Message removed from queue                    │
│                                                                            │
│  On success: job marked complete                                        │
│  On error:                                                               │
│    ├─ attempts < 2: nack(msg_id)     → message visible again in 120s    │
│    └─ attempts >= 2: dead_letter()   → stored for manual review          │
│                                                                            │
└──────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌──────────────────────────────────────────────────────────────────────────┐
│         (Background) Embedding Jobs Processed (graph_embedding)          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  MemoryWorker dequeues "graph_embedding" message                         │
│  MemoryEmbeddingJobHandler.handle_graph_node(payload)                    │
│    1. Fetch node from DB                                                 │
│    2. EmbeddingService.embed(node.content)                               │
│       → OpenAI API / Ollama / Google Gemini                              │
│    3. Update graph_node.embedding = pgvector                             │
│    4. Commit                                                             │
│                                                                            │
│  Enables later hybrid search:                                            │
│  ├─ Vector similarity (pgvector cosine distance)                         │
│  ├─ Full-text BM25 (PostgreSQL tsvector)                                 │
│  └─ Recency scoring (updated_at)                                         │
│                                                                            │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Node & Edge Hierarchy

```
                        GRAPH ENTITY
                             │
                   ┌─────────┴─────────┐
                   │                   │
                 NODES              EDGES
                   │                   │
        ┌──────────┼──────────┐       │
        │          │          │       │
      ISSUE      NOTE     PROJECT  CYCLE  (+ NOTE_CHUNK for long content)
        │          │          │       │
        └──────────┼──────────┴───────┘
                   │
            ┌──────┴──────┐
            │             │
         STRUCTURAL   SEMANTIC
           EDGES         EDGES
            │             │
    ┌───────┼────┐   ┌────────┐
    │       │    │   │        │
 BELONGS_TO PARENT_OF RELATES_TO (+ auto-detected RELATES_TO)


STRUCTURAL EDGES (semantic meaning):
───────────────────────────────────
• BELONGS_TO (ISSUE → PROJECT, NOTE → PROJECT, CYCLE → PROJECT)
  └─ Indicates entity belongs to this project
  └─ Weight: 1.0 (fixed)
  └─ Created by: _link_to_project()

• PARENT_OF (ISSUE → NOTE_CHUNK, NOTE → NOTE_CHUNK)
  └─ Indicates chunk is a part/section of parent
  └─ Weight: 1.0 (fixed)
  └─ Created by: chunking loop


SEMANTIC EDGES (similarity-based):
──────────────────────────────────
• RELATES_TO (source → any existing same-project node)
  └─ Indicates content similarity
  └─ Weight: similarity score (0.0–1.0, computed via embedding)
  └─ Threshold: >= 0.75
  └─ Max per node: 5
  └─ Created by: _find_and_link_similar()

• RELATES_TO (auto-detected, source=ISSUE)
  └─ Issue references another issue (e.g., "PS-42" in content)
  └─ Weight: 0.5 (fixed)
  └─ Created by: _detect_issue_references() in GraphWriteService


NODE TYPE HIERARCHY:
────────────────────
ISSUE
  │
  ├─ Created by: _handle_issue()
  ├─ Has PARENT_OF → NOTE_CHUNK (if description chunked)
  ├─ Has BELONGS_TO → PROJECT
  └─ Has RELATES_TO → other project nodes (similarity)

NOTE
  │
  ├─ Created by: _handle_note()
  ├─ Has PARENT_OF → NOTE_CHUNK (always chunked)
  ├─ Has BELONGS_TO → PROJECT
  └─ Has RELATES_TO → other project nodes (similarity)

NOTE_CHUNK
  │
  ├─ Created by: chunking ISSUE or NOTE content
  ├─ Parent: ISSUE or NOTE (via PARENT_OF edge)
  ├─ Has RELATES_TO → other project nodes (similarity)
  └─ Properties: chunk_index, heading, heading_level, parent_*_id

PROJECT
  │
  ├─ Created by: _handle_project()
  ├─ Has BELONGS_TO ← ISSUE, NOTE, CYCLE (reverse relation)
  ├─ Has RELATES_TO → other project nodes (similarity)
  └─ Links existing children (issues/notes/cycles)

CYCLE
  │
  ├─ Created by: _handle_cycle()
  ├─ Has BELONGS_TO → PROJECT
  └─ Has RELATES_TO → other project nodes (similarity)
```

---

## 3. Chunking & Content Processing Flow

```
ISSUE CONTENT PROCESSING:
────────────────────────

Issue {
  name: "Implement user authentication",
  description: """
    # Overview
    Need to add JWT-based auth...

    ## Details
    Current system uses...

    ## Implementation steps
    1. Create auth service
    2. Add middleware
    ...
  """
}
       ↓
  Format content: "{name}\n\n{description}"
       ↓
  IF len(description) > 50 chars:
       ├─ chunk_markdown_by_headings(content, min_chunk_chars=50)
       │   ↓
       │  Chunks:
       │  1. "Overview\nNeed to add JWT..."       (chunk_index: 0, heading: "Overview")
       │  2. "Details\nCurrent system uses..."    (chunk_index: 1, heading: "Details")
       │  3. "Implementation steps\n1. Create..."(chunk_index: 2, heading: "Implementation steps")
       │
       ├─ enrich_chunks_with_context(chunks, full_markdown)
       │  (Call Claude: "Given this context, what's the role of this chunk?")
       │   ↓
       │  Enriched chunks with summaries
       │
       └─ Create NOTE_CHUNK nodes for each chunk
           └─ Properties: chunk_index, heading, parent_issue_id, project_id
  ELSE:
       └─ No chunking (keep as single ISSUE node)


NOTE CONTENT PROCESSING:
───────────────────────

Note {
  title: "Architecture RFC",
  content: {
    type: "doc",
    content: [
      { type: "heading", level: 1, content: [{ type: "text", text: "Goals" }] },
      { type: "paragraph", content: [{ type: "text", text: "..." }] },
      ...
    ]
  }
}
       ↓
  ContentConverter.tiptap_to_markdown(content)
       ↓
  Markdown:
  # Goals
  Text here...
       ↓
  chunk_markdown_by_headings(markdown, min_chunk_chars=50)
       ↓
  Chunks (always, even if short)
       ↓
  enrich_chunks_with_context(chunks, markdown)
       ↓
  Create NOTE node + NOTE_CHUNK nodes
       ↓
  Create PARENT_OF edges (NOTE → chunks)
```

---

## 4. Similarity Search & RELATES_TO Edge Creation

```
SIMILARITY SEARCH FLOW:
──────────────────────

1. Content prepared: "{name}\n\n{description}" (max 2000 chars)

2. Generate embedding:
   embedding = await embedding_service.embed(query_text)
   └─ EmbeddingService calls OpenAI / Ollama / Google

3. Hybrid search:
   similar_nodes = await repo.hybrid_search(
     query_embedding=embedding,
     query_text=query_text,
     workspace_id=workspace_id,
     limit=_MAX_SIMILAR_EDGES + batch_size  (5 + current batch)
   )
   └─ PostgreSQL:
      ├─ Vector similarity: pgvector <=> (cosine distance)
      ├─ Full-text: BM25 scoring (tsvector)
      └─ Recency: updated_at score

4. Filter candidates:
   candidates = [
     node for node in similar_nodes
     if node.score >= 0.75                      # ← Threshold
     and node.id not in new_node_ids             # ← Exclude self
     and node.properties["project_id"] == project_id  # ← Same project
   ][:5]  # ← Max 5 edges

5. Create RELATES_TO edges:
   for candidate in candidates:
     edge = GraphEdge(
       source_id=new_node_ids[0],      # ← Anchor to first node
       target_id=candidate.id,
       edge_type=EdgeType.RELATES_TO,
       weight=clamp(round(score, 4), 0.0, 1.0)  # ← Score as weight
     )
     await repo.upsert_edge(edge)

6. Result:
   new_issue "PS-42" ──RELATES_TO(0.89)──> existing_issue "PS-18"
                  \───RELATES_TO(0.82)──> existing_note "Auth RFC"
                   \──RELATES_TO(0.76)──> existing_issue "PS-5"


THRESHOLDS:
──────────
_SIMILARITY_THRESHOLD = 0.75   ← Min score to create edge
_MAX_SIMILAR_EDGES = 5         ← Max edges per node
_MIN_CHUNK_CHARS = 50          ← Min chars to chunk (vs keep whole)
```

---

## 5. Regeneration Triggers

```
SINGLE ISSUE REGENERATION:
──────────────────────────

User clicks "Regenerate" button in UI
       ↓
knowledgeGraphApi.regenerateIssueGraph(workspaceId, issueId)
       ↓
POST /workspaces/{workspace_id}/issues/{issue_id}/knowledge-graph/regenerate
       ↓
regenerate_issue_knowledge_graph() endpoint
       ├─ Verify issue exists
       ├─ Verify workspace membership
       └─ queue.enqueue(QueueName.AI_NORMAL, {task_type: "kg_populate", ...})
       ↓
RESPONSE: {enqueued: 1, detail: "..."}
       ↓
Frontend: show success toast, refetch after 3s


BULK PROJECT REGENERATION:
──────────────────────────

POST /workspaces/{workspace_id}/projects/{project_id}/knowledge-graph/regenerate
       ↓
regenerate_project_knowledge_graph() endpoint
       ├─ Verify project exists
       ├─ Verify workspace membership
       │
       ├─ Enqueue project itself
       │  await queue.enqueue(..., {entity_type: "project", entity_id: project_id})
       │
       ├─ SELECT * FROM issue WHERE project_id = ? AND NOT is_deleted
       │  FOR EACH issue:
       │    await queue.enqueue(..., {entity_type: "issue", entity_id: issue_id})
       │
       ├─ SELECT * FROM note WHERE project_id = ? AND NOT is_deleted
       │  FOR EACH note:
       │    await queue.enqueue(..., {entity_type: "note", entity_id: note_id})
       │
       └─ SELECT * FROM cycle WHERE project_id = ? AND NOT is_deleted
          FOR EACH cycle:
            await queue.enqueue(..., {entity_type: "cycle", entity_id: cycle_id})
       ↓
Total enqueued: 1 (project) + N (issues) + M (notes) + P (cycles)
       ↓
RESPONSE: {enqueued: 1+N+M+P, detail: "..."}
```

---

## 6. Error Handling & Retry Logic

```
SUCCESS PATH:
─────────────
MemoryWorker._process(message)
       ↓
async with session_factory() as session:
  result = await _dispatch(...)
  await session.commit()     ← ✓ SUCCESS
  await queue.ack(msg_id)
       ↓
Message removed from queue


RETRY PATH (Temporary Failure):
───────────────────────────────
MemoryWorker._process(message)
       ↓
try:
  await _dispatch(...)
except Exception as e:
  attempts = message.attempts
  if attempts < 2:              ← ✗ First/second failure
    logger.exception(...)
    await queue.nack(msg_id, error=str(e))
       ↓
Message becomes visible again after 120s
MemoryWorker dequeues same message (attempts incremented)
Retry processing...


DEAD-LETTER PATH (Persistent Failure):
───────────────────────────────────────
MemoryWorker._process(message)
       ↓
try:
  await _dispatch(...)
except Exception as e:
  attempts = message.attempts
  if attempts >= 2:             ← ✗ Third+ failure
    logger.exception(...)
    await queue.move_to_dead_letter(
      msg_id,
      error=str(e),
      original_payload=payload
    )
       ↓
Message moved to dead-letter queue
Admin review required (manual inspection + requeue if needed)


VALIDATION FAILURE (Non-retryable):
────────────────────────────────────
KgPopulateHandler.handle()
       ↓
try:
  payload = _KgPopulatePayload.from_dict(payload)
except (KeyError, ValueError) as e:
  logger.warning("KgPopulateHandler: invalid payload — %s", e)
  return {"success": False, "error": str(e)}
       ↓
MemoryWorker._process() sees valid result
await queue.ack(msg_id)     ← ✓ Message ACKed (not retried)
       ↓
Job logged as failed but doesn't clog queue


HANDLER VALIDATION FAILURE:
──────────────────────────
KgPopulateHandler._handle_issue()
       ↓
issue = await session.get(IssueModel, entity_id)
if issue is None or issue.is_deleted:
  logger.warning("KgPopulateHandler: issue %s not found", entity_id)
  return {"success": False, "error": "issue not found"}
       ↓
MemoryWorker._process() sees valid result
await queue.ack(msg_id)     ← ✓ Message ACKed
       ↓
Job logged as failed (entity deleted after enqueue)
```

---

## 7. State After Complete Pipeline

```
DATABASE STATE AFTER SUCCESS:
──────────────────────────────

graph_node:
┌─────────────────────────────────────────────────────────┐
│ node_id │ node_type │ label         │ content          │
├─────────┼───────────┼───────────────┼──────────────────┤
│ UUID-1  │ ISSUE     │ "PS-42: Auth" │ "PS-42: Auth..." │
│ UUID-2  │ NOTE_CH.. │ "PS-42: Auth >│ "## Overview"... │
│ UUID-3  │ NOTE_CH.. │ "PS-42: Auth >│ "## Details"...  │
│ UUID-4  │ PROJECT   │ "My Project"  │ "My Project..."  │
└─────────┴───────────┴───────────────┴──────────────────┘

graph_edge:
┌─────────┬──────────────┬──────────────┬───────────┬────────┐
│ edge_id │ source_id    │ target_id    │ edge_type │ weight │
├─────────┼──────────────┼──────────────┼───────────┼────────┤
│ UUID-E1 │ UUID-1 (PS-42) │ UUID-2     │ PARENT_OF │ 1.0    │
│ UUID-E2 │ UUID-1       │ UUID-3       │ PARENT_OF │ 1.0    │
│ UUID-E3 │ UUID-1       │ UUID-4       │ BELONGS_TO│ 1.0    │
│ UUID-E4 │ UUID-1       │ UUID-N (old) │RELATES_TO │ 0.82   │
└─────────┴──────────────┴──────────────┴───────────┴────────┘

Queue (AI_NORMAL):
┌─────────────────────────────────────────┐
│ Message 1: graph_embedding for UUID-1   │
│ Message 2: graph_embedding for UUID-2   │
│ Message 3: graph_embedding for UUID-3   │
└─────────────────────────────────────────┘
  (enqueued by GraphWriteService, processed asynchronously)


FINAL RESULT:
─────────────
• PS-42 issue now has a graph node with chunks
• Chunks are searchable via hybrid (vector + BM25)
• Similarity edges connect to related project content
• Project context available for AI (via knowledge graph queries)
• Future: Embeddings fill in, enabling semantic search
```

---

## 8. Performance Timeline

```
SYNCHRONOUS (User-facing):
──────────────────────────
T+0ms:    POST /issues → CreateIssueService.execute()
T+50ms:   Save to DB
T+75ms:   Enqueue kg_populate (non-blocking)
T+100ms:  Return 201 Created ← User sees response immediately

ASYNCHRONOUS (Background):
──────────────────────────
T+0s:     Job in queue (QueueName.AI_NORMAL)
T+2–5s:   MemoryWorker dequeues & starts processing
T+2–5s:   KgPopulateHandler._handle_issue()
T+200ms:  Fetch issue from DB
T+300ms:  GraphWriteService.execute()
T+300ms:  Bulk upsert nodes (1 ISSUE + 3 NOTE_CHUNK)
T+400ms:  Upsert edges (3 PARENT_OF + 1 BELONGS_TO + 5 RELATES_TO)
T+450ms:  Enqueue 4 graph_embedding jobs (bounded by Semaphore(10))
T+500ms:  session.flush() → IDs assigned
T+550ms:  session.commit() ← Persisted
T+600ms:  queue.ack(msg_id) ← Job complete

EMBEDDING BACKGROUND:
────────────────────
T+0.5s:   graph_embedding job dequeued
T+1s:     EmbeddingService.embed() → OpenAI API call (500–1000ms)
T+2s:     Embedding result received
T+2.5s:   Update graph_node.embedding
T+2.6s:   Commit
T+2.7s:   Enable hybrid search

Total end-to-end: 2–3 seconds (issue persisted immediately, graph ready shortly)
```
