# Phase 5: Operational Readiness - Research

**Researched:** 2026-03-08
**Domain:** DevOps / Platform Engineering — Docker Compose, Helm, structured logging, backup CLI, zero-downtime migrations
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Health Checks (OPS-03)**
- `/health/live` — shallow liveness: `{"status": "ok"}`. Never touches DB or deps.
- `/health/ready` — deep readiness: checks database, redis, supabase, queue with structured JSON response. Timeout: 2s/check, 5s total.
- `"degraded"` = non-critical dep down (Meilisearch); `"unhealthy"` = DB or Redis down.
- Existing `/health` endpoint upgraded in-place. Both `/health` and `/health/ready` resolve to same deep-check handler for backward compat.

**Structured Logging (OPS-04)**
- Extend existing structlog setup — add `trace_id`, `actor`, `action` ContextVars.
- `trace_id` = alias/rename of existing `request_id`. Emit both.
- `actor` = composite `"{actor_type}:{actor_id}"` string. Populated in auth middleware.
- `action` = optional dot-notation string. Set by service layer before significant operations.
- Default to `null` in non-request contexts; background jobs use `actor="system:scheduler"`.
- Grep all routers and service files for `print()` and non-structured `logger.info(message)` calls; replace with structlog.
- Frontend logs are out of scope.

**Docker Compose (OPS-01)**
- Consolidate into single root-level `docker-compose.yml`.
- Merge Supabase services directly (not `include:` — compatibility issues with older Compose versions).
- `.env.example` at repo root. Setup: `cp .env.example .env && docker compose up -d`.
- `docs/deployment/docker-compose.md` — new guide.
- Profile `--profile production` adds nginx reverse proxy + SSL termination.

**Kubernetes Helm Chart (OPS-02)**
- New Helm chart at `infra/helm/pilot-space/`.
- Convert existing `infra/k8s/*.yaml` raw manifests to Helm templates.
- Supabase NOT included in chart — enterprises use managed Postgres/Supabase.
- `docs/deployment/kubernetes.md` — new guide.
- Tested via `helm lint` + `helm template` in CI; cluster test is manual for v1.

**Backup CLI (OPS-05)**
- New `pilot backup` command group in existing `pilot-cli`.
- `pilot backup create`: pg_dump (custom format `-Fc`), Supabase Storage download, `.tar.gz` archive with `manifest.json`, optional `--encrypt` (AES-256-GCM).
- `pilot backup restore`: pg_restore + Storage re-upload, `--dry-run`, interactive confirmation.
- Config via `.env` / `~/.pilot/config.toml`.
- `docs/operations/backup-restore.md`.

**Zero-Downtime Migration (OPS-06)**
- Written runbook at `docs/operations/upgrade-guide.md`.
- Schema migration contract: new columns nullable or with defaults; no column drops in same release; no renames.
- CI upgrade simulation GitHub Actions job: prior image → Alembic upgrade → new image → `/health/ready` assertion.
- Frontend deploys independently — no downtime inherently.

### Claude's Discretion
- Exact Prometheus scrape configuration and Grafana dashboard templates
- Nginx configuration for `--profile production` Docker Compose
- `manifest.json` schema details within the backup archive
- Exact `values.yaml` parameter names in the Helm chart (follow bitnami-style community conventions)
- Cron example for scheduled backups (mention in docs, not shipped as cron job)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| OPS-01 | Docker Compose configuration for all components (backend, frontend, Supabase, Redis) — single `docker compose up` | Existing `infra/docker/docker-compose.yml` covers all services; merge Supabase from `infra/supabase/docker-compose.yml`; add nginx production profile |
| OPS-02 | Kubernetes Helm chart for production-grade deployment | Existing `infra/k8s/*.yaml` manifests are the template source; `helm create` scaffolds chart structure; `helm lint` validates |
| OPS-03 | Structured JSON health check endpoints consumable by monitoring tools | Existing `/health` and `/ready` endpoints need upgrade to two-tier pattern; FastAPI async health checker pattern documented below |
| OPS-04 | Structured JSON logs with level, timestamp, trace_id, actor, action | structlog already configured in `infrastructure/logging.py`; 3 new ContextVars needed; middleware audit required |
| OPS-05 | CLI backup of PostgreSQL + Supabase Storage via provided CLI tooling | Typer/Rich CLI pattern established in `pilot-cli`; `pg_dump`/`pg_restore` subprocess; Supabase Storage API via httpx; cryptography library for AES-256-GCM |
| OPS-06 | Zero-downtime migration path documented and tested from prior MVP to enterprise release | CI upgrade simulation job; additive-only schema migration contract; rolling restart strategy |
</phase_requirements>

