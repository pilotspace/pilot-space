# Knowledge Graph Documentation Index

Complete tracing of the knowledge graph generation pipeline from entry points through to database writes.

## Documents Created

### 📖 Main Documents (Read in Order)

1. **KNOWLEDGE_GRAPH_README.md** (START HERE)
   - Overview of all documents
   - Quick start guide (what happens when X is created)
   - Key concepts & constraints
   - File location index
   - Common tasks & debugging guide
   - Architecture highlights
   - Testing strategy

2. **KNOWLEDGE_GRAPH_FLOW.md** (DETAILED REFERENCE)
   - Complete high-level architecture diagram
   - Detailed flow for each entry point:
     - CreateIssueService (with code)
     - CreateNoteService (with code)
     - CreateCycleService (with code)
     - Regeneration endpoints (with code)
     - Frontend trigger (with code)
   - MemoryWorker poll loop
   - KgPopulateHandler dispatch logic
   - GraphWriteService bulk write logic
   - Node/edge creation rules
   - Content processing details
   - Database persistence & RLS
   - Performance characteristics
   - Testing notes & known issues

3. **KNOWLEDGE_GRAPH_QUICK_REF.md** (LOOKUP GUIDE)
   - File locations table
   - Execution sequence (simplified)
   - Queue message format
   - Handler dispatch table
   - Node creation rules per entity type
   - Edge creation rules
   - Similarity search parameters
   - Chunking strategy
   - Regeneration endpoints
   - Frontend integration
   - Error handling & retry logic
   - Constants & thresholds
   - Testing notes
   - Related services table

4. **KNOWLEDGE_GRAPH_DIAGRAMS.md** (VISUAL REFERENCE)
   - Complete pipeline flow (ASCII diagram)
   - All branches & decision points
   - Node & edge hierarchy
   - Chunking & content processing flow
   - Similarity search flow
   - Regeneration trigger flows
   - Error handling & retry logic flows
   - Final database state
   - Performance timeline

---

## Quick Navigation

### By Use Case

**"I need to understand how KG is generated"**
→ Start with KNOWLEDGE_GRAPH_README.md → KNOWLEDGE_GRAPH_FLOW.md → KNOWLEDGE_GRAPH_DIAGRAMS.md

**"I need to find where X happens"**
→ Use KNOWLEDGE_GRAPH_QUICK_REF.md file locations table

**"I need to understand the data flow"**
→ KNOWLEDGE_GRAPH_DIAGRAMS.md (visual)
→ KNOWLEDGE_GRAPH_FLOW.md (detailed text)

**"I need to debug an issue"**
→ KNOWLEDGE_GRAPH_README.md "Common Tasks" section
→ KNOWLEDGE_GRAPH_QUICK_REF.md "Error Handling" section

**"I need to add a new feature"**
→ KNOWLEDGE_GRAPH_FLOW.md entity-specific sections
→ KNOWLEDGE_GRAPH_QUICK_REF.md node/edge creation rules

**"I need performance characteristics"**
→ KNOWLEDGE_GRAPH_FLOW.md "Performance Characteristics" section
→ KNOWLEDGE_GRAPH_DIAGRAMS.md "Performance Timeline" section

---

## Key Entry Points

| Trigger | Handler | File |
|---------|---------|------|
| Create issue | CreateIssueService.execute() | `backend/src/pilot_space/application/services/issue/create_issue_service.py:243–259` |
| Create note | CreateNoteService.execute() | `backend/src/pilot_space/application/services/note/create_note_service.py:216–232` |
| Create cycle | CreateCycleService.execute() | `backend/src/pilot_space/application/services/cycle/create_cycle_service.py:158–174` |
| Manual regenerate (issue) | regenerate_issue_knowledge_graph() | `backend/src/pilot_space/api/v1/routers/knowledge_graph.py:534–577` |
| Manual regenerate (project) | regenerate_project_knowledge_graph() | `backend/src/pilot_space/api/v1/routers/knowledge_graph.py:580–674` |
| Frontend trigger | handleRegenerate() | `frontend/src/features/issues/components/issue-knowledge-graph-full.tsx:137–149` |

