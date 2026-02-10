# Shared Components Documentation - Pilot Space Frontend

**Generated**: 2026-02-10
**Scope**: `frontend/src/components/` (95 files, 9 subdirectories)
**Languages**: TypeScript, TSX, CSS (TailwindCSS)

---

## Overview

This directory contains all shared UI components for Pilot Space frontend organized into 6 categories:

1. **UI Primitives** (`ui/`) -- 25 shadcn/ui-based components with Pilot Space customizations
2. **Editor Components** (`editor/`) -- TipTap-integrated canvas + 13 extensions + AI features
3. **Layout Components** (`layout/`) -- App shell, sidebar, header, navigation
4. **Issue Components** (`issues/`) -- 14 issue-related selectors, cards, modals
5. **Feature Components** -- AI (chat, approvals, cost tracking), integrations, cycles
6. **Utilities** -- Workspace selector, role icons, guards

All components follow: TypeScript strict mode, WCAG 2.2 AA accessibility, MobX + TanStack Query state management, TailwindCSS + shadcn/ui patterns, 700-line code limit.

---

## Submodule Documentation

| Module                | Doc                                    | Covers                                                                                  |
| --------------------- | -------------------------------------- | --------------------------------------------------------------------------------------- |
| **Editor Components** | [`editor/CLAUDE.md`](editor/CLAUDE.md) | NoteCanvas architecture, 13 TipTap extensions, auto-save pattern, editor component list |

---

## Directory Structure

```
frontend/src/components/
├── ui/                          # 25 shadcn/ui primitives + custom components
├── editor/                      # TipTap note canvas + 13 extensions + CLAUDE.md
├── layout/                      # App shell, sidebar, header, notifications
├── issues/                      # 14 issue selectors, cards, modals
├── ai/                          # Chat, approvals, confidence tags
├── integrations/                # GitHub, PR linking
├── cycles/                      # Burndown, velocity charts
├── navigation/                  # Outline tree, pinned notes
├── role-skill/                  # Role cards, icons
├── workspace-guard.tsx          # Auth boundary
├── workspace-selector.tsx       # Workspace switcher
└── providers.tsx                # Client-side providers
```

---

## UI Primitives (shadcn/ui Customization)

All shadcn/ui components extend via Tailwind classes, CSS variables, or composition (not direct modification). Use `cn()` utility to merge classNames.

**Custom Additions**:

- **Button**: 6 variants (default, secondary, outline, ghost, destructive, ai), 5 sizes
- **Card**: CardHeader, CardContent, CardFooter with grid-based layout
- **FAB**: Custom floating action button (bottom-right, Escape to close)
- **Save Status**: Shows `idle | saving | saved | error` with icons
- **Token Budget Ring**: Circular progress showing AI token usage (0-100%)
- **Confidence Tag Badge**: AI confidence score (0-1, color-coded)

### Color System Integration

Use CSS variables for automatic theme support. Key tokens: `--background`, `--foreground`, `--primary`, `--ai`, `--destructive`, `--border`. Apply via Tailwind: `bg-background`, `text-foreground`, `border-border`, `hover:bg-accent`.

---

## Layout Components

### AppShell -- Root Container

Responsive shell with mobile-aware sidebar. Skip-to-main-content link (accessibility), sidebar inline on desktop / overlay on mobile, mobile backdrop with blur.

### Sidebar -- Navigation + User Controls

Observer-wrapped component with top navigation items + bottom user controls. Routes: Home, Notes, Issues, Projects, AI Chat, Approvals, Costs, Settings.

### Header -- Breadcrumb Placeholder

Individual pages inject breadcrumbs via `<Header><Breadcrumb>...</Breadcrumb></Header>`.

### NotificationPanel -- Notification Bell

Dropdown menu with notification list. Shows unread count badge.

---

## Issue Components

### IssueCard, IssueBoard, IssueModal

Card view, Kanban board (Backlog/Todo/In Progress/In Review/Done/Cancelled), and create/edit modal.

### Issue Selectors (14 Components)

All follow `{ value, onChange, options, isLoading, error, placeholder, disabled }` pattern.

