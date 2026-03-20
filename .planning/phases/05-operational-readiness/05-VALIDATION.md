---
phase: 5
slug: operational-readiness
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-08
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (backend), vitest (frontend) |
| **Config file** | `backend/pyproject.toml`, `frontend/vitest.config.ts` |
| **Quick run command** | `cd backend && uv run pytest tests/ -q --tb=short -x` |
| **Full suite command** | `make quality-gates-backend && make quality-gates-frontend` |
| **Estimated runtime** | ~90 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && uv run pytest tests/ -q --tb=short -x`
- **After every plan wave:** Run `make quality-gates-backend && make quality-gates-frontend`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 5-01-01 | 01 | 1 | OPS-03 | unit | `cd backend && uv run pytest tests/api/test_health.py -q` | ❌ W0 | ⬜ pending |
| 5-01-02 | 01 | 1 | OPS-03 | unit | `cd backend && uv run pytest tests/api/test_health.py -q` | ❌ W0 | ⬜ pending |
| 5-02-01 | 02 | 1 | OPS-04 | unit | `cd backend && uv run pytest tests/infrastructure/test_logging.py -q` | ❌ W0 | ⬜ pending |
| 5-02-02 | 02 | 1 | OPS-04 | unit | `cd backend && uv run pytest tests/infrastructure/test_logging.py -q` | ❌ W0 | ⬜ pending |
| 5-03-01 | 03 | 1 | OPS-01 | manual | Docker Compose smoke test | N/A | ⬜ pending |
| 5-04-01 | 04 | 2 | OPS-02 | manual | Helm chart deploy test | N/A | ⬜ pending |
| 5-05-01 | 05 | 2 | OPS-05 | integration | `cd cli && uv run pytest tests/test_backup.py -q` | ❌ W0 | ⬜ pending |
| 5-06-01 | 06 | 3 | OPS-06 | manual | Zero-downtime migration steps | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/tests/api/test_health.py` — stubs for health endpoint assertions (OPS-03)
- [ ] `backend/tests/infrastructure/test_logging.py` — stubs for structured log field assertions (OPS-04)
- [ ] `cli/tests/test_backup.py` — stubs for backup/restore CLI command tests (OPS-05)

*Existing backend pytest infrastructure covers all automated tests.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Docker Compose single-command startup on fresh Linux machine | OPS-01 | Requires real Docker daemon and network; no unit test covers full stack | Run `docker compose up` from root; verify all services healthy |
| Helm chart deploy on Kubernetes cluster | OPS-02 | Requires a live k8s cluster; cannot be mocked | Deploy chart to test cluster; check all pods reach Running state |
| Zero-downtime upgrade from prior MVP version | OPS-06 | Requires two running deployments and traffic switchover | Follow documented migration steps; verify zero 5xx during cutover |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
