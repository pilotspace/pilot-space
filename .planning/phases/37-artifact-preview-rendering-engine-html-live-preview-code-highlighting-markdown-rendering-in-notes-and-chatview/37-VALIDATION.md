---
phase: 37
slug: artifact-preview-rendering-engine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-20
---

# Phase 37 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.x |
| **Config file** | `frontend/vitest.config.ts` |
| **Quick run command** | `pnpm vitest run src/features/artifacts/` |
| **Full suite command** | `pnpm vitest run src/features/artifacts/ src/features/notes/editor/extensions/__tests__/` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run src/features/artifacts/`
- **After every plan wave:** Run `pnpm vitest run src/features/artifacts/ src/features/notes/editor/extensions/__tests__/`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 37-01-01 | 01 | 0 | PREV-03 | unit | `pnpm vitest run src/features/artifacts/utils/__tests__/mime-type-router.test.ts` | ✅ | ⬜ pending |
| 37-01-02 | 01 | 1 | PREV-03 | unit | `pnpm vitest run src/features/artifacts/components/__tests__/HtmlRenderer.test.tsx` | ❌ W0 | ⬜ pending |
| 37-02-01 | 02 | 1 | PREV-02 | unit | `pnpm vitest run src/features/artifacts/components/__tests__/MarkdownRenderer.test.tsx` | ❌ W0 | ⬜ pending |
| 37-02-02 | 02 | 1 | PREV-03 | unit | `pnpm vitest run src/features/artifacts/components/__tests__/CodeRenderer.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/features/artifacts/components/__tests__/HtmlRenderer.test.tsx` — stubs for HtmlRenderer preview/source toggle
- [ ] `src/features/artifacts/components/__tests__/MarkdownRenderer.test.tsx` — stubs for enhanced markdown
- [ ] `src/features/artifacts/components/__tests__/CodeRenderer.test.tsx` — stubs for enhanced code highlighting

*Existing vitest infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| HTML preview renders in sandboxed iframe | PREV-03 | Visual rendering in iframe | Upload HTML file → click preview → toggle to "Preview" mode → verify content renders in iframe |
| Syntax highlighting colors correct | PREV-03 | Visual color verification | Upload .py/.html/.css → click preview → verify keyword/string/comment colors |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
