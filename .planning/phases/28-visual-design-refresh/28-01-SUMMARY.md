---
phase: 28-visual-design-refresh
plan: 01
subsystem: frontend/design-tokens
tags: [css, design-system, typography, tailwind, tokens]
dependency_graph:
  requires: []
  provides: [neutral-palette, system-font-stack, neutralized-shadows]
  affects: [frontend/src/app/globals.css, frontend/src/app/layout.tsx]
tech_stack:
  added: []
  patterns: [css-custom-properties, tailwind-v4-theme-inline, system-font-stack]
key_files:
  created: []
  modified:
    - frontend/src/app/globals.css
    - frontend/src/app/layout.tsx
decisions:
  - System-ui stack replaces DM Sans as primary body font — zero web font overhead for body text
  - Fraunces preserved via Google Fonts link tag — variable font axes not supported by next/font
  - shadow-warm-* class names preserved (no rename) — only HSL values changed to neutral hue
metrics:
  duration_minutes: 6
  completed_date: "2026-03-12"
  tasks_completed: 2
  files_modified: 2
---

# Phase 28 Plan 01: Design Token Refresh — Neutral Palette and System Font Stack

Replaced warm-amber design tokens with Notion-like neutral palette and system-ui font stack; removed DM Sans web font load.

## Tasks Completed

| # | Task | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | Update globals.css design tokens | 223117a1 | Neutral palette, system font, neutralized shadows/glass/scrollbars |
| 2 | Clean up font loading in layout.tsx | 8251667f | Remove DM Sans, update viewport theme colors |

## Changes Made

### Task 1: globals.css

**Font tokens (`@theme inline`):**
- `--font-sans`: now leads with `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif` (was `var(--font-dm-sans), var(--font-geist-sans), system-ui, ...`)
- `--font-display`: unchanged — `'Fraunces', Georgia, serif`
- `--font-mono`: unchanged — DM Mono + Geist Mono + SF Mono

