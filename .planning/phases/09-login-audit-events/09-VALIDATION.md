---
phase: 9
slug: login-audit-events
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest + pytest-asyncio |
| **Config file** | `backend/pyproject.toml` |
| **Quick run command** | `cd backend && uv run pytest tests/unit/routers/test_auth_sso.py -x -q` |
| **Full suite command** | `make quality-gates-backend` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && uv run pytest tests/unit/routers/test_auth_sso.py -x -q`
- **After every plan wave:** Run `make quality-gates-backend`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 9-01-01 | 01 | 1 | AUDIT-01 | unit | `cd backend && uv run pytest tests/unit/routers/test_auth_sso.py -x -q` | ❌ W0 | ⬜ pending |
| 9-01-02 | 01 | 1 | AUDIT-01 | unit | `cd backend && uv run pytest tests/unit/routers/test_auth_sso.py -x -q` | ❌ W0 | ⬜ pending |
| 9-01-03 | 01 | 1 | AUDIT-01 | unit | `cd backend && uv run pytest tests/unit/routers/test_auth_sso.py -x -q` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] New test functions in `tests/unit/routers/test_auth_sso.py` — stubs for AUDIT-01 login audit write, correct kwargs, and non-fatal failure behavior

*Existing test file exists. New test functions are needed, not a new file.*

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
