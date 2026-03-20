# Phase 37: Artifact Preview Rendering Engine — Research

**Researched:** 2026-03-20
**Domain:** Frontend rendering — sandboxed HTML live preview, syntax highlighting, markdown, TipTap NodeView patterns
**Confidence:** HIGH

## Summary

Phase 37 extends the existing `FilePreviewModal` renderer system (built in Phase 34) to add a sandboxed HTML live preview option alongside the source view. Currently, HTML files are intentionally routed to `CodeRenderer` (escaped source) as an XSS prevention measure — that rule is codified in `mime-type-router.ts` as a `CRITICAL` comment and a passing test that explicitly asserts HTML does NOT use live render. The phase must preserve this safety while adding an opt-in toggle.

The project already has all the building blocks needed: `dompurify@^3.3.1` is installed, the sandboxed iframe pattern is established in `pm-block-styles.ts` (used for ECharts/visualization), the toggle pattern is established in `MermaidNodeView` (Preview/Code tabs), and `react-markdown` + `rehype-highlight` are already used by both `CodeRenderer` and `MarkdownRenderer` via `MarkdownContent`. No new runtime dependencies are required for this phase.

The "inline preview in notes and ChatView" component of the phase refers to improving MarkdownContent (used across the editor and ChatView) and code blocks — these are already mostly functional. The gap is: HTML artifact preview needs a sandboxed live-render toggle, and the `MarkdownContent` component used by `MarkdownRenderer` (in `FilePreviewModal`) could optionally be upgraded with better styling isolation.

**Primary recommendation:** Add an `HtmlRenderer` component that wraps content in a sandboxed `<iframe srcdoc>` with an explicit toggle between "Preview" and "Source" modes. Add `'html-preview'` to `RendererType` and update `mime-type-router.ts` to route `.html`/`.htm`/`text/html` to `html-preview` instead of `code`. Update the affected test assertions accordingly. No new npm packages needed.

## Standard Stack

### Core (all already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `dompurify` | ^3.3.1 (latest: 3.3.3) | Sanitize HTML before srcdoc injection | Already in package.json; used by MermaidPreview |
| `rehype-highlight` | ^7.0.2 (latest: 7.0.2) | Syntax highlighting in MarkdownContent | Already used |
| `react-markdown` | ^10.1.0 (latest: 10.1.0) | Markdown rendering | Already used; powers both MarkdownRenderer and CodeRenderer |
| `lowlight` | ^3.2.0 | Language grammar for code blocks in TipTap | Already used |

### No New Dependencies Needed
The sandboxed `<iframe srcdoc>` pattern requires zero new packages. `dompurify` is already installed and in use for Mermaid SVG sanitization. All rendering libraries are in place.

**Installation:** None required. All packages already installed.

## Architecture Patterns

### Recommended Project Structure

The new renderer follows the existing pattern in `frontend/src/features/artifacts/components/renderers/`:

```
frontend/src/features/artifacts/components/renderers/
├── CodeRenderer.tsx          # Existing — syntax-highlighted code
├── MarkdownRenderer.tsx      # Existing — prose markdown
├── HtmlRenderer.tsx          # NEW — sandboxed live preview + source toggle
├── ImageRenderer.tsx         # Existing
├── JsonRenderer.tsx          # Existing
├── TextRenderer.tsx          # Existing
├── CsvRenderer.tsx           # Existing
└── DownloadFallback.tsx      # Existing
```

### Pattern 1: Sandboxed iframe srcdoc for HTML Live Preview

**What:** Inject sanitized HTML into `<iframe srcdoc>` with a restrictive `sandbox` attribute. The sandbox attribute blocks scripts, forms, same-origin access, and popups.

**When to use:** When user explicitly opts into "Preview" mode for an HTML file.

**Security contract:** DOMPurify sanitization + iframe sandbox. Two independent layers. The outer page's DOM is never touched.

The iframe sandbox string:
```
allow-same-origin
```
This permits CSS from same-origin to resolve. Intentionally omitted: `allow-scripts` (disables all JavaScript in the preview), `allow-forms` (disables form submission), `allow-popups` (disables window.open).

**CRITICAL:** `allow-same-origin` + `allow-scripts` together would enable iframe breakout attacks. Never include `allow-scripts`.

