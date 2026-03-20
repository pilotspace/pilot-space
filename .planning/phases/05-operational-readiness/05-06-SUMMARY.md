---
phase: 05-operational-readiness
plan: "06"
subsystem: operations
tags: [upgrade, runbook, ci, migrations, zero-downtime]
dependency_graph:
  requires:
    - 05-01  # health endpoints used in smoke test and CI readiness assertion
    - 05-05  # pilot backup create/restore referenced in runbook pre-upgrade step
  provides:
    - docs/operations/upgrade-guide.md
    - .github/workflows/upgrade-simulation.yml
  affects:
    - .github/workflows/ci.yml  # upgrade-simulation runs alongside CI
tech_stack:
  added: []
  patterns:
    - additive-migrations rolling upgrade
    - Helm rolling restart with readiness probe gate
    - GitHub Actions service containers (supabase/postgres, redis)
key_files:
  created:
    - docs/operations/upgrade-guide.md
    - .github/workflows/upgrade-simulation.yml
  modified: []
decisions:
  - "Workflow accepts 'degraded' as valid /health/ready outcome — Supabase is non-critical in CI; database + redis healthy = service can serve traffic"
  - "supabase/postgres:15.8.1.076 used in CI service container — matches production Supabase stack for accurate migration testing (pgmq, pgvector, RLS)"
  - "Backend stop runs in always() cleanup step — prevents dangling uvicorn processes on assertion failure"
  - "concurrency group cancel-in-progress — prevents stale upgrade-sim runs on force-push to same ref"
  - "Liveness probe asserted separately before readiness — mirrors Kubernetes probe order; backend must be live before readiness is meaningful"
metrics:
  duration_minutes: 3
  completed_date: "2026-03-08"
  tasks_completed: 2
  files_created: 2
  files_modified: 0
---

# Phase 05 Plan 06: Zero-Downtime Upgrade Runbook and CI Simulation Summary

**One-liner:** Numbered upgrade runbook with schema migration contract + GitHub Actions CI job that runs `alembic upgrade head` → starts backend → asserts `/health/ready` is healthy or degraded.

## What Was Built

### Task 1: Zero-Downtime Upgrade Runbook (`docs/operations/upgrade-guide.md`)

6-step numbered procedure covering:

1. **Pre-upgrade backup** via `pilot backup create --encrypt` with dry-run validation
2. **Additive schema migrations** — `alembic upgrade head` runs against old code (forward-compatible columns)
3. **Verify migration revision** — `alembic current` output compared to `alembic heads`
4. **Helm rolling restart** — `helm upgrade --wait --timeout 10m` with `kubectl rollout status` monitoring
5. **Cleanup migrations** — conditional step for releases marked `CLEANUP` in migration filename
6. **Smoke test** — `/health/ready` status assertion + `/api/v1/workspaces` API check

Also includes:
- Schema migration contract table (additive-only, no drops same release, no renames, no destructive type changes, single head invariant)
- Rollback procedure (kubectl rollout undo → alembic downgrade -1 → full restore)
- Version compatibility matrix
- Reference to CI workflow as automated evidence

### Task 2: CI Upgrade Simulation (`.github/workflows/upgrade-simulation.yml`)

GitHub Actions workflow with:
- **Triggers:** push to main/feat/fix, PR to main, manual dispatch with `prior_version` input
- **Services:** `supabase/postgres:15.8.1.076` + `redis:7-alpine` with health checks
- **Steps:**
  1. Install uv + backend deps
  2. Wait for PostgreSQL (pg_isready loop)
  3. `alembic upgrade head` + `alembic current` (upgrade simulation)
  4. Start uvicorn backend in background, record PID
  5. Assert `/health/live` passes (30s retry loop)
  6. Assert `/health/ready` returns `healthy` or `degraded` (reject `unhealthy`)
  7. Stop backend in `always()` cleanup
- **Concurrency:** cancel-in-progress on same ref

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Accept `degraded` in CI health assertion | Supabase not available in GHA environment; non-critical dep failure → degraded, not unhealthy; database + redis up = can serve traffic |
| `supabase/postgres:15.8.1.076` service image | Matches production stack; ensures pgmq, pgvector, RLS semantics in migrations are exercised correctly |
| Backend stop in `always()` | Guarantees no dangling uvicorn process even when assertions fail |
| Liveness probe checked before readiness | Mirrors Kubernetes probe order; avoids race condition where readiness is tested before server binds |
| `concurrency: cancel-in-progress` | Prevents parallel stale runs on force-push; same pattern as CI workflow |

## Deviations from Plan

None — plan executed exactly as written. The SYNC_DATABASE_URL env var was added to the CI workflow steps (not in plan) to ensure Alembic's synchronous engine can connect during migrations — this is a Rule 2 (missing critical functionality) auto-add since Alembic uses synchronous psycopg2 for migrations even when the app uses asyncpg.

### Auto-added: SYNC_DATABASE_URL in CI workflow

- **Found during:** Task 2
- **Issue:** Alembic uses a synchronous PostgreSQL driver (psycopg2) for `alembic upgrade head`. Without SYNC_DATABASE_URL set to `postgresql+psycopg2://...`, the migration step would fail with a driver compatibility error.
- **Fix:** Added `SYNC_DATABASE_URL: postgresql+psycopg2://postgres:testpassword@localhost:5432/pilot_space_test` to both the migration and backend start steps.
- **Files modified:** `.github/workflows/upgrade-simulation.yml`

## Self-Check: PASSED

| Item | Status |
|------|--------|
| `docs/operations/upgrade-guide.md` | FOUND |
| `.github/workflows/upgrade-simulation.yml` | FOUND |
| Commit `e2bfd84e` (Task 1) | FOUND |
| Commit `d5503bab` (Task 2) | FOUND |
