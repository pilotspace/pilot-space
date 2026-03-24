# Knowledge Graph Generation Pipeline — Complete Documentation

This document set provides a comprehensive trace of the knowledge graph (KG) generation pipeline in Pilot Space, from entry points through to final database writes.

## Document Overview

### 1. **KNOWLEDGE_GRAPH_FLOW.md** (Main Reference)
Complete end-to-end pipeline flow with detailed explanations of each stage:
- Entry points (CreateIssueService, CreateNoteService, CreateCycleService)
- Queue message structure and MemoryWorker consumption
- KgPopulateHandler dispatch by entity type
- GraphWriteService node/edge upsert logic
- Database persistence and RLS
- Performance characteristics
- Testing notes

**Best for**: Understanding the complete pipeline architecture and design decisions.

### 2. **KNOWLEDGE_GRAPH_QUICK_REF.md** (Developer Quick Reference)
Fast lookup guide with tables, code snippets, and quick references:
- File locations for all components
- Execution sequence (simplified)
- Handler dispatch table
- Node creation rules (per entity type)
- Edge creation rules
- Similarity search parameters
- Constants & thresholds
- Related services

**Best for**: Quickly finding file paths, understanding a specific component, or looking up thresholds.

### 3. **KNOWLEDGE_GRAPH_DIAGRAMS.md** (Visual Reference)
ASCII diagrams showing the complete pipeline visually:
- Complete pipeline flow with all branches
- Node & edge hierarchy
- Chunking & content processing flow
- Similarity search flow
- Regeneration triggers
- Error handling & retry logic
- Final database state
- Performance timeline

**Best for**: Visual learners, understanding data flow, or explaining the system to others.

---

## Quick Start

### What happens when an issue is created?

```
1. User creates issue via POST /issues
2. CreateIssueService saves to DB
3. Enqueues kg_populate job to AI_NORMAL queue
4. MemoryWorker dequeues (2–5 seconds later)
5. KgPopulateHandler._handle_issue() processes
6. Creates ISSUE node + NOTE_CHUNK nodes (if description chunked)
7. Creates BELONGS_TO edge (ISSUE → PROJECT)
8. Creates RELATES_TO edges (semantic similarity search)
9. Enqueues graph_embedding jobs
10. Database commit ✓
```

### What happens when a note is created?

```
1. User creates note via POST /notes
2. CreateNoteService saves to DB
3. Enqueues kg_populate job (if project_id set)
4. MemoryWorker processes
5. KgPopulateHandler._handle_note() processes
6. Converts TipTap JSON → Markdown
7. Creates NOTE node + NOTE_CHUNK nodes
8. Creates PARENT_OF edges (NOTE → chunks)
9. Creates BELONGS_TO edge (NOTE → PROJECT)
10. Creates RELATES_TO edges (similarity)
11. Enqueues graph_embedding jobs
12. Database commit ✓
```

### What happens when user clicks "Regenerate Knowledge Graph"?

```
1. User clicks button in IssueKnowledgeGraphFull
2. Frontend calls knowledgeGraphApi.regenerateIssueGraph(workspaceId, issueId)
3. Backend endpoint regenerate_issue_knowledge_graph() enqueues kg_populate job
4. Same flow as creation above
5. Toast shows "Knowledge graph regeneration started (1 job enqueued)"
6. Frontend refetches graph data after 3 seconds
```

---

## Key Concepts

### Node Types
- **ISSUE**: Wraps issue name + description
- **NOTE**: Wraps note title + markdown content
- **NOTE_CHUNK**: Section/heading chunks for long content (searchable segments)
- **PROJECT**: Wraps project metadata
- **CYCLE**: Wraps sprint/cycle metadata

### Edge Types
- **BELONGS_TO**: Entity → Project (structural, weight=1.0)
- **PARENT_OF**: Parent entity → Chunk (structural, weight=1.0)
- **RELATES_TO**: Semantic similarity (weighted by embedding score, 0.0–1.0)

### Key Constraints
- **Similarity threshold**: 0.75 (only edges with similarity >= this value created)
- **Max edges per node**: 5 RELATES_TO edges
- **Min chunk size**: 50 characters (smaller content not chunked)
- **Queue batch size**: 1 (hard constraint, prevents message loss)
- **Retry limit**: 2 attempts before dead-letter
- **Visibility timeout**: 120 seconds