**CSP impact:** The existing `next.config.ts` CSP sets `frame-src 'self' https://www.youtube-nocookie.com https://player.vimeo.com`. A `srcdoc` iframe does NOT require a new `frame-src` exception — `srcdoc` frames are treated as same-origin by the browser specification and are covered by `'self'`.

### Pattern 2: Preview/Source Toggle (established by MermaidNodeView)

The `MermaidNodeView.ts` at `frontend/src/features/notes/editor/extensions/MermaidNodeView.ts` implements a Preview/Code toggle using local state and conditional display. `HtmlRenderer` follows the same pattern as a plain React component with `useState`.

```typescript
// State: 'preview' (default) or 'source'
const [viewMode, setViewMode] = React.useState<'preview' | 'source'>('preview');

// Toggle bar with role="tablist" + role="tab" buttons
// When viewMode === 'preview': render <iframe srcdoc>
// When viewMode === 'source': render <CodeRenderer content={content} language="html" />
```

Defaulting to 'preview' exposes the user to the HTML rendering. Consider defaulting to 'source' instead for an extra safety margin — the user must actively click "Preview" to render live content. This is a planning decision.

### Pattern 3: mime-type-router.ts Extension

The `RendererType` union must be extended and the routing logic updated in `frontend/src/features/artifacts/utils/mime-type-router.ts`:

Current (must change):
```
export type RendererType = 'image' | 'markdown' | 'text' | 'json' | 'code' | 'csv' | 'download';
// Rule 5: HTML -> 'code'
if (lowerMime === 'text/html' || ext === 'html' || ext === 'htm') return 'code';
```

Updated:
```
export type RendererType = 'image' | 'markdown' | 'text' | 'json' | 'code' | 'csv' | 'download' | 'html-preview';
// Rule 5: HTML -> 'html-preview'
if (lowerMime === 'text/html' || ext === 'html' || ext === 'htm') return 'html-preview';
```

**Test impact:** The existing test in `FilePreviewModal.test.tsx` at line 174 asserts HTML renders as `CodeRenderer` (the old XSS prevention behavior). This test must be updated to assert `HtmlRenderer` is used AND that the iframe sandbox is present.

### Pattern 4: FilePreviewModal Integration

Add `HtmlRenderer` case to the `renderContent()` switch in `FilePreviewModal.tsx`:

```typescript
import { HtmlRenderer } from './renderers/HtmlRenderer';

// In renderContent() switch:
case 'html-preview':
  return <HtmlRenderer content={content} filename={filename} />;
```

The `useFileContent` hook already handles `'html-preview'` because it skips fetching only for `'image'` and `'download'` renderer types. No changes needed to `useFileContent.ts`.

### Anti-Patterns to Avoid

- **Do NOT inject full HTML documents directly into the page DOM** — even with DOMPurify, full `<html>` documents (with `<head>`, `<style>`, `<body>`) can leak styles and attributes into the parent page. Use `<iframe srcdoc>` for full-document HTML. The iframe creates a fully isolated document environment.
- **Do NOT include `allow-scripts` in iframe sandbox** — this is intentional; scripts must not run in preview.
- **Do NOT skip DOMPurify even with sandbox** — defense in depth: if a browser sandbox bypass exists, DOMPurify still blocks common XSS vectors.
- **Do NOT set iframe `src` to a `data:` URI** — `data:` URIs are blocked by Next.js default CSP. Use `srcdoc` only.
- **Do NOT add `frame-src data:` to the CSP header** — use `srcdoc` instead; no CSP change needed.
- **Do NOT wrap HtmlRenderer in MobX `observer()`** — this component is not inside TipTap but follows the project convention of plain components unless actually observing MobX state. `HtmlRenderer` has no observable dependencies.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTML sanitization | Custom regex strip | `dompurify` (already installed) | Regex misses attribute injection, CSS expression attacks, SVG vectors; DOMPurify handles 300+ bypass techniques |
| Syntax highlighting | Manual tokenizer | `rehype-highlight` via `MarkdownContent` | Already works; `lowlight` grammar covers HTML and all needed languages |
| Iframe containment | Custom JS sandbox | `sandbox` attribute + `srcdoc` | Browser-native; zero JS overhead; enforced by browser security model |
| Markdown rendering | Custom parser | `react-markdown` + `remarkGfm` (already installed) | Already installed and styled with `.chat-markdown` CSS |

**Key insight:** This phase is almost entirely integration — connecting existing pieces (`dompurify`, `<iframe srcdoc>`, `CodeRenderer`, existing toggle pattern) rather than building new logic.