**Light theme `:root` palette (Notion-like neutral):**
- `--background`: `#ffffff` (was `#fdfcfa`)
- `--background-subtle`: `#f7f7f5` (was `#f8f7f5`)
- `--background-muted`: `#f1f1ef` (was `#f3f2ef`)
- `--foreground`: `#37352f` (was `#1a1918`, Notion's actual text color)
- `--foreground-muted`: `#787774` (was `#6b6966`)
- `--card`, `--popover`: `#ffffff` (was `#fdfcfa`)
- `--card-foreground`, `--popover-foreground`: `#37352f` (was `#1a1918`)
- `--secondary`, `--muted`, `--accent`: `#f1f1ef` (was `#f3f2ef`)
- `--secondary-foreground`, `--accent-foreground`: `#37352f` (was `#1a1918`)
- `--muted-foreground`: `#787774` (was `#6b6966`)
- `--border`, `--input`: `#e9e9e7` (was `#e8e6e3`)
- `--border-subtle`: `#efefed` (was `#f0eeeb`)
- `--sidebar`: `#f7f7f5` (was `#f8f7f5`)
- `--sidebar-foreground`, `--sidebar-accent-foreground`: `#37352f` (was `#1a1918`)
- `--sidebar-accent`: `#f1f1ef` (was `#f3f2ef`)
- `--sidebar-border`: `#e9e9e7` (was `#e8e6e3`)

**Dark theme `.dark` palette (neutral parity):**
- `--background`: `#191919` (was `#1a1918`)
- `--background-subtle`: `#222222` (was `#232220`)
- `--background-muted`: `#2c2c2c` (was `#2d2c2a`)
- `--foreground`: `#ebebeb` (was `#edeceb`)
- `--foreground-muted`: `#9b9b9b` (was `#9c9590`)
- `--card`, `--popover`: `#222222` (was `#232220`)
- `--card-foreground`, `--popover-foreground`: `#ebebeb` (was `#edeceb`)
- `--secondary`, `--muted`, `--accent`: `#2c2c2c` (was `#2d2c2a`)
- `--secondary-foreground`, `--accent-foreground`: `#ebebeb` (was `#edeceb`)
- `--muted-foreground`: `#9b9b9b` (was `#9c9590`)
- `--border`, `--input`: `#3c3c3c` (was `#3d3c3a`)
- `--border-subtle`: `#333333` (was `#333230`)
- `--sidebar`: `#141414` (was `#151413`)
- `--sidebar-foreground`, `--sidebar-accent-foreground`: `#ebebeb` (was `#edeceb`)
- `--sidebar-accent`: `#2c2c2c` (was `#2d2c2a`)
- `--sidebar-border`: `#3c3c3c` (was `#3d3c3a`)

**Preserved unchanged:** primary teal `#29a386`, destructive, warning, AI partner blues, issue state colors, priority colors, ring, layout dimensions, border-radius, animation tokens.

**Neutralized utilities (hsl hue 30/40 → 0):**
- `.shadow-warm-sm/warm/warm-md/warm-lg/warm-xl`: `hsl(30 10% 10%)` → `hsl(0 0% 0%)`
- `.glass`, `.glass-subtle`: `hsl(40 20% 98%)` → `hsl(0 0% 98%)`, border `hsl(40 10% 90%)` → `hsl(0 0% 90%)`
- `.scrollbar-thin`: `hsl(40 10% 90%)` → `hsl(0 0% 90%)`
- `.interactive:hover` shadow: `hsl(30 10% 10%)` → `hsl(0 0% 0%)`
- `.animate-shimmer`: `hsl(40 15% 95%)` → `hsl(0 0% 95%)`
- `.code-block-wrapper:hover` shadow: neutralized
- `.code-block-wrapper pre::-webkit-scrollbar-thumb`: neutralized
- `.mermaid-unified-block` active toggle shadow: neutralized
- `.mermaid-unified-block .mermaid-code-section` scrollbar: neutralized

### Task 2: layout.tsx

- Removed `DM_Sans` import and `dmSans` font const
- Removed `${dmSans.variable}` from body className
- Updated viewport light `themeColor`: `#FDFCFA` → `#ffffff`
- Updated viewport dark `themeColor`: `#1A1A1A` → `#191919`
- Preserved Fraunces `<link>` tag, DM Mono, JetBrains Mono, Geist Sans/Mono

## Verification

```
grep "system-ui" globals.css     → PASS: system-ui found in --font-sans
grep "#fdfcfa" globals.css       → PASS: no matches (warm background gone)
grep "DM_Sans" layout.tsx        → PASS: no matches (DM Sans removed)
grep "hsl(30" globals.css        → PASS: no matches (warm shadows neutralized)
pnpm type-check                  → PASS: no TypeScript errors
pnpm lint                        → PASS: 0 errors, 21 pre-existing warnings
```

## Deviations from Plan

**1. [Rule 1 - Bug] Neutralized warm hsl values in code-block and mermaid utilities**
- Found during: Task 1 review
- Issue: `.code-block-wrapper:hover`, `.code-block-wrapper pre::-webkit-scrollbar-thumb`, `.mermaid-unified-block` active toggle, and mermaid code section scrollbar all used `hsl(30 10% ...)` — plan mentioned lines 314-395 but these were at lines 2153-2411
- Fix: Applied same `hsl(30) → hsl(0 0% 0%)` and `hsl(30 10% 80%) → hsl(0 0% 80%)` neutralization
- Files modified: `frontend/src/app/globals.css`
- Commit: 223117a1

**2. [Rule 1 - Bug] Fixed shimmer animation warm value**
- Found during: Task 1 review
- Issue: `.animate-shimmer` used `hsl(40 15% 95%)` — also warm, not covered explicitly in plan's line range
- Fix: `hsl(40 15% 95%) → hsl(0 0% 95%)`
- Files modified: `frontend/src/app/globals.css`
- Commit: 223117a1

## Self-Check: PASSED

- [x] `frontend/src/app/globals.css` exists and contains `system-ui`
- [x] `frontend/src/app/layout.tsx` exists without `DM_Sans`
- [x] Commit 223117a1 exists
- [x] Commit 8251667f exists
