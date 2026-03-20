---
phase: 26
slug: sidebar-tree-navigation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 26 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (frontend), pytest 7.x (backend) |
| **Config file** | `frontend/vitest.config.ts`, `backend/pyproject.toml` |
| **Quick run command** | `cd frontend && pnpm test --run` / `cd backend && uv run pytest tests/unit/ -q` |
| **Full suite command** | `make quality-gates-frontend && make quality-gates-backend` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command for changed layer
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 26-01-01 | 01 | 1 | NAV-01 | unit | `cd frontend && pnpm test --run` | ❌ W0 | ⬜ pending |
| 26-01-02 | 01 | 1 | NAV-02 | unit | `cd backend && uv run pytest tests/unit/ -q` | ❌ W0 | ⬜ pending |
| 26-02-01 | 02 | 2 | NAV-03 | unit | `cd frontend && pnpm test --run` | ❌ W0 | ⬜ pending |
| 26-02-02 | 02 | 2 | NAV-04 | unit | `cd frontend && pnpm test --run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Frontend component tests for sidebar tree rendering
- [ ] Backend unit tests for parent_id support in note creation
- [ ] Frontend tests for breadcrumb navigation component

*Existing infrastructure covers test framework setup.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Expand/collapse persistence across sessions | NAV-01 | Requires localStorage + browser reload | 1. Expand project tree 2. Reload page 3. Verify expanded state persists |
| Inline page creation from sidebar | NAV-02 | Requires user interaction flow | 1. Click "+" on tree node 2. Type page name 3. Verify page appears as child |
| Breadcrumb click navigation | NAV-04 | Requires route transitions | 1. Navigate to nested page 2. Click parent breadcrumb 3. Verify navigation |
| Non-issue page editor loads without crash | NAV-04 | Requires TipTap editor rendering | 1. Create a non-issue page 2. Open in editor 3. Verify no property block errors |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
