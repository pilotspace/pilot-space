# Phase 28: Visual Design Refresh - Research

**Researched:** 2026-03-13
**Domain:** Frontend CSS/Design Tokens — Tailwind v4, shadcn/ui, Next.js App Router
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| UI-01 | Typography, spacing, and colors are refreshed to a Notion-like feel (system fonts, 8px grid, muted palette) | Tailwind v4 CSS custom properties in globals.css are the single source of truth — token changes propagate automatically across all components; no component edits required for most changes |

</phase_requirements>

---

## Summary

The project already has a well-structured design token system (v2.0) defined in `frontend/src/app/globals.css` using Tailwind v4's `@theme inline` and CSS custom properties. The 2,635-line globals.css defines the complete palette, typography stack, spacing, shadows, animations, and component utilities. The token architecture is centralized: changing values in globals.css cascades through all 200+ components that consume Tailwind utility classes via the CSS variable mappings.

The current design uses DM Sans (Google Fonts, loaded via `next/font/google`) as the primary UI font and Fraunces (loaded via Google Fonts link tag) as a display/heading font. The requirement calls for a switch to a system font stack — which means replacing or supplementing DM Sans with `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`. The color palette in globals.css is already warm and professional (warm off-white `#fdfcfa`, teal primary `#29a386`), but the requirement calls for a Notion-like feel — Notion uses a neutral gray-white base rather than the current warm-amber tint. The spacing spec in ui-design-spec.md documents a 4px grid, but the success criterion requires 8px grid. This is a token-only change — Tailwind v4 naturally supports 8px multiples via standard spacing utilities (p-2=8px, p-4=16px, etc.) which are already in use.

**Primary recommendation:** Phase 28 is almost entirely a `globals.css` edit — update `--font-sans`, align background tokens toward neutral Notion-like grays, verify dark mode parity, and audit that no existing pages hardcode values that bypass tokens. No new npm packages are needed. Two plans: (1) token audit + globals.css update, (2) visual regression check across all key pages.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Tailwind CSS | ^4 (v4.1.18 installed) | Utility classes driven by CSS custom properties | Already in use; v4 `@theme inline` is the canonical token pattern |
| shadcn/ui | Current (all Radix primitives installed) | Component library consuming CSS tokens | All UI components inherit from globals.css tokens |
| class-variance-authority (cva) | ^0.7.1 | Variant management in components | Used in button.tsx and throughout |
| tw-animate-css | ^1.4.0 | Animation utilities | Already imported in globals.css |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| next/font/google | (bundled with Next.js 16.1.4) | Zero-FOUT font loading | Use for any Google Font loaded via CSS variable |
| clsx + tailwind-merge | ^2.1.1 / ^3.4.0 | cn() utility for conditional classes | Already used everywhere via `@/lib/utils` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| System font stack (requirement) | DM Sans (current) | System fonts = zero web font load, truly Notion-like; DM Sans = slight brand personality but adds 50-100ms FCP |
| globals.css token edit | Per-component class updates | Token edit is O(1); per-component is O(n) and error-prone |

**Installation:**
No new packages required. All needed tooling is already installed.

---

## Architecture Patterns

### Recommended Project Structure
```
frontend/src/app/
└── globals.css          # Single source of truth for ALL design tokens
frontend/src/app/
└── layout.tsx           # Font loading — update font variables here

No new files needed for token changes.
```

### Pattern 1: Tailwind v4 CSS Custom Property Tokens
**What:** Tailwind v4 uses `@theme inline { }` to map utility class names to CSS custom properties. The properties themselves are defined in `:root` and `.dark` blocks.
**When to use:** Any time a design token value changes — edit only the CSS custom property in `:root`/`.dark`, not the component.
**Example:**
```css
/* Source: frontend/src/app/globals.css */
@theme inline {
  --font-sans: var(--font-dm-sans), var(--font-geist-sans), system-ui, sans-serif;
  --color-background: var(--background);
}

:root {
  --background: #fdfcfa;            /* current: warm amber-tint */
  --font-dm-sans: /* Next.js injects this from layout.tsx */;
}
```
To switch to system fonts, change the `@theme inline` font mapping and remove/skip the `--font-dm-sans` variable reference.

