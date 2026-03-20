---
phase: 7
slug: wire-storage-quota-enforcement
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest + pytest-asyncio |
| **Config file** | `backend/pyproject.toml` |
| **Quick run command** | `cd backend && uv run pytest tests/unit/services/test_storage_quota_wiring.py -x -q` |
| **Full suite command** | `make quality-gates-backend` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && uv run pytest tests/unit/services/test_storage_quota_wiring.py -x -q`
- **After every plan wave:** Run `make quality-gates-backend`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 7-01-01 | 01 | 0 | TENANT-03 | unit stub | `cd backend && uv run pytest tests/unit/services/test_storage_quota_wiring.py -x -q` | ❌ W0 | ⬜ pending |
| 7-01-02 | 01 | 1 | TENANT-03 | unit | `cd backend && uv run pytest tests/unit/services/test_storage_quota_wiring.py::test_create_issue_507_when_quota_exceeded -x` | ❌ W0 | ⬜ pending |
| 7-01-03 | 01 | 1 | TENANT-03 | unit | `cd backend && uv run pytest tests/unit/services/test_storage_quota_wiring.py::test_create_issue_warning_header -x` | ❌ W0 | ⬜ pending |
| 7-01-04 | 01 | 1 | TENANT-03 | unit | `cd backend && uv run pytest tests/unit/services/test_storage_quota_wiring.py::test_update_issue_507_when_quota_exceeded -x` | ❌ W0 | ⬜ pending |
| 7-01-05 | 01 | 1 | TENANT-03 | unit | `cd backend && uv run pytest tests/unit/services/test_storage_quota_wiring.py::test_create_note_507_when_quota_exceeded -x` | ❌ W0 | ⬜ pending |
| 7-01-06 | 01 | 1 | TENANT-03 | unit | `cd backend && uv run pytest tests/unit/services/test_storage_quota_wiring.py::test_attachment_507_when_quota_exceeded -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/services/test_storage_quota_wiring.py` — stubs for TENANT-03 (507 + warning header tests)

*Existing infrastructure (pytest, pytest-asyncio, conftest fixtures) covers all other phase requirements.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