### Idempotency
All operations are **idempotent** via upsert semantics:
- Node upsert: `INSERT ... ON CONFLICT(external_id, workspace_id) DO UPDATE`
- Edge upsert: `INSERT ... ON CONFLICT(source_id, target_id, edge_type) DO UPDATE`
- Chunk deletion before creation: ensures clean regeneration

---

## File Location Quick Index

| Component | File |
|-----------|------|
| CreateIssueService | `backend/src/pilot_space/application/services/issue/create_issue_service.py:243–259` |
| CreateNoteService | `backend/src/pilot_space/application/services/note/create_note_service.py:216–232` |
| CreateCycleService | `backend/src/pilot_space/application/services/cycle/create_cycle_service.py:158–174` |
| MemoryWorker | `backend/src/pilot_space/ai/workers/memory_worker.py` |
| KgPopulateHandler | `backend/src/pilot_space/infrastructure/queue/handlers/kg_populate_handler.py` |
| GraphWriteService | `backend/src/pilot_space/application/services/memory/graph_write_service.py` |
| REST API (regenerate) | `backend/src/pilot_space/api/v1/routers/knowledge_graph.py:534–674` |
| Frontend API | `frontend/src/services/api/knowledge-graph.ts` |
| Frontend UI | `frontend/src/features/issues/components/issue-knowledge-graph-full.tsx` |

---

## Common Tasks

### Debug a missing knowledge graph node

1. Check if entity was created: `SELECT * FROM issue WHERE id = '...'`
2. Check if job was enqueued: (check logs for "Enqueued kg_populate")
3. Check if job was processed: `SELECT * FROM graph_node WHERE external_id = '...'`
4. Check dead-letter queue if job failed: look for error messages in worker logs
5. Manually regenerate: `POST /workspaces/{ws_id}/issues/{issue_id}/knowledge-graph/regenerate`

### Add a new entity type to KG (e.g., "feature")

1. Add enqueue call in CreateFeatureService (copy from CreateIssueService pattern)
2. Add handler method `_handle_feature()` in KgPopulateHandler
3. Dispatch in `handle()` method: `if p.entity_type == "feature": return await self._handle_feature(p)`
4. Define Feature node type in domain/graph_node.py (NodeType.FEATURE)
5. Update node/edge creation logic

### Improve similarity search results

1. Adjust `_SIMILARITY_THRESHOLD` (currently 0.75) in kg_populate_handler.py
2. Adjust `_MAX_SIMILAR_EDGES` (currently 5) to show more/fewer related nodes
3. Tune embedding service (OpenAI vs Ollama vs Google)
4. Consider hybrid search weights in KnowledgeGraphRepository.hybrid_search()

### Regenerate KG for entire workspace

1. Get all projects: `SELECT id FROM project WHERE workspace_id = '...' AND NOT is_deleted`
2. For each project: `POST /projects/{id}/knowledge-graph/regenerate`
3. Monitor worker logs as it processes
4. Check graph tables for new nodes/edges

---

## Architecture Highlights

### Resilience
- **Non-blocking enqueue**: KG jobs don't block primary flows
- **Retry mechanism**: 2 attempts before dead-letter
- **Async processing**: MemoryWorker processes jobs independently
- **Idempotent operations**: Safe to regenerate without cleanup

### Scalability
- **Per-job session**: Each job has own AsyncSession (clean transaction boundaries)
- **Bounded concurrency**: Embedding enqueue limited to 10 in-flight (Semaphore)
- **Batch processing**: Nodes/edges upserted in single transaction
- **Queue-based**: Horizontal scaling via queue worker replicas

### Data Consistency
- **RLS isolation**: workspace_id filtering on all queries
- **External ID deduplication**: Nodes keyed by external_id + workspace_id
- **Content hashing**: Unkeyed nodes deduplicated by content hash
- **Advisory locks**: Prevent chunk race conditions on concurrent note updates

### Performance
- **Synchronous create**: Issue/note creation returns in ~100ms
- **Async KG processing**: 500ms–3s depending on content size
- **Embedding enqueue before commit**: Crash recovery friendly
- **Hybrid search**: Vector + BM25 + recency scoring

---

## Testing Strategy

### Unit Tests
- Mock SupabaseQueueClient to verify enqueue calls
- Mock EmbeddingService to avoid API calls
- Test KgPopulateHandler dispatch logic
- Test GraphWriteService node/edge creation