### Pattern 2: Font Loading in Next.js App Router
**What:** `next/font/google` loads fonts at build time with zero layout shift. Font CSS variables are injected on `<body>` className.
**When to use:** Any new or replacement font.
**Example:**
```typescript
// Source: frontend/src/app/layout.tsx (current pattern)
import { DM_Sans } from 'next/font/google';
const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',   // ← CSS custom property name
  display: 'swap',
  weight: ['300', '400', '500', '600', '700'],
});
// body gets className={`${dmSans.variable} font-sans`}
```
For system fonts, this entire Google Font import can be removed; the `@theme inline` `--font-sans` can be set directly to `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`.

### Pattern 3: Dark Mode via `.dark` Class
**What:** The project uses Tailwind v4 `@custom-variant dark (&:is(.dark *))` — dark mode activates when any ancestor has `.dark` class. Token overrides are defined in the `.dark` block in globals.css.
**When to use:** Every light-mode token change MUST have a corresponding dark-mode parity check.
**Example:**
```css
/* Source: frontend/src/app/globals.css */
:root {
  --background: #fdfcfa;   /* light */
}
.dark {
  --background: #1a1918;   /* dark parity */
}
```

### Pattern 4: 8px Grid Alignment
**What:** Tailwind v4 spacing scale defaults are: `space-1=4px, space-2=8px, space-4=16px, space-6=24px, space-8=32px`. The success criterion says 8px grid — this means using even multiples of `space-2` (8px) for all layout spacing. The existing components already predominantly use `px-4`, `py-3`, `gap-4` etc. which are multiples of 4px. "8px grid" means avoiding `p-1`, `p-3`, `p-5` for major structural spacing.
**When to use:** When auditing pages for spacing consistency.
**Note:** No token change needed for this — Tailwind's default scale already supports 8px multiples. It's a code review pattern, not a CSS change.

### Anti-Patterns to Avoid
- **Hardcoded hex values in component className props:** Any `style={{ color: '#xxx' }}` or `bg-[#xxx]` bypasses the token system and won't respect dark mode. Check the components directory for these.
- **Importing Fraunces from Google Fonts via `<link>` tag:** The current layout.tsx uses a raw `<link>` tag for Fraunces (because of variable font axis requirements). This is acceptable but adds a render-blocking request. Phase 28 should move Fraunces loading to `next/font/google` if possible (or keep as-is and note the limitation).
- **Changing Tailwind utility class names in components:** The token system means changing `:root { --background: ... }` is sufficient — don't also change `bg-background` references in components.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| System font stack | Custom font loading logic | Remove DM Sans + set `--font-sans` in `@theme inline` | Browser provides system fonts natively |
| Dark mode toggle | Custom CSS class toggling | Existing `UIStore.theme` + Tailwind `.dark` class variant | Already implemented and wired |
| CSS variable mapping | New token abstraction layer | Tailwind v4 `@theme inline` already provides this | Adding another layer creates drift |
| Color palette generator | Custom palette tooling | Direct hex values in `:root` | Simpler, auditable, no tooling dependency |

**Key insight:** This phase is a CSS variable editing exercise, not an architecture change. The token system is already production-ready; the work is updating values within it.

---

## Common Pitfalls

### Pitfall 1: Breaking Dark Mode Parity
**What goes wrong:** Changing a light-mode token without updating the corresponding `.dark` block creates unreadable text or invisible elements in dark mode.
**Why it happens:** globals.css has two separate blocks (`:root` and `.dark`) and they're 100+ lines apart.
**How to avoid:** For every token change in `:root`, immediately find and update the matching property in `.dark`.
**Warning signs:** Dark mode screenshot shows pure white text on near-white background, or invisible borders.

### Pitfall 2: Font Loading Flash (FOUT)
**What goes wrong:** Removing `DM_Sans` from next/font but keeping `var(--font-dm-sans)` reference in `@theme inline --font-sans` causes the font variable to be undefined, falling through to system-ui silently (actually fine) — but if Fraunces via `<link>` is removed without replacement, display headings go unstyled.
**Why it happens:** Three font loading mechanisms coexist: `next/font/google` (DM Sans, DM Mono, JetBrains Mono), Geist (package import), and raw `<link>` (Fraunces).
**How to avoid:** When switching to system fonts, update all three mechanisms consistently. The `display: 'swap'` on all next/font fonts already prevents render blocking.
**Warning signs:** `document-title` and `.font-display` classes render in Times New Roman (Fraunces fallback).

### Pitfall 3: Hardcoded Colors in Non-Token Styles
**What goes wrong:** Some CSS classes in globals.css use literal hsl() values instead of CSS custom properties (e.g., `.shadow-warm-sm` uses `hsl(30 10% 10% / 0.04)` directly, not `var(--some-token)`). Changing the palette in `:root` won't affect these.
**Why it happens:** Shadow values and some glass utilities were written with hardcoded values rather than tokens.
**How to avoid:** During token audit, grep for hardcoded hex/hsl in globals.css and decide whether to tokenize them.
**Warning signs:** After token changes, shadows look inconsistent with the new palette.