Types: IssueTypeSelect, IssueStateSelect (state machine), IssuePrioritySelect, CycleSelector, EstimateSelector (Fibonacci 1-21), LabelSelector (multi-select), AssigneeSelector (with AI recommendations), DuplicateWarning (70%+ similarity).

### AI Context Components

AIContext (aggregated context), ContextItemList (related items), ContextChat (issue-specific AI), TaskChecklist (subtasks), ClaudeCodePrompt (integration button).

---

## AI Components

**ApprovalDialog**: Non-dismissable modal for destructive AI actions. 24h countdown, Approve/Reject buttons.

**CountdownTimer**: Shows "Expires in: 23h 45m". Color-coded: green (>4h), yellow (1-4h), red (<1h).

**AIConfidenceTag**: Color-coded: 0.8-1.0 Green "High", 0.5-0.8 Yellow "Medium", 0-0.5 Red "Low".

---

## Accessibility Patterns (WCAG 2.2 AA)

1. **Keyboard Navigation**: All interactive elements support Tab, Enter, Space, Escape, Arrow keys
2. **ARIA Labels**: Form inputs require `aria-label` or `aria-describedby`. Icon buttons must have `aria-label` and `title`
3. **Focus Management**: Focus trap in modals. Autoref to close button on open. Escape to close
4. **Color Contrast**: Minimum 4.5:1 ratio. Use design system tokens
5. **Reduced Motion**: Use `motion-safe:animate-*` and `motion-reduce:transition-none`
6. **Skip Links**: Invisible link to `#main-content`, visible on focus. Place in AppShell

---

## State Management in Components

**Golden Rule**: MobX for UI state (`isEditing`, `selectedBlockId`, `hoveredElementId`). TanStack Query for server data (never MobX).

**MobX Component Pattern**: Wrap with `observer()`, access store via `useStore()`, name the function for debugging.

---

## Common Anti-Patterns

| Anti-Pattern               | Why Bad                          | Fix                                               |
| -------------------------- | -------------------------------- | ------------------------------------------------- |
| Storing API data in MobX   | Breaks TanStack Query caching    | Use `useQuery()` instead                          |
| Inline styles              | Breaks design system consistency | Use Tailwind classes                              |
| Hardcoded colors           | Not themeable, breaks dark mode  | Use CSS variables (e.g., `bg-primary`)            |
| Nested ternaries           | Hard to read                     | Use separate `{condition && <Component />}` lines |
| Missing ARIA labels        | Inaccessible to screen readers   | Add `aria-label` + `title` to icon buttons        |
| No focus trap in modals    | Focus escapes to page            | Trap Tab key within modal, focus on open          |
| Blocking I/O in components | Blocks rendering, freezes UI     | Use `useQuery()` for async data                   |

---

## Pre-Submission Checklist

**Type Safety & Design**:

- [ ] TypeScript strict mode passes: `pnpm type-check`
- [ ] No `any` types, uses shadcn/ui base, follows design system colors
- [ ] File under 700 lines

**Accessibility**:

- [ ] Keyboard navigation works (Tab, Enter, Escape)
- [ ] ARIA labels on icon buttons + form inputs
- [ ] Focus trap in modals, reduced motion support, 4.5:1 contrast

**State Management**:

- [ ] MobX state vs TanStack Query split correct
- [ ] observer() wrapper on MobX components
- [ ] No API data in MobX stores

**Code Quality**:

- [ ] Linting passes: `pnpm lint`
- [ ] No console errors/warnings, no hardcoded colors or inline styles

---

## Component Import Pattern

Import via barrel exports in `index.ts`, not direct imports: `import { Button, Card, NoteCanvas } from '@/components'`.

---

## Related Documentation

- **Editor Components (detailed)**: [`editor/CLAUDE.md`](editor/CLAUDE.md)
- **Notes Feature**: [`../features/notes/CLAUDE.md`](../features/notes/CLAUDE.md)
- **AI Stores**: [`../stores/ai/CLAUDE.md`](../stores/ai/CLAUDE.md)
- **Design System**: `specs/001-pilot-space-mvp/ui-design-spec.md` v4.0
