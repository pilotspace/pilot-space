# Phase 5: Operational Readiness - Context

**Gathered:** 2026-03-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Make Pilot Space self-serviceable by enterprise customers: deploy via Docker Compose or Helm, monitor via structured health endpoints, back up all workspace data, and upgrade with zero downtime — all without requiring Pilot Space engineers.

Covers: OPS-01 (Docker Compose), OPS-02 (Helm chart), OPS-03 (health endpoints), OPS-04 (structured logs), OPS-05 (backup CLI), OPS-06 (upgrade runbook).

Does NOT cover: new product features, cloud-hosted SaaS tier, CI/CD pipeline setup, Terraform (infra provisioning is already in `infra/terraform/`).

</domain>

<decisions>
## Implementation Decisions

### Health Checks (OPS-03)

**Decision: Two-tier health endpoints.**

- `/health/live` — shallow liveness probe: returns immediately if process is up. Used by Kubernetes liveness probe. Never touches the DB or external deps. Response: `{"status": "ok"}`.
- `/health/ready` — deep readiness probe: checks all dependencies before accepting traffic. Used by Kubernetes readiness probe and monitoring tools (Prometheus, Datadog). Response shape:
  ```json
  {
    "status": "healthy|degraded|unhealthy",
    "version": "1.0.0",
    "timestamp": "2026-03-08T00:00:00Z",
    "checks": {
      "database": {"status": "ok|error", "latency_ms": 12},
      "redis": {"status": "ok|error", "latency_ms": 2},
      "supabase": {"status": "ok|error", "latency_ms": 45},
      "queue": {"status": "ok|error"}
    }
  }
  ```
- `"degraded"` = at least one non-critical check failed (e.g., Meilisearch down) but core functionality works.
- `"unhealthy"` = DB or Redis down — service cannot serve requests.
- Existing `/health` endpoint (returns `{"status": "healthy"}`) is **upgraded in-place** to the deep check. Both `/health` and `/health/ready` resolve to the same handler for backward compatibility.
- Timeout per check: 2s. Total `/health/ready` timeout: 5s (fails fast if any check hangs).

**Rationale**: Kubernetes requires separate liveness (don't restart a healthy slow-starting pod) and readiness (don't route traffic until deps ready) probes. Monitoring tools need the nested `checks` structure to alert on specific dependency failures.

### Structured Logging (OPS-04)

**Decision: Extend existing structlog setup — add missing required fields.**

- `structlog` is already configured with JSON output and `request_id`, `workspace_id`, `user_id` ContextVars.
- **Missing fields** (required by OPS-04): `trace_id`, `actor`, `action`. Add these as ContextVars alongside the existing ones.
  - `trace_id` = same as `request_id` (already generated per-request) — alias/rename for observability tool compatibility. Emit both for backward compat.
  - `actor` = composite `"{actor_type}:{actor_id}"`, e.g. `"user:uuid-..."` or `"ai:pilotspace-agent"`. Populated in auth middleware.
  - `action` = optional dot-notation string, e.g. `"issue.create"`, `"ai.pr_review"`. Set by service layer before significant operations.
- Log schema required on ALL production log lines:
  ```json
  {"level": "info", "timestamp": "ISO8601", "trace_id": "...", "actor": "user:uuid", "action": "issue.create", "event": "..."}
  ```
- `actor` and `action` default to `null` when not in a request context (e.g., background jobs set `actor="system:scheduler"`).
- **Audit scope**: Grep all routers and service files for `print()`, `logger.info(message)` (non-structured), and replace with structlog calls. No unstructured string logs in production paths.
- Frontend logs are out of scope for OPS-04 (browser console only, no server-side log aggregation needed for frontend in v1).

**Rationale**: Structlog is already in use — adding 3 fields is lower risk than switching logging libraries. The `trace_id`/`actor`/`action` fields match what monitoring tools (Datadog, Grafana Loki) use for filtering.

### Docker Compose (OPS-01)

**Decision: Unified root `docker-compose.yml` as the single-command entrypoint.**