### Pitfall 4: Spacing Audit Scope Creep
**What goes wrong:** Attempting to update every `p-3` or `space-y-5` in 200+ component files turns a focused token update into a weeks-long refactor.
**Why it happens:** "8px grid" sounds like it requires fixing all spacing, but the success criterion says "consistent padding and margins across all pages" — this means structural layout spacing, not every internal component padding.
**How to avoid:** Limit spacing changes to page-level layout containers (the `px-4 py-3` patterns in page headers, sidebar padding, main content padding). Don't touch internal component spacing in shadcn/ui primitives.
**Warning signs:** The plan scope grows to 50+ component files.

### Pitfall 5: Removing Custom Font Breaks Specific Features
**What goes wrong:** `document-title`, `section-heading`, and `subsection-heading` CSS classes in globals.css explicitly reference `'Fraunces', Georgia, serif`. If the project decision is "system fonts everywhere", these classes need updating too. But if Fraunces is intentionally kept for display headings (Notion-like docs use Inter for body but custom headings are common), only the body font changes.
**Why it happens:** Phase requirement says "system font stack" — ambiguous about whether display headings are included.
**How to avoid:** Clarify in Plan 01 whether the target is (a) system fonts for everything including headings, or (b) system fonts for body/UI, custom font for document titles. Notion itself uses a custom font (Notion's own typeface or Inter) — not pure system fonts.
**Warning signs:** Page title styling looks inconsistent after body font change.

---

## Code Examples

Verified patterns from existing codebase:

### Current Font Token Setup (globals.css lines 73-76)
```css
/* Source: frontend/src/app/globals.css */
/* Typography - Pilot Space v4 fonts */
--font-display: 'Fraunces', Georgia, serif;
--font-sans: var(--font-dm-sans), var(--font-geist-sans), system-ui, sans-serif;
--font-mono: var(--font-dm-mono), var(--font-geist-mono), 'SF Mono', monospace;
```

### System Font Stack (Notion-like)
```css
/* Target for Phase 28 */
--font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue",
             Arial, system-ui, sans-serif;
/* OR preserve variable fallback but put system-ui first: */
--font-sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

### Current Color Token Values (`:root`, lines 103-191)
```css
/* Source: frontend/src/app/globals.css */
--background: #fdfcfa;           /* warm amber-tint off-white */
--background-subtle: #f8f7f5;
--background-muted: #f3f2ef;
--foreground: #1a1918;           /* warm near-black */
--border: #e8e6e3;
--muted: #f3f2ef;
--muted-foreground: #6b6966;
```

### Notion-like Neutral Direction (target values)
```css
/* Notion reference: cooler, more neutral grays, no amber tint */
--background: #ffffff;           /* pure white, or #fafafa for slight warmth */
--background-subtle: #f7f7f5;    /* barely-there gray */
--background-muted: #f1f1ef;     /* light surface */
--foreground: #37352f;           /* Notion's actual text color */
--border: #e9e9e7;               /* Notion-like border */
--muted-foreground: #9b9a97;     /* Notion's secondary text */
```

### 8px Grid Structural Padding (existing correct usage to preserve)
```tsx
// Source: frontend/src/app/(workspace)/[workspaceSlug]/issues/page.tsx
// px-4=16px, py-3=12px are 4px-grid but close to 8px
<div className="border-b px-4 py-3 sm:px-6 sm:py-4">
  <h1 className="text-xl font-semibold sm:text-2xl">Issues</h1>
```
Target pattern (8px grid aligned):
```tsx
// py-2=8px or py-4=16px instead of py-3=12px
<div className="border-b px-4 py-2 sm:px-6 sm:py-4">
```

### Type Scale — Current Mapping (ui-design-spec.md lines 200-210)
```
text-xs  = 11px  (label/badge)
text-sm  = 13px  (body/descriptions)
text-base = 15px (primary content)
text-lg  = 17px  (card titles)
text-xl  = 20px  (section headers)
text-2xl = 24px  (page titles)
text-3xl = 30px  (hero text)
```
These are Tailwind v4 defaults which match closely. No type scale change needed in globals.css — the heading hierarchy is already correct for Notion-like design.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tailwind config.js (v3) | CSS `@theme inline` block (v4) | v4.0 release | All token customization lives in CSS, no JS config file |
| `tailwind.config.js` extend.colors | `:root` CSS variables + `@theme inline` | v4.0 | Simpler, co-located with styles |
| `next/font` for all fonts | Mix: `next/font` + raw `<link>` for Fraunces | Fraunces uses variable font axes not supported by next/font | Raw link is render-blocking; accepted tradeoff per comment in layout.tsx |

**Deprecated/outdated:**
- `tailwind.config.js`: Not present in this project — correct for Tailwind v4. Do not create one.
- `@apply` for non-base styles: globals.css already avoids this correctly (uses direct CSS for custom classes).

---

## Open Questions

1. **System fonts for headings too?**
   - What we know: Phase success criterion says "system font stack" generically. The current `.document-title` class explicitly uses Fraunces for editorial quality.
   - What's unclear: Whether "Notion-like" means pure system fonts everywhere, or system fonts for body with a curated display font for titles (Notion itself uses Inter + a custom heading font).
   - Recommendation: Default to system fonts for body/UI (`--font-sans`) and keep Fraunces for `--font-display` / `.document-title`. If planner disagrees, the change is one line in globals.css. Document this choice in Plan 01.

2. **Scope of 8px grid enforcement**
   - What we know: The structural spacing in pages uses `py-3` (12px) which is not an 8px multiple.
   - What's unclear: Does success criterion require updating all page headers and section padding, or just auditing that no arbitrary spacing values appear?
   - Recommendation: Limit to auditing page-level layout containers (6-10 files max). Do not touch internal component spacing in shadcn/ui primitives.

3. **Color shift: warm-amber vs neutral**
   - What we know: Current tokens have a warm amber tint (`#fdfcfa`, `#f3f2ef`). Notion uses neutral cool-gray whites.
   - What's unclear: How much of the warmth to remove — the ui-design-spec.md explicitly calls for "warm off-white" as a brand differentiator.
   - Recommendation: Nudge toward neutral (reduce amber tint from current values) without going fully Notion. Target `#fafaf9` background (slightly less warm than `#fdfcfa`). This preserves brand identity while meeting the "Notion-like" requirement.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x + jsdom |
| Config file | `frontend/vitest.config.ts` |
| Quick run command | `cd frontend && pnpm test --run` |
| Full suite command | `cd frontend && pnpm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UI-01 | CSS tokens produce Notion-like feel | Visual / manual-only | Manual browser review | N/A |
| UI-01 | globals.css compiles without errors | Smoke | `cd frontend && pnpm type-check` | ✅ |
| UI-01 | No hardcoded color bypasses tokens | Code audit | Manual grep during review | N/A |
| UI-01 | Existing pages retain layout after token changes | Regression | `cd frontend && pnpm test --run` (existing component tests) | ✅ |

**Note:** Visual design changes are inherently manual-review tests. Existing unit tests (component render tests in `src/components/__tests__/`) will catch regressions where token changes break component rendering.

### Sampling Rate
- **Per task commit:** `cd frontend && pnpm type-check && pnpm lint`
- **Per wave merge:** `cd frontend && pnpm test --run`
- **Phase gate:** Full suite green + manual dark/light mode browser review before `/gsd:verify-work`

### Wave 0 Gaps
None — existing test infrastructure covers all phase requirements. No new test files required for this phase (design token changes are visual, not unit-testable).

---

## Sources

### Primary (HIGH confidence)
- Direct read of `frontend/src/app/globals.css` — complete token inventory, 2635 lines
- Direct read of `frontend/src/app/layout.tsx` — font loading mechanism confirmed
- Direct read of `frontend/src/components/ui/button.tsx` — CVA pattern confirmed
- Direct read of `frontend/package.json` — Tailwind v4, all Radix packages, shadcn/ui stack

### Secondary (MEDIUM confidence)
- `specs/001-pilot-space-mvp/ui-design-spec.md` v4.0 — official design system documentation
- `.planning/REQUIREMENTS.md` — UI-01 definition and success criteria

### Tertiary (LOW confidence)
- Notion color values (`#37352f` foreground, `#fafafa` background) — inferred from public Notion UI inspection; not officially documented

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified by direct package.json read
- Architecture: HIGH — globals.css token structure directly inspected
- Pitfalls: HIGH — identified from direct code inspection of globals.css and layout.tsx
- Target color values: MEDIUM — Notion-like values are approximations based on design direction

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable — Tailwind v4 API is stable, no expected breaking changes)