---

## Summary

Phase 5 is entirely infrastructure and operational tooling — no new product features. All six requirements build on existing code and manifests already present in the repository. The work divides into four independent streams: (1) health endpoints, (2) structured logging extension, (3) deployment packaging (Docker Compose + Helm), and (4) operational tooling (backup CLI + upgrade runbook).

The structlog infrastructure is already 80% complete: JSON output, request context ContextVars, and middleware wiring exist. Adding `trace_id`, `actor`, and `action` fields is additive and low-risk. The Docker Compose file at `infra/docker/docker-compose.yml` already defines all services including postgres+pgvector, redis, meilisearch, backend, and frontend — the main work is merging Supabase auth services and producing a clean root-level compose file with documentation. The Kubernetes manifests at `infra/k8s/` are production-grade with RollingUpdate strategy, readiness/liveness probes already referencing `/health/ready` and `/health/live` — Helm conversion is largely mechanical templating. The backup CLI follows an established Typer+Rich pattern from `pilot login` and `pilot implement`.

**Primary recommendation:** Implement in dependency order — health endpoints first (OPS-03, unblocks k8s probes), logging fields second (OPS-04, independent), then Docker Compose consolidation (OPS-01), Helm chart (OPS-02, depends on OPS-03 for working probes), backup CLI (OPS-05, independent), and upgrade runbook with CI test (OPS-06, last).

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| structlog | already installed | Structured JSON logging | Already in use; ContextVar pattern established |
| Typer | already installed | CLI framework for backup commands | Already used for `pilot login`, `pilot implement` |
| Rich | already installed | Console output for CLI | Already used for CLI UX |
| httpx | already installed | Async HTTP for Supabase Storage API calls | Already used in `api_client.py` |
| cryptography | pin version (>=42.0) | AES-256-GCM encryption for backup | PyCA standard; ships with pyca/cryptography |
| Helm | 3.x | Kubernetes package manager | Enterprise standard for k8s deployment packaging |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tomli_w | already installed | Write TOML config files | Backup config storage (already used in CLI config) |
| asyncpg | already installed | PostgreSQL async driver | Health check DB ping |
| redis-py (aioredis) | already installed | Redis async client | Health check Redis ping |
| pytest-asyncio | already installed | Async test support | Health endpoint tests |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| cryptography (AES-256-GCM) | GPG encryption | GPG requires key management infrastructure; cryptography library is self-contained |
| pg_dump subprocess | Python pg_dump binding | No maintained Python binding matches pg_dump reliability; subprocess is the right approach |
| Helm | Kustomize | Kustomize is simpler but less suitable for parameterized enterprise deployments needing values.yaml |

**Installation (backup CLI only):**
```bash
cd cli && uv add cryptography
```

---

## Architecture Patterns

### Recommended File Layout for This Phase

```
# Health endpoints
backend/src/pilot_space/api/routers/health.py    # NEW: dedicated health router
backend/src/pilot_space/infrastructure/health_checks.py  # NEW: dependency checkers

# Logging extension
backend/src/pilot_space/infrastructure/logging.py  # MODIFY: add trace_id, actor, action ContextVars

# Docker Compose
docker-compose.yml              # MODIFY/CREATE: consolidated root compose
.env.example                    # MODIFY: all required env vars for single-command setup
docs/deployment/docker-compose.md  # NEW

# Helm chart
infra/helm/pilot-space/
  Chart.yaml
  values.yaml
  values.production.yaml
  templates/
    deployment-backend.yaml
    deployment-frontend.yaml
    ingress.yaml
    configmap.yaml
    hpa.yaml
    pdb.yaml
    namespace.yaml
docs/deployment/kubernetes.md   # NEW

# Backup CLI
cli/src/pilot_cli/commands/backup.py   # NEW
cli/src/pilot_cli/backup/              # NEW: sub-package
  __init__.py
  pg_backup.py       # pg_dump/pg_restore subprocess wrapper
  storage_backup.py  # Supabase Storage API client
  archive.py         # tar.gz + manifest.json packing
  encryption.py      # AES-256-GCM wrapper
cli/tests/test_backup.py               # NEW
docs/operations/backup-restore.md      # NEW

# Upgrade runbook
docs/operations/upgrade-guide.md       # NEW
.github/workflows/upgrade-simulation.yml  # NEW
```