---

## Processing Pipeline (Simplified)

```
SYNCHRONOUS (User-facing):
Create Issue → Save to DB → Enqueue kg_populate → Return 201 (in ~100ms)

ASYNCHRONOUS (Background):
MemoryWorker dequeues → KgPopulateHandler processes → GraphWriteService upserts
→ Database commit → Enqueue graph_embedding jobs → Embeddings filled in later

Total latency: 2–3 seconds for complete KG with embeddings
```

---

## Key Concepts (TL;DR)

### Node Types
- **ISSUE**: Issue name + description (chunked if long)
- **NOTE**: Note title + markdown (always chunked by headings)
- **NOTE_CHUNK**: Individual chunks for searchability
- **PROJECT**: Project metadata
- **CYCLE**: Sprint/cycle metadata

### Edge Types
- **BELONGS_TO**: Entity belongs to project (weight=1.0)
- **PARENT_OF**: Parent contains child chunk (weight=1.0)
- **RELATES_TO**: Semantic similarity via embedding (weight=score)

### Thresholds
- Similarity: 0.75 (minimum to create edge)
- Max edges: 5 per node
- Min chunk size: 50 chars
- Queue retries: 2 before dead-letter

---

## Code Pattern Reference

### Enqueueing KG Job
```python
# In any Create service
if self._queue is not None:
    try:
        await self._queue.enqueue(
            QueueName.AI_NORMAL,
            {
                "task_type": "kg_populate",
                "entity_type": "issue|note|project|cycle",
                "entity_id": str(entity.id),
                "workspace_id": str(workspace_id),
                "project_id": str(project_id),
            },
        )
    except Exception as exc:
        logger.warning("Failed to enqueue kg_populate: %s", exc)
```

### Handling in KgPopulateHandler
```python
async def handle(self, payload: dict[str, Any]) -> dict[str, Any]:
    try:
        p = _KgPopulatePayload.from_dict(payload)
    except (KeyError, ValueError) as exc:
        return {"success": False, "error": str(exc)}  # Non-retryable

    if p.entity_type == "issue":
        return await self._handle_issue(p)
    # ... etc
```

### Creating Nodes & Edges
```python
# In handler method
write_svc = GraphWriteService(repo, queue, session, auto_commit=False)
result = await write_svc.execute(
    GraphWritePayload(
        workspace_id=workspace_id,
        nodes=[
            NodeInput(
                node_type=NodeType.ISSUE,
                label=issue.name[:120],
                content=f"{issue.name}\n\n{issue.description}"[:2000],
                external_id=issue.id,
                properties={...},
            )
        ],
    )
)
# GraphWriteService handles upsert, embedding enqueue, commit
```

---

## Common Questions

**Q: What happens if the MemoryWorker crashes?**
A: Message stays in queue with visibility timeout. After 120s, it becomes visible again for retry. If it fails 2x, it goes to dead-letter queue.

**Q: Can I run multiple MemoryWorkers?**
A: Yes. Batch size = 1 (hard constraint) prevents message loss. Multiple workers just process jobs faster.

**Q: How do I regenerate the entire KG for a workspace?**
A: Call `POST /projects/{project_id}/knowledge-graph/regenerate` for each project. This enqueues jobs for the project + all issues/notes/cycles in it.

**Q: Why are chunks created?**
A: Long issue descriptions and note content are split by markdown headings for better searchability. Each chunk is searchable independently.

**Q: What's the similarity threshold?**
A: 0.75 (min score to create a RELATES_TO edge). Adjust in `_SIMILARITY_THRESHOLD` in kg_populate_handler.py if needed.

**Q: What if the embedding service fails?**
A: Graph nodes are created without embeddings. graph_embedding jobs are enqueued separately and fail gracefully. Hybrid search falls back to BM25-only.

