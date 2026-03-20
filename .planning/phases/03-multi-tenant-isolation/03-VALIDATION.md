---
phase: 3
slug: multi-tenant-isolation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-08
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (backend) + vitest (frontend) |
| **Config file** | `backend/pyproject.toml` / `frontend/vitest.config.ts` |
| **Quick run command** | `cd backend && uv run pytest tests/ -q --tb=short -x` |
| **Full suite command** | `make quality-gates-backend && make quality-gates-frontend` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && uv run pytest tests/ -q --tb=short -x`
- **After every plan wave:** Run `make quality-gates-backend && make quality-gates-frontend`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 0 | TENANT-01 | unit | `cd backend && uv run pytest tests/test_rls_isolation.py -q` | ❌ W0 | ⬜ pending |
| 3-01-02 | 01 | 1 | TENANT-01 | unit | `cd backend && uv run pytest tests/test_rls_isolation.py -q` | ❌ W0 | ⬜ pending |
| 3-01-03 | 01 | 1 | TENANT-01 | integration | `cd backend && uv run pytest tests/test_rls_isolation.py -q` | ❌ W0 | ⬜ pending |
| 3-02-01 | 02 | 2 | TENANT-02 | unit | `cd backend && uv run pytest tests/test_encryption.py -q` | ❌ W0 | ⬜ pending |
| 3-02-02 | 02 | 2 | TENANT-02 | integration | `cd backend && uv run pytest tests/test_encryption.py -q` | ❌ W0 | ⬜ pending |
| 3-03-01 | 03 | 2 | TENANT-03 | unit | `cd backend && uv run pytest tests/test_rate_limits.py -q` | ❌ W0 | ⬜ pending |
| 3-03-02 | 03 | 2 | TENANT-03 | integration | `cd backend && uv run pytest tests/test_rate_limits.py -q` | ❌ W0 | ⬜ pending |
| 3-04-01 | 04 | 3 | TENANT-04 | e2e | `cd frontend && pnpm test:e2e` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/tests/test_rls_isolation.py` — stubs for TENANT-01 cross-workspace data leak tests
- [ ] `backend/tests/test_encryption.py` — stubs for TENANT-02 bring-your-own-key encryption
- [ ] `backend/tests/test_rate_limits.py` — stubs for TENANT-03 rate limits and quotas
- [ ] `backend/tests/conftest.py` — verify fixtures support multi-tenant test setup with two isolated workspaces

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Super-admin dashboard UI renders correctly | TENANT-04 | Requires browser session with super-admin env var set | 1. Set `SUPER_ADMIN_TOKEN=test` in `.env`, 2. `GET /admin/dashboard` with `Authorization: Bearer test`, 3. Verify JSON response has workspace_count, active_members, storage_used |
| Encryption key upload flow | TENANT-02 | Requires actual key rotation and data re-encryption verification | 1. Upload key via Settings > Security, 2. Create note, 3. Query DB raw and verify content is not plaintext |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
