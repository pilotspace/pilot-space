# Infrastructure Layer Development Guide - Pilot Space

**For backend overview and general context, see `backend/CLAUDE.md`**

---

## Quick Reference

### Infrastructure Components

| Component | Technology | Count | Purpose |
|-----------|-----------|-------|---------|
| Models | SQLAlchemy 2.0 async | 35 | PostgreSQL entities with soft delete, RLS |
| Repositories | BaseRepository[T] | 18 | Type-safe data access with pagination |
| Migrations | Alembic | 36+ | Schema versioning, RLS policies, indexes |
| Database | PostgreSQL 16 | 1 | Async via Supabase (DD-060) |
| Cache | Redis 7 | 1 | Session cache (30-min TTL), AI cache (7-day TTL) |
| Search | Meilisearch 1.6 | 1 | Full-text search (typo-tolerant) |
| Queue | pgmq via Supabase | 1 | Async task processing (PR review, embeddings) |
| Auth | Supabase Auth (GoTrue) | 1 | JWT validation + RLS enforcement |
| Encryption | Supabase Vault | 1 | API key storage (AES-256-GCM) |

---

## Submodule Documentation

- **[database/CLAUDE.md](database/CLAUDE.md)** -- SQLAlchemy Models (35 total, inheritance hierarchy, mixins), Repository Pattern (BaseRepository[T], 18 specialized repos, eager loading, cursor pagination), Database Connection & Session Management, Migrations (36+ via Alembic, RLS migration pattern)
- **[auth/CLAUDE.md](auth/CLAUDE.md)** -- RLS Architecture (set_rls_context, clear_rls_context), RLS Policies (workspace isolation SQL, user table, workspace members), RLS Verification Checklist, Common RLS Pitfalls, Authentication (SupabaseAuthClient JWT), Encryption (EncryptionService AES-256-GCM, BYOK pattern)

---

## Directory Structure

```
infrastructure/
+-- database/
|  +-- models/              (35 SQLAlchemy models)
|  +-- repositories/        (18 repositories + BaseRepository)
|  +-- engine.py            (SQLAlchemy engine, session factory, pooling)
|  +-- rls.py               (RLS context setters, policy SQL generators)
|  +-- types.py             (JSONBCompat, custom column types)
|
+-- cache/
|  +-- redis.py            (RedisClient: async ops, JSON serialization)
|  +-- ai_cache.py         (AICache: prompt/response caching with TTLs)
|
+-- auth/
|  +-- supabase_auth.py    (SupabaseAuthClient: JWT validation)
|
+-- search/
|  +-- meilisearch.py      (MeilisearchClient: full-text, workspace-scoped)
|  +-- config.py           (IndexName, INDEX_CONFIGS)
|
+-- queue/
|  +-- supabase_queue.py   (SupabaseQueueClient: pgmq via RPC)
|  +-- handlers/            (Task-specific processors)
|
+-- jobs/
|  +-- expire_approvals.py (Scheduled: auto-expire approvals after 24h)
|
+-- encryption.py          (Supabase Vault integration)
```

---

## Infrastructure Initialization

**Application Startup** (`main.py` lifespan): Test database connection, initialize Redis, Meilisearch. All clients connected at startup, disconnected at shutdown.

**Dependency Injection Container** (`container.py`): Singletons for config, engine, session_factory, Redis. Factories for repositories and services (new per request). Injected via FastAPI Depends().

---

## Cache Layer (`cache/`)

**RedisClient**: Async operations with JSON serialization. Connection pool with configurable max_connections, socket_timeout. Methods: set (with TTL), get, delete, incr, exists.

**AICache**: Caches AI responses by prompt hash (SHA-256) with workspace scoping. TTL: 7 days for responses, 24h for context.

| Cache Key Pattern | TTL | Purpose |
|-------------------|-----|---------|
| `session:{session_id}` | 30min | Hot session cache |
| `ai:context:{issue_id}` | 24h | AI context for issue |
| `ai:response:{hash}` | 7d | Response by prompt hash |
| `rate_limit:{user_id}:{endpoint}` | 1min | Rate limit counters |

---

## Search Layer (`search/`)

**MeilisearchClient**: Workspace-scoped full-text search with typo tolerance. Methods: search() (with workspace_id filter, faceting, limit), index_document() (add/update). Index configs define searchable, filterable, and sortable attributes per index (issues, notes, pages). Returns SearchResult with matched documents and task info.

---

## Queue Layer (`queue/`)

**SupabaseQueueClient**: Async task processing via pgmq (PostgreSQL Message Queue). Methods: enqueue() (with visibility timeout), dequeue() (batch), ack() (remove after success). Queue names: AI_TASKS, PR_REVIEWS, WEBHOOKS, NOTIFICATIONS. Queue handlers in `handlers/` process messages asynchronously and ack on success.

---

## Common Patterns & Anti-Patterns

**Eager Load Relationships**: Use `.options(joinedload(...))` for one-to-one, `.options(selectinload(...))` for one-to-many. Prevents N+1 queries.

**Workspace Scoping**: Always filter by workspace_id in queries. Missing scoping causes RLS violations.

**Soft Delete**: Default is soft delete (sets is_deleted=True). Hard delete only for cleanup.

**Anti-Pattern - Lazy Loading**: Accessing relationships in loops triggers query per item.

**Anti-Pattern - Blocking I/O**: Never use blocking file I/O, time.sleep(), or subprocess in async functions.

---

## Troubleshooting

**N+1 Query Detection**: Enable SQLAlchemy echo (engine with echo=True). Look for repeated SELECT for same entity type. Fix with eager loading.

**RLS Enforcement**: Run `SELECT current_setting('app.current_user_id')` to verify RLS context. Test cross-workspace isolation in integration tests.

**Connection Pool Exhaustion**: "QueuePool Overflow" means max_overflow reached. Check pool stats with engine.pool.checkedout(). Increase max_overflow or reduce concurrent requests.

---

## Best Practices Summary

**Database**: Async-only, eager load relationships, soft delete, RLS enforcement, indexes on filtered columns.

**Repositories**: Inherit from BaseRepository[T], always filter by workspace_id, type hints, document complex filters.

**Migrations**: Auto-generate, always include RLS policies, add indexes, test rollback locally.

**Caching**: Redis for session state (30-min TTL), AI responses by prompt hash (7-day TTL), graceful degradation on cache miss.

**Security**: RLS is the enforcement boundary, encrypt via Vault, validate workspace membership, never trust user input without RLS.

---

## Generation Metadata

**Generated**: 2026-02-10 | **Scope**: 35 models, 18 repos, 36+ migrations, 5 infrastructure services

**Patterns**: BaseRepository[T] generic CRUD, WorkspaceScopedModel mixin, eager loading, cursor pagination, RLS enforcement, async SQLAlchemy 2.0, Redis hot cache + PostgreSQL durable, Supabase platform consolidation

**Coverage Gaps**: Health check endpoints (partial), migration rollback tests (manual), performance regression tests (missing), Vault encryption integration tests (mocked)