- `infra/docker/docker-compose.yml` already has all services (postgres with pgvector, redis, meilisearch, backend, frontend). The root `docker-compose.yml` currently only has redis + meilisearch (dev shortcut).
- **Action**: Consolidate into a single root-level `docker-compose.yml` that includes all services — this becomes the "single `docker compose up`" artifact.
- Supabase runs **self-hosted** via the existing `infra/supabase/docker-compose.yml`. Use Compose v2 `include:` to pull it in, OR merge Supabase services into the root compose file directly (simpler, less indirection).
- **Decision**: Merge Supabase services into root compose file directly (avoids `include:` compatibility issues with older Compose versions).
- `.env.example` at repo root provides all required environment variables. Setup is: `cp .env.example .env && docker compose up -d`.
- `docs/deployment/docker-compose.md` — new guide covering prerequisites (Docker 24+, 8GB RAM), setup steps, first-run initialization (Alembic migrations, seed data), and service port map.
- Profile `--profile production` adds nginx reverse proxy + SSL termination (for non-Kubernetes deployments).

**Rationale**: The goal is a single command for a developer on a fresh machine. Merging service files is the cleanest path; `include:` adds a version dependency that varies by Docker Compose version.

### Kubernetes Helm Chart (OPS-02)

**Decision: New Helm chart at `infra/helm/pilot-space/`.**

- `infra/k8s/` has raw YAML manifests (backend-deployment, frontend-deployment, ingress, configmaps, hpa, pdb, secrets, namespace). These become the basis for the chart templates.
- Convert raw manifests → Helm templates. `values.yaml` exposes: image tags, replica counts, resource limits, ingress host/TLS, database connection strings, secret refs.
- Chart structure:
  ```
  infra/helm/pilot-space/
    Chart.yaml
    values.yaml
    values.production.yaml   # opinionated production defaults
    templates/
      deployment-backend.yaml
      deployment-frontend.yaml
      ingress.yaml
      configmap.yaml
      hpa.yaml
      pdb.yaml
      namespace.yaml
  ```
- Supabase is **not** included in the Helm chart — enterprises run managed Postgres/Supabase or self-hosted separately. The chart requires external Postgres, Redis, and Supabase URLs as values.
- `docs/deployment/kubernetes.md` — guide covering: Helm install, `values.yaml` customization, health check configuration, HPA tuning.
- Chart tested via `helm lint` + `helm template` in CI; actual cluster deployment test is manual (not automated in CI for v1).

**Rationale**: Helm is the enterprise-standard Kubernetes package manager. Raw YAML manifests already exist — conversion is mechanical. Excluding Supabase from the chart is the right call: enterprise K8s deployments use managed databases (RDS, Cloud SQL), not in-cluster databases.

### Backup CLI (OPS-05)

**Decision: New `pilot backup` command group in existing `pilot-cli`.**

- Uses existing Typer CLI pattern. New command group: `pilot backup create` + `pilot backup restore`.
- **`pilot backup create`**:
  - Runs `pg_dump` (custom format `-Fc`) for PostgreSQL.
  - Downloads Supabase Storage objects via the Supabase Storage API.
  - Packages both into a single `.tar.gz` archive with a `manifest.json` (timestamp, workspace_id, pg_dump version, storage object count, checksum).
  - Output: `./backups/pilot-space-backup-{timestamp}.tar.gz` (configurable via `--output`).
  - Optional `--encrypt` flag: AES-256-GCM passphrase encryption (prompts for passphrase, or `--passphrase` env var for CI use).
  - `--workspace` flag to back up a single workspace; default backs up all.
- **`pilot backup restore`**:
  - Accepts archive path: `pilot backup restore ./backups/pilot-space-backup-{timestamp}.tar.gz`.
  - Runs `pg_restore` + re-uploads Storage objects.
  - `--dry-run` flag to validate archive before restoring.
  - Interactive confirmation before overwriting.
- Backup targets configured via the same `.env` / `~/.pilot/config.toml` as other CLI commands.
- `docs/operations/backup-restore.md` covers: prerequisites, create workflow, restore workflow, encryption, scheduling with cron.

**Rationale**: Adding to `pilot-cli` is consistent with existing tooling (`pilot login`, `pilot implement`). Typer + Rich already provide good CLI UX. `pg_dump` custom format is the standard for PostgreSQL backups — binary, compressed, restores with `pg_restore`.