### Pattern 1: Two-Tier Health Endpoint (FastAPI)

**What:** Separate `/health/live` (process check) from `/health/ready` (dependency check). Both backed by async timeout-gated checkers.

**When to use:** Any FastAPI service that must integrate with Kubernetes probes AND monitoring tools.

```python
# Source: FastAPI official docs + Kubernetes probe conventions
import asyncio
from datetime import UTC, datetime

import structlog
from fastapi import APIRouter

from pilot_space.infrastructure.health_checks import (
    check_database,
    check_redis,
    check_supabase,
)

router = APIRouter(tags=["Health"])
logger = structlog.get_logger(__name__)

HEALTH_VERSION = "1.0.0"
CHECK_TIMEOUT_S = 2.0
TOTAL_TIMEOUT_S = 5.0

CRITICAL_CHECKS = {"database", "redis"}


@router.get("/health/live")
async def liveness() -> dict[str, str]:
    """Shallow liveness probe — never touches external deps."""
    return {"status": "ok"}


@router.get("/health/ready")
@router.get("/health")  # backward compat
async def readiness() -> dict:
    """Deep readiness probe — checks all dependencies."""
    checks_coros = {
        "database": check_database(),
        "redis": check_redis(),
        "supabase": check_supabase(),
    }
    results: dict[str, dict] = {}
    try:
        async with asyncio.timeout(TOTAL_TIMEOUT_S):
            for name, coro in checks_coros.items():
                try:
                    async with asyncio.timeout(CHECK_TIMEOUT_S):
                        results[name] = await coro
                except TimeoutError:
                    results[name] = {"status": "error", "error": "timeout"}
    except TimeoutError:
        pass  # partial results are still returned

    # Derive overall status
    if any(results.get(c, {}).get("status") == "error" for c in CRITICAL_CHECKS):
        overall = "unhealthy"
    elif any(v.get("status") == "error" for v in results.values()):
        overall = "degraded"
    else:
        overall = "healthy"

    return {
        "status": overall,
        "version": HEALTH_VERSION,
        "timestamp": datetime.now(UTC).isoformat(),
        "checks": results,
    }
```

### Pattern 2: Health Check Dependency Function

```python
# Source: SQLAlchemy async docs + Redis-py docs
import time

from sqlalchemy import text


async def check_database() -> dict:
    """Run a lightweight DB connectivity check."""
    from pilot_space.infrastructure.database import get_async_engine  # lazy import

    start = time.monotonic()
    try:
        engine = get_async_engine()
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        latency_ms = round((time.monotonic() - start) * 1000, 1)
        return {"status": "ok", "latency_ms": latency_ms}
    except Exception as exc:
        return {"status": "error", "error": str(exc)}


async def check_redis() -> dict:
    start = time.monotonic()
    try:
        from pilot_space.infrastructure.cache import get_redis_client

        client = get_redis_client()
        await client.ping()
        latency_ms = round((time.monotonic() - start) * 1000, 1)
        return {"status": "ok", "latency_ms": latency_ms}
    except Exception as exc:
        return {"status": "error", "error": str(exc)}
```

### Pattern 3: Structlog ContextVar Extension

**What:** Add `trace_id`, `actor`, `action` ContextVars following the established pattern in `infrastructure/logging.py`. The processor `add_request_context` reads all ContextVars and injects them into every log line.

