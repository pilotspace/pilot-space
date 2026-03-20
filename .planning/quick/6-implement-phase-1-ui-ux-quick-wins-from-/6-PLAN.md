---
phase: quick-6
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/app/layout.tsx
  - frontend/src/app/globals.css
  - frontend/src/components/layout/sidebar.tsx
  - frontend/src/app/(workspace)/[workspaceSlug]/notes/page.tsx
  - frontend/src/features/members/components/member-card.tsx
  - frontend/src/components/projects/ProjectCard.tsx
  - frontend/src/components/role-skill/RoleCard.tsx
autonomous: true
requirements: [UX-AUDIT-PHASE1]

must_haves:
  truths:
    - "No unused font packages (Geist Sans, Geist Mono, DM Mono) are loaded"
    - "No Fraunces Google Fonts network request is made"
    - "muted-foreground token passes AA contrast (5.1:1 on white)"
    - "Buttons do not bounce/lift on hover"
    - "--primary-text and --ai-text tokens exist in both light and dark themes"
  artifacts:
    - path: "frontend/src/app/layout.tsx"
      provides: "Font cleanup — only JetBrains Mono loaded"
    - path: "frontend/src/app/globals.css"
      provides: "Updated design tokens (muted-foreground, font-mono, primary-text, ai-text)"
  key_links:
    - from: "frontend/src/app/globals.css"
      to: "CSS variables"
      via: "--primary-text and --ai-text declared in :root and .dark"
      pattern: "--primary-text"
---

<objective>
Apply Phase 1 UI/UX quick wins from the design audit: remove unused fonts, fix contrast token, eliminate bouncing button hover, and add accessible text color tokens.