### Integration Tests
- Use PostgreSQL (not SQLite) for RLS/pgvector/advisory lock testing
- Spin up MemoryWorker alongside tests
- Verify end-to-end: create issue → queue message → processed → graph nodes created
- Test regeneration: verify idempotency (run twice, same result)

### Load Tests
- Enqueue bulk kg_populate jobs (project regeneration)
- Monitor worker throughput (jobs per second)
- Verify queue doesn't back up (process time < batch interval)
- Check for memory leaks (long-running worker)

---

## Known Limitations

### SQLite (Test DB)
- RLS policies are no-ops (direct workspace_id filtering needed)
- pgvector not available (embedding search won't work)
- Advisory locks not available (concurrent note updates may race)
- **Workaround**: Use PostgreSQL for integration tests

### Content Limits
- Node content capped at 2000 characters
- Label capped at 120 characters
- Long issue descriptions automatically chunked
- Long note content automatically chunked

### Similarity Search
- Only same-project nodes matched
- Requires embedding service to be operational
- Similarity threshold (0.75) is tuning parameter
- Max 5 edges per node (prevents fully-connected graphs)

### Error Handling
- Chunk enrichment failures are silent (logged, not fatal)
- Edge upsert failures increment counter (partial success OK)
- Embedding service failures don't block KG creation (embeddings added later)

---

## Related Components

### AI Layer
- `PilotSpaceAgent`: Orchestrator that may query KG via KnowledgeGraphQueryService
- `GhostTextAgent`: Uses KG context for code/text suggestions
- `IntentAgent`: May route to KG for context enrichment

### API Layer
- `KnowledgeGraphQueryService`: Queries KG (search, neighbors, subgraph)
- `GraphSearchService`: Hybrid search implementation
- `KnowledgeGraphRepository`: DB access for nodes/edges

### Frontend
- `issue-knowledge-graph-full.tsx`: Interactive graph visualization (ReactFlow)
- `issue-knowledge-graph-mini.tsx`: Compact graph sidebar
- `knowledgeGraphApi`: REST client for all KG operations

---

## Further Reading

- **Design Decision 016**: Knowledge Graph integration (see `docs/DESIGN_DECISIONS.md`)
- **Memory Engine Pattern**: See `backend/src/pilot_space/ai/README.md`
- **Feature Specs**: See `docs/PILOT_SPACE_FEATURES.md` (Feature 015–016)
- **RLS Security**: See `.claude/rules/rls-check.md` for security policies
- **Service Pattern**: See `.claude/rules/service-pattern.md` for architecture

---

## Support & Debugging

### Check MemoryWorker Logs
```bash
# Start worker with verbose logging
cd backend
RUST_LOG=debug uv run python -m pilot_space.cli.memory_worker
```

### Query Graph Tables
```sql
-- See all nodes for workspace
SELECT id, node_type, label, updated_at
FROM graph_node
WHERE workspace_id = 'workspace-uuid'
ORDER BY updated_at DESC;

-- See edges for a node
SELECT * FROM graph_edge
WHERE source_id = 'node-uuid' OR target_id = 'node-uuid';

-- See dead-letter messages
SELECT * FROM ai_normal_dlq ORDER BY created_at DESC;
```

### Manual Regeneration
```bash
# Single issue
curl -X POST http://localhost:8000/workspaces/{ws-id}/issues/{issue-id}/knowledge-graph/regenerate \
  -H "Authorization: Bearer {token}"

# Entire project
curl -X POST http://localhost:8000/workspaces/{ws-id}/projects/{project-id}/knowledge-graph/regenerate \
  -H "Authorization: Bearer {token}"
```

---

## Summary

The knowledge graph generation pipeline is a **robust, scalable, idempotent** background job system that:

1. **Triggers asynchronously** on SDLC entity creation
2. **Supports manual regeneration** via HTTP endpoints
3. **Processes jobs sequentially** with retry & dead-letter handling
4. **Creates semantic nodes & edges** via embedding similarity
5. **Supports chunking** for long documents (issues, notes)
6. **Maintains workspace isolation** via RLS policies
7. **Enables AI context** for the AI orchestrator layer

All three documents (FLOW, QUICK_REF, DIAGRAMS) should be read together for complete understanding. Start with FLOW for architecture, use QUICK_REF for lookups, and refer to DIAGRAMS for visual understanding.