**Q: Can I query the KG?**
A: Yes, via knowledge graph REST API: search, neighbors, subgraph, user context, workspace overview. See KNOWLEDGE_GRAPH_FLOW.md for endpoint docs.

---

## File Organization

```
pilot-space/
├── KG_DOCS_INDEX.md                          ← You are here
├── KNOWLEDGE_GRAPH_README.md                 ← Start here
├── KNOWLEDGE_GRAPH_FLOW.md                   ← Detailed reference
├── KNOWLEDGE_GRAPH_QUICK_REF.md              ← Lookup guide
├── KNOWLEDGE_GRAPH_DIAGRAMS.md               ← Visual diagrams
│
├── backend/src/pilot_space/
│   ├── ai/workers/memory_worker.py           ← Queue consumer
│   ├── application/services/
│   │   ├── issue/create_issue_service.py     ← Entry point
│   │   ├── note/create_note_service.py       ← Entry point
│   │   ├── cycle/create_cycle_service.py     ← Entry point
│   │   └── memory/graph_write_service.py     ← Core write logic
│   ├── infrastructure/queue/handlers/
│   │   └── kg_populate_handler.py            ← Job handler
│   └── api/v1/routers/
│       └── knowledge_graph.py                ← REST API + regenerate
│
└── frontend/src/
    ├── services/api/knowledge-graph.ts       ← API client
    └── features/issues/components/
        ├── issue-knowledge-graph-full.tsx    ← UI panel
        └── issue-knowledge-graph-mini.tsx    ← UI sidebar
```

---

## Debugging Checklist

- [ ] Entity created? `SELECT * FROM issue WHERE id = '...'`
- [ ] Job enqueued? Check logs for "Enqueued kg_populate"
- [ ] Job processed? `SELECT * FROM graph_node WHERE external_id = '...'`
- [ ] Job failed? Check dead-letter queue / logs
- [ ] Embeddings added? `SELECT embedding FROM graph_node WHERE id = '...'` (should be non-null)
- [ ] Edges created? `SELECT * FROM graph_edge WHERE source_id = '...'`
- [ ] Similarity search working? Test via `/workspaces/{id}/knowledge-graph/search`

---

## Testing Tip

Use PostgreSQL for integration tests, not SQLite:

```bash
# Set test DB to PostgreSQL
export TEST_DATABASE_URL="postgresql://user:password@localhost/test_db"

# Run tests
cd backend && uv run pytest tests/knowledge_graph_test.py -v
```

SQLite doesn't support RLS policies, pgvector, or advisory locks, so tests pass with wrong semantics.

---

## Next Steps

1. **Read KNOWLEDGE_GRAPH_README.md** for overview
2. **Read KNOWLEDGE_GRAPH_FLOW.md** for detailed architecture
3. **Bookmark KNOWLEDGE_GRAPH_QUICK_REF.md** for daily lookups
4. **Refer to KNOWLEDGE_GRAPH_DIAGRAMS.md** when explaining to others
5. **Use this index** to navigate between documents

---

## Related Docs

- **CLAUDE.md**: Project instructions
- **docs/DESIGN_DECISIONS.md**: DD-016 (Knowledge Graph integration)
- **docs/PILOT_SPACE_FEATURES.md**: Feature 015–016 (Memory Engine, KG)
- **backend/src/pilot_space/ai/README.md**: AI layer architecture
- **.claude/rules/service-pattern.md**: Service layer pattern
- **.claude/rules/rls-check.md**: RLS security rules

---

## Summary

Four comprehensive documents describe the knowledge graph pipeline:

1. **README** — Quick start & navigation guide
2. **FLOW** — Complete architecture & implementation details
3. **QUICK_REF** — File locations, lookups, code snippets
4. **DIAGRAMS** — Visual flowcharts & state diagrams

Together they provide **end-to-end tracing** from user action → queue → handler → database write, with all edge cases and error handling covered.

For a quick understanding: read the 3-sentence overview in README, then dive into FLOW or DIAGRAMS based on your learning style.
