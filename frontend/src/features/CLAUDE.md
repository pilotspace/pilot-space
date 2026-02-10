# Frontend Features Documentation

**Generated**: 2026-02-10
**Scope**: `frontend/src/features/` (10 feature modules)
**Language(s)**: TypeScript 5.3+, React 18, Next.js 14
**Architecture**: Feature-folder pattern with colocated components, hooks, stores

---

## Quick Start

**Before implementing any feature, read in this order**:

1. **This file** -- Understanding feature structure & patterns
2. **Module CLAUDE.md** -- Feature-specific design (see links below)
3. **Main CLAUDE.md** -- Architecture principles (state split, accessibility, etc.)
4. **Dev patterns** -- `docs/dev-pattern/45-pilot-space-patterns.md`

---

## Module Overview & Index

All modules follow consistent structure: `components/`, `hooks/`, optional `pages/`, optional `editor/`, optional `stores/`, optional `services/`.

### Core Modules (6)

| Module        | Purpose                                                    | Status     | Docs                                         |
| ------------- | ---------------------------------------------------------- | ---------- | -------------------------------------------- |
| **Notes**     | Block-based editor, ghost text, issue extraction           | Production | [`notes/CLAUDE.md`](notes/CLAUDE.md)         |
| **Issues**    | Issue CRUD, AI context, activity tracking                  | Production | [`issues/CLAUDE.md`](issues/CLAUDE.md)       |
| **AI**        | Unified conversational interface, SSE streaming, approvals | Production | [`ai/CLAUDE.md`](ai/CLAUDE.md)               |
| **Approvals** | Human-in-the-loop workflow (DD-003)                        | Production | [`approvals/CLAUDE.md`](approvals/CLAUDE.md) |
| **Cycles**    | Sprint management, burndown charts                         | Production | [`cycles/CLAUDE.md`](cycles/CLAUDE.md)       |
| **Homepage**  | Landing page (Note-First), activity feed, digest           | Production | [`homepage/CLAUDE.md`](homepage/CLAUDE.md)   |

### Integration Modules (2)

| Module           | Purpose                                        | Status     | Docs                                   |
| ---------------- | ---------------------------------------------- | ---------- | -------------------------------------- |
| **GitHub**       | PR review, linking, OAuth                      | Production | [`github/CLAUDE.md`](github/CLAUDE.md) |
| **Integrations** | PR review hooks (supports future integrations) | Production | --                                     |

### Configuration Modules (2)

| Module       | Purpose                                           | Status     | Docs                                       |
| ------------ | ------------------------------------------------- | ---------- | ------------------------------------------ |
| **Settings** | Workspace, members, AI providers, profile, skills | Production | [`settings/CLAUDE.md`](settings/CLAUDE.md) |
| **Costs**    | AI cost tracking by agent/user/day                | Production | [`costs/CLAUDE.md`](costs/CLAUDE.md)       |

### Onboarding Module (1)

| Module         | Purpose                | Status     |
| -------------- | ---------------------- | ---------- |
| **Onboarding** | 3-step workspace setup | Production |

---

## Shared Patterns Across All Modules

### Component-Hook-Store Integration

Every feature module follows this pattern:

```
Feature Module/
├── components/               # UI presentation (wrapped with observer() if MobX)
├── hooks/                    # TanStack Query + MobX reactions
├── pages/                    # Next.js app router pages (optional)
├── editor/                   # TipTap extensions (notes only)
├── services/                 # Business logic (notes ghostTextService)
└── CLAUDE.md                 # Feature-specific documentation
```

### State Management Rule (DD-065)

**Strict separation**: MobX for UI state. TanStack Query for server data. Never store API data in MobX.

### Component Wrapping

If component uses MobX stores, wrap with `observer()`. Use named function expressions for stack traces.

### Barrel Export Pattern

Every module exposes via `index.ts`: `import { useNotes } from '@/features/notes';`

### File Size Limit (700 lines max)

Enforced by pre-commit hook. If exceeding, extract sub-components, hooks, or services.

---

## Common Implementation Pattern

### Optimistic Updates with Rollback

```typescript
const mutation = useMutation({
  mutationFn: (data) => issuesApi.update(issueId, data),
  onMutate: async (newData) => {
    await queryClient.cancelQueries({ queryKey: issueDetailKeys.detail(issueId) });
    const previousData = queryClient.getQueryData(issueDetailKeys.detail(issueId));
    queryClient.setQueryData(issueDetailKeys.detail(issueId), (old) => ({ ...old, ...newData }));
    return { previousData };
  },
  onError: (_, __, context) => {
    queryClient.setQueryData(issueDetailKeys.detail(issueId), context?.previousData);
  },
  onSettled: () => queryClient.invalidateQueries({ queryKey: issueDetailKeys.detail(issueId) }),
});
```

See `docs/dev-pattern/` for detailed query key factory patterns, MobX reactions, and SSE streaming examples.

---

## Pre-Submission Checklist

- [ ] File size <700 lines | MobX/TanStack split correct | No API data in MobX
- [ ] observer() wrapper on MobX components | Props documented | Tailwind styling only
- [ ] Keyboard nav functional | ARIA labels present | Focus management correct
- [ ] Dynamic imports for large components | No unnecessary re-renders
- [ ] Conventional commit with descriptive body
- [ ] Tests written for new features (>80% coverage)

---

## Troubleshooting Guide

| Issue                                      | Cause                                                | Fix                                                                    |
| ------------------------------------------ | ---------------------------------------------------- | ---------------------------------------------------------------------- |
| Component not re-rendering on store update | Missing `observer()` wrapper                         | Wrap with `observer(function Component() { ... })`                     |
| Query not refetching after mutation        | Invalidation key mismatch                            | Ensure `queryKey` in invalidation matches `useQuery` key exactly       |
| Infinite scroll not triggering             | Sentinel not visible or IntersectionObserver not set | Verify sentinel ref is appended, observer threshold correct            |
| SSE connection dropping                    | Token expiration or network timeout                  | Refresh token before SSE connect, implement exponential backoff retry  |
| Ghost text not triggering                  | Debounce not 500ms or callback missing               | Check `debounceMs: 500` in config, verify `onTrigger` callback defined |
| Block IDs lost after AI edit               | BlockIdExtension running before content update       | Ensure BlockIdExtension is last in extension array                     |

---

## Learning Resources

**In this codebase**:

- Main docs: `/CLAUDE.md`, `frontend/CLAUDE.md`
- Design decisions: `docs/DESIGN_DECISIONS.md` (DD-065 state split, DD-003 approvals)
- Dev patterns: `docs/dev-pattern/45-pilot-space-patterns.md`

**External**: [MobX](https://mobx.js.org/) | [TanStack Query](https://tanstack.com/query/latest) | [React](https://react.dev/) | [Next.js](https://nextjs.org/docs) | [TipTap](https://tiptap.dev/)
