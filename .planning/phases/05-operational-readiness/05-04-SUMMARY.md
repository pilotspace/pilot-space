---
phase: 05-operational-readiness
plan: "04"
subsystem: infra
tags: [helm, kubernetes, k8s, deployment, hpa, pdb, ingress, nginx, health-checks]

requires:
  - phase: 05-01
    provides: /health/live and /health/ready endpoints (OPS-03) referenced by backend deployment probes

provides:
  - Helm chart at infra/helm/pilot-space/ with Chart.yaml, values.yaml, values.production.yaml
  - _helpers.tpl with fullname, labels, selectorLabels, component-specific label helpers
  - 7 Kubernetes templates: namespace, configmap, deployment-backend, deployment-frontend, ingress, hpa, pdb
  - Backend readinessProbe /health/ready, livenessProbe /health/live, startupProbe /health/live
  - existingSecret pattern for all sensitive credentials (database-url, redis-url, supabase keys)
  - docs/deployment/kubernetes.md with full deployment guide

affects:
  - CI/CD (any pipeline building/deploying the Helm chart)
  - Future phases adding new env vars (must add to configmap.yaml or values.yaml)

tech-stack:
  added: [helm v3, autoscaling/v2 HPA, policy/v1 PDB, networking.k8s.io/v1 Ingress]
  patterns:
    - existingSecret pattern for credential injection (no plaintext in values.yaml)
    - bitnami-style values conventions (component sections, inline @param docs)
    - dual-ingress pattern (main ingress + AI-specific ingress with stricter rate limits)
    - required() function for mandatory values (fail-fast at helm install)

key-files:
  created:
    - infra/helm/pilot-space/Chart.yaml
    - infra/helm/pilot-space/values.yaml
    - infra/helm/pilot-space/values.production.yaml
    - infra/helm/pilot-space/templates/_helpers.tpl
    - infra/helm/pilot-space/templates/namespace.yaml
    - infra/helm/pilot-space/templates/configmap.yaml
    - infra/helm/pilot-space/templates/deployment-backend.yaml
    - infra/helm/pilot-space/templates/deployment-frontend.yaml
    - infra/helm/pilot-space/templates/ingress.yaml
    - infra/helm/pilot-space/templates/hpa.yaml
    - infra/helm/pilot-space/templates/pdb.yaml
    - docs/deployment/kubernetes.md
  modified:
    - .pre-commit-config.yaml

key-decisions:
  - "required() function used for existingSecret fields — helm install fails immediately with clear error if secrets not pre-created, preventing silent runtime failures"
  - "Dual-ingress design: main ingress for general traffic (100 rps limit), AI ingress for /api/v1/ai paths (10 rps limit, 600s timeout) — mirrors existing infra/k8s/ingress.yaml pattern"
  - "configmap.yaml constructs CORS_ORIGINS from ingress.host value — single source of truth for hostname"
  - "pre-commit check-yaml excluded for infra/helm/*/templates/ — Go template syntax is not valid YAML; exclusion enables committing Helm templates without false failures"
  - "Backend HPA uses both CPU (70%) and memory (80%) metrics — AI workloads can be memory-bound even at low CPU"

patterns-established:
  - "existingSecret pattern: all sensitive k8s credentials reference pre-created secrets via secretKeyRef, never in values.yaml"
  - "values.production.yaml as overlay: helm install with -f values.production.yaml -f values.site.yaml for layered config"
  - "Helm component helpers: pilot-space.backendName, pilot-space.frontendName for consistent resource naming"

requirements-completed: [OPS-02]

duration: 6min
completed: 2026-03-08
---

# Phase 5 Plan 04: Helm Chart for Kubernetes Summary

**Complete Helm chart (11 files) converting raw k8s manifests to parameterized production deployment with existingSecret credential injection, dual-ingress for AI workloads, and HPA/PDB for high availability**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-03-08T16:59:37Z
- **Completed:** 2026-03-08T17:05:29Z
- **Tasks:** 2
- **Files created/modified:** 13

## Accomplishments

- Helm chart at `infra/helm/pilot-space/` with `apiVersion: v2`, passing `helm lint` with 0 errors and rendering 14 YAML documents via `helm template`
- Backend deployment template references `/health/ready` for readinessProbe and `/health/live` for livenessProbe (OPS-03 endpoints from plan 05-01)
- All sensitive credentials (database URL, Redis URL, Supabase keys) use `existingSecret` pattern — zero plaintext credentials in `values.yaml`
- Comprehensive `docs/deployment/kubernetes.md` covering: 5-step install, upgrade, rollback, health check explanation, HPA tuning guide, PDB configuration, troubleshooting

