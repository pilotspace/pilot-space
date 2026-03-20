---
phase: 27
slug: project-hub-issue-views
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 27 — Validation Strategy

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
| 27-01-01 | 01 | 1 | HUB-04 | unit | `cd backend && uv run pytest tests/unit/ -q` | ❌ W0 | ⬜ pending |
| 27-01-02 | 01 | 1 | HUB-01, HUB-02 | unit | `cd frontend && pnpm test --run` | ❌ W0 | ⬜ pending |
| 27-02-01 | 02 | 2 | HUB-03 | unit | `cd frontend && pnpm test --run` | ❌ W0 | ⬜ pending |
| 27-02-02 | 02 | 2 | HUB-04 | unit | `cd frontend && pnpm test --run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Backend tests for icon_emoji migration and schema
- [ ] Frontend tests for per-project view mode persistence
- [ ] Frontend tests for PriorityView component
- [ ] Frontend tests for emoji icon rendering in sidebar tree

*Existing infrastructure covers test framework setup.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Issue Board/List/Table renders within project page | HUB-01 | Requires live data rendering | 1. Open project page 2. Verify issues visible in default view |
| View mode switch persists per project | HUB-02 | Requires localStorage + reload | 1. Switch to Table view 2. Navigate away 3. Return 4. Verify Table still selected |
| Priority swimlanes group correctly | HUB-03 | Requires real issue data | 1. Create issues with different priorities 2. Switch to Priority view 3. Verify swimlane grouping |
| Emoji icon displays in sidebar and header | HUB-04 | Requires UI interaction | 1. Set emoji on page 2. Verify in sidebar tree 3. Verify in page header |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