```python
# Extension to backend/src/pilot_space/infrastructure/logging.py
# Source: structlog official docs + existing pattern in codebase

# Add these alongside existing ContextVars
_trace_id: ContextVar[str | None] = ContextVar("trace_id", default=None)
_actor: ContextVar[str | None] = ContextVar("actor", default=None)
_action: ContextVar[str | None] = ContextVar("action", default=None)

def add_request_context(logger, method_name, event_dict):
    # ... existing fields ...
    if trace_id := _trace_id.get():
        event_dict["trace_id"] = trace_id
    if actor := _actor.get():
        event_dict["actor"] = actor
    if action := _action.get():
        event_dict["action"] = action
    return event_dict
```

**Setting actor in auth middleware** (after user is resolved):
```python
# In auth_middleware.py dispatch(), after payload assignment:
from pilot_space.infrastructure.logging import set_request_context
set_request_context(
    trace_id=request_id,  # same as request_id
    actor=f"user:{payload.user_id}",
)
```

**Setting action in service layer:**
```python
# Before a significant DB write:
from pilot_space.infrastructure.logging import set_action
set_action("issue.create")
```

### Pattern 4: Typer Command Group for CLI

**What:** Typer supports nested command groups with `app.add_typer()`. Pattern is used for `pilot backup create` / `pilot backup restore`.

```python
# cli/src/pilot_cli/commands/backup.py
# Source: Typer official docs https://typer.tiangolo.com/tutorial/subcommands/

import typer
from rich.console import Console

backup_app = typer.Typer(name="backup", help="Backup and restore workspace data.")
console = Console()

@backup_app.command("create")
def create_backup(
    output: Path = typer.Option(Path("./backups"), "--output", "-o"),
    workspace: str | None = typer.Option(None, "--workspace"),
    encrypt: bool = typer.Option(False, "--encrypt"),
    passphrase: str | None = typer.Option(None, "--passphrase", envvar="BACKUP_PASSPHRASE"),
) -> None:
    ...

@backup_app.command("restore")
def restore_backup(
    archive: Path = typer.Argument(...),
    dry_run: bool = typer.Option(False, "--dry-run"),
) -> None:
    ...
```

In `main.py`:
```python
from pilot_cli.commands.backup import backup_app
app.add_typer(backup_app, name="backup")
```

### Pattern 5: pg_dump / pg_restore Subprocess

**What:** Shell out to `pg_dump` using Python `subprocess`. Custom format (`-Fc`) is binary, compressed, and restores with `pg_restore`. Credentials via environment variable `PGPASSWORD` (safer than command-line flag).

```python
# Source: PostgreSQL official docs for pg_dump
import os
import subprocess
from pathlib import Path


def pg_dump(database_url: str, output_path: Path) -> None:
    """Run pg_dump in custom format."""
    env = {**os.environ, "PGPASSWORD": _extract_password(database_url)}
    subprocess.run(
        [
            "pg_dump",
            "--format=custom",
            "--no-password",
            "--file", str(output_path),
            database_url,
        ],
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )
```

**Key points:**
- `--format=custom` (`-Fc`) is the only format that supports parallel restore and selective restore.
- Pass credentials via `PGPASSWORD` env var, not `--password` flag (flag is deprecated and visible in `ps`).
- `check=True` raises `CalledProcessError` on non-zero exit — catches all pg_dump errors.
- `pg_restore --clean --if-exists` for restore avoids errors on fresh database.

### Pattern 6: AES-256-GCM Encryption with cryptography Library

**What:** Symmetric passphrase-based encryption using PBKDF2 key derivation + AES-256-GCM.

```python
# Source: PyCA cryptography docs https://cryptography.io/en/latest/hazmat/primitives/aead/
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes


def encrypt_file(input_path: Path, output_path: Path, passphrase: str) -> None:
    salt = os.urandom(16)
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=480000)
    key = kdf.derive(passphrase.encode())
    nonce = os.urandom(12)
    aesgcm = AESGCM(key)
    data = input_path.read_bytes()
    encrypted = aesgcm.encrypt(nonce, data, None)
    # Write: magic(4) + salt(16) + nonce(12) + ciphertext
    with output_path.open("wb") as f:
        f.write(b"PSBC" + salt + nonce + encrypted)
```

### Pattern 7: Helm Chart Template from Raw Manifest

**What:** Convert raw k8s YAML to Helm templates by replacing hardcoded values with `{{ .Values.x }}` references. Chart structure follows Helm conventions.