Purpose: These are zero-regression changes that improve load performance (fewer font downloads), accessibility (AA-compliant muted text), and UX polish (dev tools don't bounce).
Output: Updated layout.tsx, globals.css, and 5 component files with translate-y hover removed.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Clean up fonts in layout.tsx</name>
  <files>frontend/src/app/layout.tsx</files>
  <action>
    1. Remove imports: `GeistSans` from `geist/font/sans`, `GeistMono` from `geist/font/mono`, `DM_Mono` from `next/font/google`.
    2. Remove the `dmMono` font instantiation block entirely (lines 17-22).
    3. Keep only the `jetbrainsMono` constant (already correct).
    4. Remove the three `<link>` tags in `<head>` for Google Fonts (preconnect to fonts.googleapis.com, preconnect to fonts.gstatic.com, the Fraunces stylesheet link). Remove the `eslint-disable` comment above the link tag too.
    5. Remove the empty `<head>` element entirely since it will be empty after the link removal.
    6. Update `<body className>` to remove `${GeistSans.variable}`, `${GeistMono.variable}`, `${dmMono.variable}` — keep only `${jetbrainsMono.variable}`.
    7. Result: only `JetBrains_Mono` is imported and applied.

    Note: `geist` package may still be in package.json — do NOT remove it from package.json (may be used elsewhere). Only remove the import from layout.tsx.
  </action>
  <verify>
    <automated>cd /Users/tindang/workspaces/tind-repo/pilot-space/frontend && pnpm type-check 2>&1 | tail -5</automated>
  </verify>
  <done>layout.tsx has no GeistSans/GeistMono/DM_Mono imports, no Google Fonts links, body className only has jetbrainsMono.variable. Type-check passes.</done>
</task>

<task type="auto">
  <name>Task 2: Fix design tokens in globals.css</name>
  <files>frontend/src/app/globals.css</files>
  <action>
    Make the following targeted edits to globals.css:

    **A. Update --font-mono in @theme inline block (line ~77):**
    Change:
    ```
    --font-mono: var(--font-dm-mono), var(--font-geist-mono), 'SF Mono', monospace;
    ```
    To:
    ```
    --font-mono: var(--font-jetbrains-mono), 'JetBrains Mono', 'SF Mono', 'Cascadia Code', 'Fira Code', ui-monospace, monospace;
    ```

    **B. Fix --muted-foreground in :root (light theme, line ~131):**
    Change:
    ```
    --muted-foreground: #787774;
    ```
    To:
    ```
    --muted-foreground: #6F6E6B;
    ```
    (Dark theme value at line ~226 stays as `#9b9b9b` — already adequate contrast.)

    **C. Add --primary-text and --ai-text tokens at end of :root block (before closing `}` of :root, after the `--content-max-width` line):**
    ```css
    /* Accessible text colors (AA compliant) */
    --primary-text: #1F7D66;
    --ai-text: #4A6F8F;
    ```

    **D. Add --primary-text and --ai-text tokens at end of .dark block (after the existing AI Partner / sidebar tokens, before closing `}`):**
    ```css
    /* Accessible text colors (AA compliant) */
    --primary-text: #4ECAA8;
    --ai-text: #8FB5D3;
    ```

    **E. Add Tailwind color mappings in @theme inline block** — after the existing `--color-ai-border` line, add:
    ```css
    --color-primary-text: var(--primary-text);
    --color-ai-text: var(--ai-text);
    ```

    Do NOT touch --font-sans (it already has the correct system stack). Do NOT touch --font-display.
  </action>
  <verify>
    <automated>cd /Users/tindang/workspaces/tind-repo/pilot-space/frontend && grep -n "primary-text\|ai-text\|6F6E6B\|font-jetbrains-mono.*SF Mono" src/app/globals.css | head -20</automated>
  </verify>
  <done>globals.css has --muted-foreground: #6F6E6B in :root, --font-mono references jetbrains-mono first, --primary-text and --ai-text exist in both :root and .dark, and Tailwind mappings added in @theme.</done>
</task>

<task type="auto">
  <name>Task 3: Remove button translateY hover from 5 component files</name>
  <files>
    frontend/src/components/layout/sidebar.tsx,
    frontend/src/app/(workspace)/[workspaceSlug]/notes/page.tsx,
    frontend/src/features/members/components/member-card.tsx,
    frontend/src/components/projects/ProjectCard.tsx,
    frontend/src/components/role-skill/RoleCard.tsx
  </files>
  <action>
    In each file, find all occurrences of `hover:-translate-y-0.5` and remove that class token from the className string. Do not remove other hover classes on the same element (e.g., `hover:bg-primary/90`, `hover:shadow-md` etc. stay).

    Example: `className="... hover:-translate-y-0.5 hover:shadow-md ..."` becomes `className="... hover:shadow-md ..."`.

    After editing, verify no `hover:-translate-y-0.5` remains in any of the 5 files.
  </action>
  <verify>
    <automated>cd /Users/tindang/workspaces/tind-repo/pilot-space/frontend && grep -r "hover:-translate-y-0.5" src/ && echo "FOUND — fix incomplete" || echo "CLEAN — no translate-y hover found"</automated>
  </verify>
  <done>Zero occurrences of `hover:-translate-y-0.5` in the frontend/src directory. Frontend lint passes.</done>
</task>

</tasks>

<verification>
Run frontend quality gates after all tasks:

```bash
cd /Users/tindang/workspaces/tind-repo/pilot-space/frontend && pnpm lint && pnpm type-check
```

Expected: no errors. Warnings about unused CSS variables are acceptable.
</verification>

<success_criteria>
- layout.tsx: only JetBrains Mono loaded, no Fraunces Google Fonts request, no GeistSans/GeistMono/DM_Mono
- globals.css: --muted-foreground is #6F6E6B (light), --font-mono leads with jetbrains-mono, --primary-text and --ai-text tokens in both themes
- 5 component files: zero `hover:-translate-y-0.5` occurrences
- `pnpm lint && pnpm type-check` passes
</success_criteria>

<output>
After completion, create `.planning/quick/6-implement-phase-1-ui-ux-quick-wins-from-/6-SUMMARY.md` with what was changed.
</output>
