---
phase: 2
slug: compliance-and-audit
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-08
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 7.x (backend), vitest (frontend) |
| **Config file** | `backend/pyproject.toml`, `frontend/vitest.config.ts` |
| **Quick run command** | `cd backend && uv run pytest tests/audit/ -q` |
| **Full suite command** | `make quality-gates-backend && make quality-gates-frontend` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && uv run pytest tests/audit/ -q`
- **After every plan wave:** Run `make quality-gates-backend && make quality-gates-frontend`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 0 | AUDIT-01 | unit | `cd backend && uv run pytest tests/audit/test_audit_log_model.py -q` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 0 | AUDIT-01 | unit | `cd backend && uv run pytest tests/audit/test_audit_hook.py -q` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 1 | AUDIT-01 | integration | `cd backend && uv run pytest tests/audit/test_audit_hook.py -q` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 1 | AUDIT-02 | unit | `cd backend && uv run pytest tests/audit/test_ai_audit.py -q` | ❌ W0 | ⬜ pending |
| 02-03-01 | 03 | 2 | AUDIT-03 | integration | `cd backend && uv run pytest tests/audit/test_audit_api.py -q` | ❌ W0 | ⬜ pending |
| 02-03-02 | 03 | 2 | AUDIT-04 | integration | `cd backend && uv run pytest tests/audit/test_audit_export.py -q` | ❌ W0 | ⬜ pending |
| 02-04-01 | 04 | 3 | AUDIT-05 | unit | `cd backend && uv run pytest tests/audit/test_retention.py -q` | ❌ W0 | ⬜ pending |
| 02-04-02 | 04 | 3 | AUDIT-06 | integration | `cd backend && uv run pytest tests/audit/test_immutability.py -q` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/audit/__init__.py` — audit test package
- [ ] `tests/audit/conftest.py` — shared fixtures (workspace, user, session)
- [ ] `tests/audit/test_audit_log_model.py` — stubs for AUDIT-01 (model creation, RLS)
- [ ] `tests/audit/test_audit_hook.py` — stubs for AUDIT-01 (hook fires on CRUD)
- [ ] `tests/audit/test_ai_audit.py` — stubs for AUDIT-02 (AI action logging)
- [ ] `tests/audit/test_audit_api.py` — stubs for AUDIT-03 (filter endpoints)
- [ ] `tests/audit/test_audit_export.py` — stubs for AUDIT-04 (JSON/CSV export)
- [ ] `tests/audit/test_retention.py` — stubs for AUDIT-05 (retention purge logic)
- [ ] `tests/audit/test_immutability.py` — stubs for AUDIT-06 (no update/delete possible)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CSV opens in spreadsheet tool | AUDIT-04 | Requires desktop app validation | Export CSV, open in Excel/Numbers, verify columns and encoding |
| pg_cron retention job fires on schedule | AUDIT-05 | Requires time manipulation or pg_cron extension running | Manually set retention=1day, insert old row, wait 24h or use `SELECT cron.run_job(...)` |
| Admin UI shows no delete button for audit rows | AUDIT-06 | Frontend visual check | Navigate to audit log page, verify no delete/edit controls visible |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
