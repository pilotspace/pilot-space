---
phase: 29
slug: responsive-layout-drag-and-drop
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 29 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (frontend) |
| **Config file** | `frontend/vitest.config.ts` |
| **Quick run command** | `cd frontend && pnpm test --run` |
| **Full suite command** | `make quality-gates-frontend` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && pnpm type-check`
- **After every plan wave:** Run `make quality-gates-frontend`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 29-01-01 | 01 | 1 | UI-02 | unit | `cd frontend && pnpm test --run` | ❌ W0 | ⬜ pending |
| 29-01-02 | 01 | 1 | UI-02 | unit | `cd frontend && pnpm test --run` | ❌ W0 | ⬜ pending |
| 29-02-01 | 02 | 2 | UI-03, UI-04 | unit | `cd frontend && pnpm test --run` | ❌ W0 | ⬜ pending |
| 29-02-02 | 02 | 2 | UI-03, UI-04 | unit | `cd frontend && pnpm test --run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Frontend tests for responsive sidebar behavior (icon rail vs overlay)
- [ ] Frontend tests for DnD tree reorder and re-parent operations

*Existing test infrastructure covers framework setup.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sidebar icon rail at tablet viewport | UI-02 | Requires viewport resize | 1. Resize to 768px 2. Verify icon rail 3. Expand on hover/click |
| Content stacking at tablet | UI-02 | Requires viewport resize | 1. Resize to 900px 2. Verify reduced margins 3. Check settings page layout |
| Drag reorder among siblings | UI-03 | Requires mouse interaction | 1. Drag page up/down 2. Drop 3. Verify new order persists |
| Drag re-parent with depth limit | UI-04 | Requires mouse interaction | 1. Drag page onto different parent 2. Verify re-parenting 3. Try dragging to depth 3+ 4. Verify visual rejection |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