```yaml
# infra/helm/pilot-space/Chart.yaml
apiVersion: v2
name: pilot-space
description: Pilot Space AI-Augmented SDLC Platform
type: application
version: 0.1.0
appVersion: "1.0.0"
```

```yaml
# infra/helm/pilot-space/templates/deployment-backend.yaml
# Source: Helm official docs https://helm.sh/docs/chart_template_guide/
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "pilot-space.fullname" . }}-backend
  namespace: {{ .Release.Namespace }}
spec:
  replicas: {{ .Values.backend.replicaCount }}
  template:
    spec:
      containers:
        - name: backend
          image: "{{ .Values.backend.image.repository }}:{{ .Values.backend.image.tag }}"
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 8000
          livenessProbe:
            httpGet:
              path: /health/live
              port: 8000
```

```yaml
# infra/helm/pilot-space/values.yaml (bitnami-style naming)
backend:
  replicaCount: 3
  image:
    repository: pilot-space/backend
    tag: latest
    pullPolicy: Always
  resources:
    requests:
      cpu: 100m
      memory: 256Mi
    limits:
      cpu: 500m
      memory: 512Mi

frontend:
  replicaCount: 2
  image:
    repository: pilot-space/frontend
    tag: latest

ingress:
  enabled: true
  className: nginx
  host: pilot-space.example.com
  tls:
    enabled: true
    secretName: pilot-space-tls

externalDatabase:
  host: ""
  port: 5432
  name: pilot_space
  existingSecret: ""

externalRedis:
  host: ""
  port: 6379

externalSupabase:
  url: ""
  existingSecret: ""
```

### Anti-Patterns to Avoid

- **Touching DB in liveness probe:** Liveness failure triggers pod restart. A DB being slow should not cause restarts — that's a readiness concern.
- **Hardcoding credentials in Helm chart:** All sensitive values MUST use `existingSecret` references. Never put actual credentials in `values.yaml`.
- **pg_dump with `--password` flag:** Password appears in process listing. Use `PGPASSWORD` env var instead.
- **Blocking health check in sync route:** If health checks are blocking calls in a sync FastAPI route, a slow DB check blocks the event loop. All checkers MUST be async.
- **Logging in structlog without binding:** Calling `logger.info("msg")` (string only) produces unstructured output. Always use `logger.info("event_name", field=value, ...)`.
- **Supabase Storage download without pagination:** Storage bucket may have thousands of objects. The API is paginated — always paginate with `limit` + `offset` or cursor.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Database backup | Custom SQL dump | `pg_dump -Fc` subprocess | pg_dump handles schema, data, types, extensions, sequences atomically |
| AES encryption | Manual AES implementation | `cryptography.hazmat.primitives.ciphers.aead.AESGCM` | GCM provides authenticated encryption; hand-rolled is vulnerable to padding oracle |
| Helm chart helpers | Custom templating | `helm create` boilerplate + `_helpers.tpl` | Provides `fullname`, `labels`, `selectorLabels` helpers that follow Helm community conventions |
| Health check timeouts | asyncio.wait_for loops | `asyncio.timeout()` (Python 3.11+) | Clean context manager, no task cleanup boilerplate |
| Progress display in CLI | print() loops | `rich.progress.Progress` | Already available; consistent with existing CLI UX |

**Key insight:** pg_dump and pg_restore are the gold standard for PostgreSQL backup. They handle extension state (pgvector, pgmq), sequence values, and schema/data ordering atomically. Any custom solution will miss edge cases in these areas.

---

## Common Pitfalls

### Pitfall 1: asyncio.timeout() Availability
**What goes wrong:** `asyncio.timeout()` context manager was added in Python 3.11. Using it on Python 3.10 raises `AttributeError`.
**Why it happens:** Codebase targets Python 3.12 (per Dockerfile.backend `PYTHON_VERSION: "3.12"`), but it's easy to forget and use `asyncio.wait_for()` out of habit.
**How to avoid:** Use `asyncio.timeout()` — it's cleaner and the codebase is on 3.12. If backporting ever needed, `async_timeout` package provides same API for older Python.
**Warning signs:** `AttributeError: module 'asyncio' has no attribute 'timeout'`