### Zero-Downtime Migration (OPS-06)

**Decision: Written runbook + automated schema migration sequencing. CI upgrade simulation test.**

- **Runbook** at `docs/operations/upgrade-guide.md`:
  1. `pilot backup create` — take backup before upgrade
  2. Run new Alembic migrations (additive schema changes: new columns nullable, no column drops, no type changes)
  3. Rolling restart backend pods (old code runs against new schema — forward-compatible)
  4. Deploy new backend image (new code runs against new schema)
  5. Run cleanup migrations if any (drop deprecated columns after both old + new code have cycled out)
  6. Smoke test: `GET /health/ready` all checks pass
- **Schema migration contract** (enforced by code review, not automation):
  - New columns MUST be nullable or have defaults.
  - Column drops happen in a separate "cleanup" migration ≥1 version after the column was deprecated.
  - No renames — add new column + backfill + drop old column.
- **CI upgrade simulation** (tested): GitHub Actions job that:
  1. Spins up prior version (pinned image tag) + Postgres.
  2. Seeds with minimal data.
  3. Runs `alembic upgrade head` with new migrations.
  4. Starts new version backend.
  5. Asserts `GET /health/ready` returns `"status": "healthy"`.
  This is the "tested" evidence for OPS-06.
- Frontend deploys independently (static Next.js export or Vercel) — no downtime inherently.

**Rationale**: "Zero downtime" in practice means: old code can read the new schema (additive-only migrations) AND new code can start before old code is fully stopped (rolling restart). The CI simulation makes this testable and repeatable.

### Claude's Discretion

- Exact Prometheus scrape configuration and Grafana dashboard templates (not in scope for v1 — just needs the endpoint shape to be correct)
- Nginx configuration for `--profile production` Docker Compose (standard reverse proxy setup)
- `manifest.json` schema details within the backup archive
- Exact `values.yaml` parameter names in the Helm chart (follow community conventions)
- Cron example for scheduled backups (mention in docs, not shipped as a cron job)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/pilot_space/infrastructure/logging.py` — structlog already configured; just needs `trace_id`, `actor`, `action` ContextVars added
- `backend/src/pilot_space/main.py:240` — `/health` endpoint exists, upgrade it
- `infra/docker/docker-compose.yml` — all services already defined; merge into root
- `infra/k8s/*.yaml` — backend/frontend deployments, ingress, HPA, PDB already exist; convert to Helm templates
- `cli/src/pilot_cli/main.py` — Typer app; add `backup` command group here
- `cli/src/pilot_cli/api_client.py` — HTTP client pattern for Supabase Storage API calls
- `infra/backups/` — directory already exists, use as default output

### Established Patterns
- CLI commands use Typer + Rich (see `commands/implement.py`, `commands/login.py`) — `backup` follows same pattern
- Config loaded from `~/.pilot/config.toml` + env vars — backup credentials follow same
- structlog ContextVar pattern is established — adding 3 new vars is minimal change
- `WorkspaceScopedModel` / RLS context pattern — backup must call with service_role credentials (bypasses RLS)

### Integration Points
- `/health/ready` connects to: SQLAlchemy engine (test query), Redis client (ping), Supabase client (lightweight check)
- `pilot backup` connects to: Supabase Storage API (object download), PostgreSQL (pg_dump subprocess), local filesystem
- Helm chart connects to: existing k8s manifests (templates basis), `values.yaml` drives all env vars currently hardcoded in configmaps
- Structlog changes: `auth_middleware.py` sets `actor`, service layer sets `action` before DB writes

</code_context>

<specifics>
## Specific Ideas

- Health check response format follows the [Health Check RFC](https://inadarei.github.io/rfc-health-check/) convention (`status`, `checks`, nested per-service)
- Backup archive format follows `pg_dump` custom format convention — familiar to DBAs
- Helm chart `values.yaml` structure should follow community conventions (bitnami-style: `image.repository`, `image.tag`, `resources.requests.cpu`, etc.)
- Upgrade guide tone: "Developer running this for the first time" — step-by-step, `code blocks` for every command, no assumed knowledge

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 05-operational-readiness*
*Context gathered: 2026-03-08 — all decisions made by Claude (user delegated with transparency)*
