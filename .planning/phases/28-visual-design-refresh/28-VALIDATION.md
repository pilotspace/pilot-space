---
phase: 28
slug: visual-design-refresh
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 28 — Validation Strategy

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
| 28-01-01 | 01 | 1 | UI-01 | type-check | `cd frontend && pnpm type-check` | ✅ | ⬜ pending |
| 28-01-02 | 01 | 1 | UI-01 | visual | `cd frontend && pnpm test --run` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements — this is a CSS/token refactor with no new test infrastructure needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Typography hierarchy is visually consistent | UI-01 | Requires visual inspection | 1. Open issues page 2. Check heading sizes 3. Verify body text readability |
| 8px grid spacing is consistent | UI-01 | Requires visual inspection | 1. Open sidebar 2. Check padding/margins 3. Open settings page 4. Compare spacing |
| Dark mode parity | UI-01 | Requires visual inspection | 1. Toggle dark mode 2. Check all major pages 3. Verify readability |
| Existing pages retain layout | UI-01 | Requires visual inspection | 1. Open issues, settings, AI chat 2. Verify no layout breaks 3. Check editor |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