### Pitfall 2: Health Endpoint Not on Public Routes
**What goes wrong:** `/health/live` and `/health/ready` return 401 because `auth_middleware.py` requires JWT on non-public routes.
**Why it happens:** New routes are added but not added to `PUBLIC_ROUTES` set in `auth_middleware.py`.
**How to avoid:** Add `/health/live`, `/health/ready` to `PUBLIC_ROUTES` in `auth_middleware.py`. Note: `/health` is already in `PUBLIC_ROUTES`.
**Warning signs:** Kubernetes pod stuck in `0/1 Ready` state; readiness probe returning 401.

### Pitfall 3: Supabase Storage API Pagination
**What goes wrong:** Backup only captures first 100 (or 1000) storage objects; restore is incomplete.
**Why it happens:** Supabase Storage `list()` API is paginated. A naive implementation calls list once and assumes it gets all objects.
**How to avoid:** Loop with `offset` parameter until response length < page_size.
**Warning signs:** Backup manifest shows fewer objects than expected; intermittent restore failures for workspaces with large file counts.

### Pitfall 4: pg_dump Password in Process Arguments
**What goes wrong:** `PGPASSWORD` leaks in logs if the process manager logs argv, OR password appears in `ps aux` if passed as a flag.
**Why it happens:** `pg_dump --password` is deprecated; some code passes it via URI (still visible in `ps`).
**How to avoid:** Pass `PGPASSWORD` via `env=` parameter to `subprocess.run()`. Never include password in the CLI flag or URI visible to the process table.

### Pitfall 5: Docker Compose Version Incompatibility with `include:`
**What goes wrong:** `include:` directive (Compose v2.20+) fails on Docker Desktop 4.x or older Linux Docker Compose v1.x.
**Why it happens:** Older Docker Desktop ships with Compose v1 or early v2; `include:` is a recent addition.
**How to avoid:** Decision already locked — merge Supabase services directly into root compose file. Do not use `include:`.

### Pitfall 6: Helm Values for Secrets vs ConfigMaps
**What goes wrong:** Sensitive values (DB password, Supabase key) end up in Helm values or ConfigMaps (base64 in etcd is not encrypted by default).
**Why it happens:** Convenience — passing all config via one `values.yaml`.
**How to avoid:** Sensitive values MUST use `existingSecret` pattern — chart templates reference a pre-created Kubernetes Secret by name. Document secret key names expected.

### Pitfall 7: Backup Restore Overwrites Running Instance Without Warning
**What goes wrong:** `pilot backup restore` overwrites a live database without the operator realizing it.
**Why it happens:** No confirmation prompt; operator runs restore on wrong host.
**How to avoid:** Decision locked — interactive confirmation required. Show target database URL, workspace count, object count from manifest before proceeding. `--dry-run` validates without writing.

### Pitfall 8: Structlog Not Clearing ContextVars Between Requests
**What goes wrong:** `actor` and `action` from request A bleed into request B on the same worker thread.
**Why it happens:** ContextVars are cleared in `clear_request_context()` but if `action` is added to the set function without being added to the clear function, it persists.
**How to avoid:** Ensure `clear_request_context()` resets ALL three new ContextVars (`trace_id`, `actor`, `action`) to `None`.

---

## Code Examples

### Health Router Registration in main.py

```python
# Source: FastAPI include_router pattern, existing codebase structure
from pilot_space.api.routers.health import router as health_router

# Add BEFORE API_V1_PREFIX routers (health is at root, not /api/v1)
app.include_router(health_router)
```

### Backup Command Group Registration

```python
# cli/src/pilot_cli/main.py — MODIFIED
from pilot_cli.commands.backup import backup_app

app.add_typer(backup_app, name="backup")
```

### Manifest JSON Schema (backup archive)

```json
{
  "version": "1",
  "created_at": "2026-03-08T12:00:00Z",
  "workspace_id": "all",
  "pg_dump_version": "16.2",
  "pg_dump_format": "custom",
  "pg_dump_file": "postgres.dump",
  "storage_objects_count": 142,
  "storage_manifest_file": "storage_manifest.json",
  "encrypted": false,
  "checksum_sha256": "abc123..."
}
```