## Common Pitfalls

### Pitfall 1: iframe srcdoc Height Collapse
**What goes wrong:** Iframe with `height: auto` or no height collapses to 0px because `srcdoc` content does not trigger the browser's automatic height detection.
**Why it happens:** The iframe body's `scrollHeight` is not readable from the parent without `allow-same-origin` in sandbox, and even with it, automatic height adjustment requires JavaScript that is blocked.
**How to avoid:** Set a fixed minimum height (`min-h-[400px]`) and a `flex-1` class so the iframe fills available space in the modal. The `isMaximized` toggle on `FilePreviewModal` already expands to 95vh — users who need full-screen preview can use that.
**Warning signs:** Iframe renders but appears invisible; content exists in DOM inspector but has computed height: 0.

### Pitfall 2: Breaking the Existing HTML XSS Test
**What goes wrong:** The existing test `renders CodeRenderer (not DownloadFallback) for text/html — XSS prevention` in `FilePreviewModal.test.tsx` line 174 asserts that HTML does NOT render a DownloadFallback but DOES render `MarkdownContent` (from CodeRenderer). Changing `mime-type-router.ts` changes this behavior.
**Why it happens:** The test was written to assert the Phase 34 decision that HTML routes to 'code'. `HtmlRenderer` does not render `MarkdownContent` at the top level (only in source mode).
**How to avoid:** Update the test to mock `HtmlRenderer` and assert it is rendered when `mimeType='text/html'`. Add a dedicated `HtmlRenderer` unit test that asserts the iframe sandbox attribute excludes `allow-scripts`.

### Pitfall 3: DOMPurify SSR Crash
**What goes wrong:** `DOMPurify` requires `window` to exist. During Next.js SSR or static generation, it throws `TypeError: Cannot read properties of undefined (reading 'createTreeWalker')`.
**Why it happens:** `HtmlRenderer` would be executed server-side without `'use client'` directive.
**How to avoid:** Mark `HtmlRenderer.tsx` with `'use client'` at the top (same as all other renderers in the project). Additionally, guard the `DOMPurify.sanitize` call: compute inside a `useMemo` or check `typeof window !== 'undefined'` before calling.

### Pitfall 4: iframe Accessibility
**What goes wrong:** Screen reader announces iframe without context; keyboard users cannot navigate inside.
**Why it happens:** Default iframe has no `title` attribute.
**How to avoid:** Always include a descriptive `title` attribute on the iframe: `title={\`HTML preview: ${filename}\`}`.

### Pitfall 5: DOMPurify Stripping Style Tags
**What goes wrong:** HTML files that rely on `<style>` tags render unstyled in preview mode.
**Why it happens:** DOMPurify's default config strips `<style>` tags.
**How to avoid:** Use `USE_PROFILES: { html: true }` in the DOMPurify config — this preserves `<style>` elements. Do NOT include `'style'` in `FORBID_TAGS`. The `MermaidPreview` uses `USE_PROFILES: { svg: true, svgFilters: true, html: true }` — `HtmlRenderer` needs only `{ html: true }`.

### Pitfall 6: RendererType Extension Breaks TypeScript Exhaustiveness
**What goes wrong:** Adding `'html-preview'` to the `RendererType` union causes `TS2339` errors in switch exhaustiveness checks in `FilePreviewModal.tsx` and any other places that switch on `RendererType`.
**Why it happens:** TypeScript's `never` check patterns detect the unhandled union member.
**How to avoid:** Add the `case 'html-preview':` arm to `FilePreviewModal.tsx` `renderContent()` before adding the type to the union. Run `pnpm type-check` immediately after changing the type.

### Pitfall 7: Default Mode Safety
**What goes wrong:** Defaulting to 'preview' mode means every HTML file opened in the modal immediately renders live HTML.
**Why it happens:** The natural default for a "preview" mode is to preview.
**How to avoid:** Default to 'source' mode (show the code highlighted view first). User must explicitly click "Preview" to render live HTML. This is the safe-by-default posture consistent with the Phase 34 decision to never render HTML by default.

## Code Examples

### HtmlRenderer Component Skeleton