## Task Commits

1. **Task 1: Create Helm chart structure, values.yaml, and _helpers.tpl** - `154c82d8` (chore)
2. **Task 2: Create Helm templates and Kubernetes deployment guide** - `7c2c7d1f` (feat)

## Files Created/Modified

- `infra/helm/pilot-space/Chart.yaml` - apiVersion v2 chart metadata, version 0.1.0
- `infra/helm/pilot-space/values.yaml` - Bitnami-style values with backend, frontend, ingress, externalDatabase, externalRedis, externalSupabase, autoscaling, podDisruptionBudget sections
- `infra/helm/pilot-space/values.production.yaml` - Production overlay (higher resource limits, HPA/PDB enabled)
- `infra/helm/pilot-space/templates/_helpers.tpl` - fullname, chart, labels, selectorLabels, backendLabels/Name, frontendLabels/Name helpers
- `infra/helm/pilot-space/templates/namespace.yaml` - Namespace with Helm labels
- `infra/helm/pilot-space/templates/configmap.yaml` - Non-sensitive config, Supabase URL from values
- `infra/helm/pilot-space/templates/deployment-backend.yaml` - Backend Deployment + Service + ServiceAccount; /health/ready readiness, /health/live liveness; all creds via existingSecret; pod anti-affinity + topology spread
- `infra/helm/pilot-space/templates/deployment-frontend.yaml` - Frontend Deployment + Service + ServiceAccount; /api/health probes; SUPABASE_ANON_KEY via existingSecret
- `infra/helm/pilot-space/templates/ingress.yaml` - Main path-based ingress + AI-specific ingress (stricter rate limits, SSE-optimized timeouts)
- `infra/helm/pilot-space/templates/hpa.yaml` - Backend HPA (CPU+memory), Frontend HPA (CPU only); conservative scale policies
- `infra/helm/pilot-space/templates/pdb.yaml` - Backend minAvailable:2, Frontend minAvailable:1
- `docs/deployment/kubernetes.md` - Full Kubernetes deployment guide
- `.pre-commit-config.yaml` - Added check-yaml exclusion for Helm templates directory

## Decisions Made

- Used `required()` function for existingSecret values — `helm install` fails immediately with clear error if secrets not pre-created, preventing silent runtime failures
- Dual-ingress design: main ingress (100 rps, 300s timeout) + AI ingress (10 rps, 600s timeout) — mirrors existing `infra/k8s/ingress.yaml` pattern
- `configmap.yaml` constructs `CORS_ORIGINS` from `ingress.host` — single source of truth for hostname, no duplication
- Backend HPA uses CPU (70%) + memory (80%) metrics — AI LLM workloads are memory-bound even at low CPU

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Excluded Helm templates from pre-commit check-yaml hook**
- **Found during:** Task 2 (committing deployment templates)
- **Issue:** The `check-yaml` builtin hook in `.pre-commit-config.yaml` tried to parse Helm templates as plain YAML. Go template syntax (`{{- include ... }}`) is not valid YAML — hook exited code 1 blocking commit
- **Fix:** Added `exclude: ^infra/helm/.*templates/.*\.yaml$` to `check-yaml` hook in `.pre-commit-config.yaml`
- **Files modified:** `.pre-commit-config.yaml`
- **Verification:** `git commit` succeeded with all 7 template files; `helm lint` still passes
- **Committed in:** `7c2c7d1f` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking)
**Impact on plan:** Required fix for the pre-commit infrastructure to accept Helm template files. No scope creep.

## Issues Encountered

None beyond the pre-commit hook exclusion documented above.

## User Setup Required

None — no external service configuration required beyond what is documented in `docs/deployment/kubernetes.md`.

## Next Phase Readiness

- Helm chart ready for CI/CD pipeline integration (05-05 or 05-06)
- `values.production.yaml` overlay ready for environment-specific deployments
- Chart passes `helm lint` and `helm template` — ready for `helm install` in a real cluster once secrets are pre-created

---
*Phase: 05-operational-readiness*
*Completed: 2026-03-08*