### CI Upgrade Simulation Workflow (outline)

```yaml
# .github/workflows/upgrade-simulation.yml
name: Upgrade Simulation
on: [push, pull_request]
jobs:
  upgrade-test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: supabase/postgres:15.8.1.076
        env:
          POSTGRES_PASSWORD: postgres
    steps:
      - uses: actions/checkout@v4
      - name: Start prior version backend
        run: docker run -d --name prior-backend pilot-space/backend:${{ env.PRIOR_VERSION }} ...
      - name: Seed data
        run: ...
      - name: Run new Alembic migrations
        run: cd backend && alembic upgrade head
      - name: Start new version backend
        run: docker run -d --name new-backend pilot-space/backend:${{ github.sha }} ...
      - name: Assert health
        run: curl -f http://localhost:8000/health/ready | jq '.status == "healthy"'
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single `/health` returning `{"status": "healthy"}` | Two-tier: `/health/live` + `/health/ready` with structured checks | Kubernetes 1.18+ standardized liveness/readiness split | Kubernetes probes now work correctly; monitoring gets per-dependency status |
| Unstructured string logs | structlog JSON with trace_id, actor, action | Log aggregation platforms (Datadog, Grafana Loki) matured 2020-2023 | Filter and alert on specific user/action/trace |
| `helm create` from scratch | Convert existing k8s raw YAML to templates | Always the right approach when raw manifests exist | Less work, manifests are already production-tested |
| `asyncio.wait_for()` with task cancellation | `asyncio.timeout()` context manager | Python 3.11 (2022) | Cleaner cancellation semantics, no dangling task |

**Deprecated/outdated:**
- `asyncio.wait_for()` for health check timeouts: Still works but `asyncio.timeout()` is the 3.11+ preferred pattern. Since codebase is Python 3.12, use the new form.
- Helm v2 (Tiller-based): Helm v3 is the only supported version since 2022. All chart templates must target Helm v3 (`apiVersion: v2` in Chart.yaml).

---

## Open Questions

1. **Supabase Storage API authentication for backup**
   - What we know: `api_client.py` uses Bearer auth against the main backend. Supabase Storage API uses service_role key for admin access.
   - What's unclear: Whether the backup CLI calls Supabase Storage API directly (requires `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` in CLI config) or goes through the backend API.
   - Recommendation: Direct Supabase Storage API call from CLI using service_role key. Simpler; backup is an admin operation. Document that `SUPABASE_SERVICE_KEY` must be in CLI config for backup to work.

2. **pg_dump availability on operator machine**
   - What we know: `pg_dump` must be installed on the machine running `pilot backup create`. It ships with PostgreSQL client tools.
   - What's unclear: Whether to bundle pg_dump in the CLI or require it as a prerequisite.
   - Recommendation: Require as prerequisite — document in backup guide. Bundling pg_dump is complex and unnecessary for enterprise ops teams.

3. **Root docker-compose.yml vs infra/docker/docker-compose.yml**
   - What we know: `infra/docker/docker-compose.yml` is comprehensive. Root `docker-compose.yml` appears to be a dev shortcut (redis + meilisearch only based on context clues).
   - What's unclear: Exact current contents of root `docker-compose.yml`.
   - Recommendation: Read root `docker-compose.yml` before making changes. The plan should read it first, then consolidate.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest + pytest-asyncio (backend), Vitest (frontend — not in scope) |
| Config file | `backend/pyproject.toml` (`[tool.pytest.ini_options]`) |
| Quick run command | `cd backend && uv run pytest tests/routers/test_health.py -x -q` |
| Full suite command | `make quality-gates-backend` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OPS-03 | `/health/live` returns `{"status": "ok"}` | unit | `pytest tests/routers/test_health.py::test_liveness -x` | Wave 0 |
| OPS-03 | `/health/ready` returns structured JSON with checks dict | unit (mocked deps) | `pytest tests/routers/test_health.py::test_readiness_healthy -x` | Wave 0 |
| OPS-03 | `/health/ready` returns `"unhealthy"` when DB mocked to fail | unit | `pytest tests/routers/test_health.py::test_readiness_db_down -x` | Wave 0 |
| OPS-03 | `/health/ready` returns `"degraded"` when non-critical dep fails | unit | `pytest tests/routers/test_health.py::test_readiness_degraded -x` | Wave 0 |
| OPS-03 | `/health` (old route) still returns healthy response | unit | `pytest tests/routers/test_health.py::test_legacy_health_route -x` | Wave 0 |
| OPS-03 | `/health/live` and `/health/ready` are public routes (no auth) | unit | `pytest tests/routers/test_health.py::test_health_no_auth_required -x` | Wave 0 |
| OPS-04 | `trace_id`, `actor`, `action` appear in log output | unit | `pytest tests/unit/infrastructure/test_logging.py::test_new_context_vars -x` | Wave 0 |
| OPS-04 | `clear_request_context()` clears all 3 new fields | unit | `pytest tests/unit/infrastructure/test_logging.py::test_clear_clears_new_fields -x` | Wave 0 |
| OPS-05 | `pilot backup create` produces valid `.tar.gz` with manifest.json | unit (mocked pg_dump + storage) | `cd cli && uv run pytest tests/test_backup.py::test_create_produces_archive -x` | Wave 0 |
| OPS-05 | `pilot backup restore --dry-run` validates archive without writing | unit | `cd cli && uv run pytest tests/test_backup.py::test_dry_run_validates -x` | Wave 0 |
| OPS-05 | Encrypted backup decrypts correctly with correct passphrase | unit | `cd cli && uv run pytest tests/test_backup.py::test_encrypt_decrypt_roundtrip -x` | Wave 0 |
| OPS-01 | Docker Compose file is valid (parseable) | smoke | `docker compose -f docker-compose.yml config --quiet` | manual/CI |
| OPS-02 | Helm chart passes lint | smoke | `helm lint infra/helm/pilot-space/` | manual/CI |
| OPS-06 | CI upgrade simulation job passes | integration | GitHub Actions job in `upgrade-simulation.yml` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && uv run pytest tests/routers/test_health.py -x -q` (health tasks) or `cd cli && uv run pytest tests/test_backup.py -x -q` (backup tasks)
- **Per wave merge:** `make quality-gates-backend`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/tests/routers/test_health.py` — covers OPS-03 (6 test cases)
- [ ] `backend/tests/unit/infrastructure/test_logging.py` — covers OPS-04 (may already exist partially, verify)
- [ ] `cli/tests/test_backup.py` — covers OPS-05 (3 test cases)
- [ ] `.github/workflows/upgrade-simulation.yml` — covers OPS-06 CI gate
- [ ] `cryptography` dependency: `cd cli && uv add cryptography`

---

## Sources

### Primary (HIGH confidence)
- Codebase direct inspection: `infra/docker/docker-compose.yml`, `infra/k8s/*.yaml`, `backend/src/pilot_space/infrastructure/logging.py`, `backend/src/pilot_space/api/middleware/auth_middleware.py`, `backend/src/pilot_space/main.py`, `cli/src/pilot_cli/` — all read directly
- Helm v3 official docs (https://helm.sh/docs/) — chart structure, `helm lint`, `values.yaml` conventions
- PostgreSQL official docs — `pg_dump` custom format, `PGPASSWORD` env var pattern

### Secondary (MEDIUM confidence)
- PyCA cryptography docs (https://cryptography.io/en/latest/) — AES-256-GCM, PBKDF2HMAC patterns
- structlog official docs — ContextVar processor pattern, `merge_contextvars` integration
- Health Check RFC (https://inadarei.github.io/rfc-health-check/) — `status`, `checks` response shape referenced in CONTEXT.md

### Tertiary (LOW confidence)
- Supabase Storage API pagination behavior — assumed from standard REST pagination; verify against Supabase Storage REST API docs before implementation

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in codebase or well-established (Helm, cryptography)
- Architecture: HIGH — existing code read directly; patterns verified against codebase
- Pitfalls: HIGH — derived from direct code reading (PUBLIC_ROUTES, ContextVar clear pattern, Supabase pagination is general knowledge)

**Research date:** 2026-03-08
**Valid until:** 2026-06-08 (90 days — stable domain: Docker Compose, Helm, structlog are not fast-moving)