```typescript
// Source: patterns from MermaidNodeView.ts (toggle) + pm-block-styles.ts (sandbox)
// frontend/src/features/artifacts/components/renderers/HtmlRenderer.tsx
'use client';

import * as React from 'react';
// dompurify is already installed: package.json "dompurify": "^3.3.1"
import DOMPurify from 'dompurify';
import { CodeRenderer } from './CodeRenderer';

// Sandbox: allow-same-origin needed for same-origin CSS to resolve.
// NEVER include allow-scripts — would enable JavaScript execution.
const SANDBOX_ATTRS = 'allow-same-origin';

// DOMPurify config: preserve <style> via USE_PROFILES, block executable content
const PURIFY_CONFIG = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ['script', 'object', 'embed'],
} as const;

interface HtmlRendererProps {
  content: string;
  filename: string;
}

export function HtmlRenderer({ content, filename }: HtmlRendererProps) {
  // Default to 'source' — user opts in to live preview (safe-by-default)
  const [viewMode, setViewMode] = React.useState<'preview' | 'source'>('source');

  const sanitizedHtml = React.useMemo(() => {
    if (typeof window === 'undefined') return '';
    return DOMPurify.sanitize(content, PURIFY_CONFIG) as string;
  }, [content]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-1 px-4 py-2 border-b shrink-0" role="tablist">
        <button
          role="tab"
          aria-selected={viewMode === 'source'}
          onClick={() => setViewMode('source')}
        >
          Source
        </button>
        <button
          role="tab"
          aria-selected={viewMode === 'preview'}
          onClick={() => setViewMode('preview')}
        >
          Preview
        </button>
      </div>
      <div className="flex-1 overflow-auto min-h-0">
        {viewMode === 'preview' ? (
          <iframe
            srcDoc={sanitizedHtml}
            sandbox={SANDBOX_ATTRS}
            title={`HTML preview: ${filename}`}
            className="w-full border-0 min-h-[400px] flex-1"
          />
        ) : (
          <CodeRenderer content={content} language="html" />
        )}
      </div>
    </div>
  );
}
```

### Updated mime-type-router.ts Rule 5

```typescript
// frontend/src/features/artifacts/utils/mime-type-router.ts
// Update type:
export type RendererType =
  | 'image' | 'markdown' | 'text' | 'json'
  | 'code' | 'csv' | 'download' | 'html-preview';  // 'html-preview' added

// Update Rule 5 (was: return 'code'):
if (lowerMime === 'text/html' || ext === 'html' || ext === 'htm') return 'html-preview';
```

### FilePreviewModal.tsx Changes

```typescript
// Add import:
import { HtmlRenderer } from './renderers/HtmlRenderer';

// Add case in renderContent() switch (before default):
case 'html-preview':
  return <HtmlRenderer content={content} filename={filename} />;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `src="data:text/html,..."` iframes | `srcdoc` attribute | ~2020 | `data:` URIs blocked by CSP `frame-src`; `srcdoc` is same-origin and works |
| Full HTML injected into parent DOM | `<iframe srcdoc>` | Industry pattern ~2019+ | Iframe creates isolated document, prevents style leakage and JS execution |
| `@tailwindcss/typography` (prose-) | Custom `.chat-markdown` CSS | Phase 34 project decision | Typography not installed; existing CSS already renders well |

**Deprecated/outdated:**
- `src="data:text/html,..."`-based iframe: blocked by project CSP `frame-src 'self'`
- Alternative HTML sanitizers (sanitize-html, xss npm package): DOMPurify already installed, industry standard with largest test coverage

## Open Questions

1. **Default mode: 'source' vs 'preview'?**
   - What we know: Phase 34 decision locked: "HTML always routes to 'code' renderer — never live render HTML from storage, XSS prevention." This was intentional and should not be completely reversed.
   - What's unclear: Phase 37 says "add a sandboxed HTML live preview option alongside the source view" — "option" implies opt-in.
   - Recommendation: Default to 'source' mode. User must click "Preview" to render live HTML. Preserve the safe-by-default posture.

2. **Inline preview in notes (TipTap) — scope clarification**
   - What we know: FileCardView in the TipTap editor dispatches `pilot:preview-artifact` which opens `FilePreviewModal`. The modal will include `HtmlRenderer` after this phase.
   - What's unclear: Does "inline preview in notes" mean something beyond opening the modal? A TipTap NodeView that renders HTML inline in the canvas would be significantly more complex.
   - Recommendation: Interpret as modal-based preview accessed via file card click. This is the existing pattern for all other file types.

3. **ChatView inline preview — scope clarification**
   - What we know: ChatView uses `MarkdownContent` for AI text responses. There is no existing mechanism for AI responses to include artifact file references.
   - What's unclear: Does "markdown rendering in ChatView" mean CSS/styling improvements to `MarkdownContent`, or a new capability to render HTML/code artifacts inline in chat messages?
   - Recommendation: Interpret as `MarkdownContent` improvements — enhanced CSS or optional highlighting improvements. Rendering artifacts in chat requires backend AI changes outside this phase's scope.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.1.0 + @testing-library/react 16.2.0 |
| Config file | `frontend/vitest.config.ts` |
| Quick run command | `cd frontend && pnpm test -- src/features/artifacts` |
| Full suite command | `cd frontend && pnpm test` |

### Phase Requirements to Test Map

Phase 37 is a v1.2+ enhancement (no REQUIREMENTS.md IDs). Behavioral requirements derived from phase description:

| Behavior ID | Behavior | Test Type | Automated Command | File Exists? |
|-------------|----------|-----------|-------------------|-------------|
| HTML-01 | HTML file routes to `html-preview` renderer (not `code`) | unit | `cd frontend && pnpm test -- src/features/artifacts/utils/__tests__/mime-type-router.test.ts` | Exists — needs update |
| HTML-02 | HtmlRenderer renders `<iframe>` with `sandbox` attr in preview mode | unit | `cd frontend && pnpm test -- src/features/artifacts/components/__tests__/HtmlRenderer.test.tsx` | Wave 0 gap |
| HTML-03 | HtmlRenderer source mode delegates to CodeRenderer (highlighted HTML) | unit | (same file) | Wave 0 gap |
| HTML-04 | HtmlRenderer toggle switches between preview and source | unit | (same file) | Wave 0 gap |
| HTML-05 | FilePreviewModal renders HtmlRenderer for text/html MIME | unit | `cd frontend && pnpm test -- src/features/artifacts/components/__tests__/FilePreviewModal.test.tsx` | Exists — needs update |
| HTML-06 | iframe sandbox does NOT contain `allow-scripts` | unit | (HtmlRenderer test) | Wave 0 gap |

### Sampling Rate
- **Per task commit:** `cd frontend && pnpm test -- src/features/artifacts`
- **Per wave merge:** `cd frontend && pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/src/features/artifacts/components/__tests__/HtmlRenderer.test.tsx` — covers HTML-02, HTML-03, HTML-04, HTML-06
- [ ] Update `frontend/src/features/artifacts/utils/__tests__/mime-type-router.test.ts` — HTML-01 (assert 'html-preview' not 'code' for text/html, .html, .htm)
- [ ] Update `frontend/src/features/artifacts/components/__tests__/FilePreviewModal.test.tsx` line 174 — HTML-05 (mock HtmlRenderer, assert it renders for text/html; assert no DownloadFallback)

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `frontend/src/features/artifacts/` — all renderer components, hooks, MIME router
- Direct codebase inspection: `frontend/src/features/notes/editor/extensions/pm-blocks/MermaidPreview.tsx` — DOMPurify usage (PURIFY_CONFIG, `sanitizeSvg`)
- Direct codebase inspection: `frontend/src/features/notes/editor/extensions/MermaidNodeView.ts` — Preview/Code toggle NodeView pattern
- Direct codebase inspection: `frontend/next.config.ts` — existing CSP (`frame-src 'self'`)
- Direct codebase inspection: `frontend/package.json` — confirmed all required packages installed
- `.planning/STATE.md` Phase 34 decision: "HTML always routes to 'code' renderer — never live render HTML from storage, XSS prevention"

### Secondary (MEDIUM confidence)
- MDN iframe `srcdoc` specification — `srcdoc` treated as same-origin; CSP `frame-src 'self'` covers it without additional exceptions
- DOMPurify README — `USE_PROFILES: { html: true }` config preserves `<style>` blocks; FORBID_TAGS approach for blocking executable elements

### Tertiary (LOW confidence)
- None — all findings from direct codebase inspection or official specifications

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages confirmed installed in package.json with exact versions verified against npm registry
- Architecture: HIGH — HtmlRenderer is a direct composition of existing codebase elements (DOMPurify config from MermaidPreview, toggle from MermaidNodeView, iframe sandbox pattern from pm-block-styles.ts)
- Pitfalls: HIGH — iframe height collapse and DOMPurify SSR crash are established issues in this codebase; all other renderers use 'use client' and fixed heights

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (stable — no fast-moving dependencies)
