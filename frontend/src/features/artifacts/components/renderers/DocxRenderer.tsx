'use client';

import * as React from 'react';
import DOMPurify from 'dompurify';
import { DOCX_PURIFY_CONFIG } from '../../utils/docx-purify-config';
import { DownloadFallback } from './DownloadFallback';

/**
 * DocxRenderer — renders .docx files inside the artifact preview modal.
 *
 * Rendering strategy:
 * 1. PRIMARY: docx-preview 0.3.7 — renders DOCX directly into DOM container with
 *    full formatting (fonts, colors, tables, images). Output isolated in an iframe
 *    to prevent style leakage into the Pilot Space UI.
 * 2. FALLBACK: mammoth.js — converts DOCX → HTML string. Output sanitized with
 *    DOCX_PURIFY_CONFIG (blocks javascript: hrefs via ALLOWED_URI_REGEXP) before
 *    rendering in a sandboxed iframe. Fallback is invisible to the user — no
 *    "using fallback" banner is shown.
 *
 * Security:
 * - mammoth performs NO sanitization. DOCX files can contain javascript: hrefs.
 *   DOCX_PURIFY_CONFIG with ALLOWED_URI_REGEXP blocks this XSS vector.
 * - mammoth is pinned >= 1.11.0 in package.json (CVE-2025-11849 mitigation).
 * - docx-preview output is isolated in a sandboxed iframe (style isolation).
 * - Never reuses HtmlRenderer's PURIFY_CONFIG — it forbids 'style' which would
 *   strip all DOCX formatting.
 *
 * Page breaks (DOCX-03):
 * - docx-preview renders page break elements with specific CSS markers.
 * - CSS injected via <style> in the iframe srcdoc targets page-break elements.
 * - mammoth fallback: continuous flow (page breaks not preserved — acceptable degradation).
 */

interface DocxRendererProps {
  content: ArrayBuffer;
  filename: string;
}

type RenderMode = 'docx-preview' | 'mammoth' | null;

/**
 * CSS injected into the docx-preview iframe to:
 * 1. Style page-break elements as visual horizontal dividers with "Page break" label
 * 2. Provide a clean scrollable container
 * 3. Scope docx-preview styles to avoid layout breaks
 */
const DOCX_PREVIEW_IFRAME_STYLES = `
  body {
    margin: 0;
    padding: 16px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #ffffff;
    color: #1a1a1a;
    box-sizing: border-box;
  }

  /* Page break visual indicator — targets docx-preview's page break rendering */
  [style*="page-break-before: always"],
  [style*="page-break-before:always"],
  [style*="page-break-after: always"],
  [style*="page-break-after:always"],
  .docx-page-break,
  hr.docx-page-break {
    display: block;
    border: none;
    border-top: 1px dashed #d1d5db;
    margin: 2rem 0;
    padding-top: 1rem;
    position: relative;
  }

  [style*="page-break-before: always"]::before,
  [style*="page-break-before:always"]::before,
  [style*="page-break-after: always"]::before,
  [style*="page-break-after:always"]::before,
  .docx-page-break::before,
  hr.docx-page-break::before {
    content: "Page break";
    display: block;
    position: absolute;
    top: -0.75rem;
    left: 50%;
    transform: translateX(-50%);
    background: #ffffff;
    padding: 0 0.5rem;
    font-size: 0.65rem;
    color: #9ca3af;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    pointer-events: none;
  }

  /* Ensure docx-preview container fills width */
  .docx-wrapper {
    width: 100%;
    max-width: 100%;
  }
`;

/**
 * CSS for mammoth fallback iframe — allows inline styles, ensures readable layout.
 */
const MAMMOTH_IFRAME_STYLES = `
  body {
    margin: 0;
    padding: 16px 24px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px;
    line-height: 1.6;
    background: #ffffff;
    color: #1a1a1a;
    box-sizing: border-box;
    max-width: 800px;
  }

  h1, h2, h3, h4, h5, h6 {
    margin-top: 1.5em;
    margin-bottom: 0.5em;
    line-height: 1.3;
  }

  p {
    margin: 0.5em 0;
  }

  table {
    border-collapse: collapse;
    width: 100%;
    margin: 1em 0;
    font-size: 0.9em;
  }

  th, td {
    border: 1px solid #e5e7eb;
    padding: 6px 12px;
    text-align: left;
  }

  th {
    background-color: #f9fafb;
    font-weight: 600;
  }

  img {
    max-width: 100%;
    height: auto;
  }

  a {
    color: #2563eb;
    text-decoration: underline;
  }
`;

export function DocxRenderer({ content, filename }: DocxRendererProps) {
  const [srcdoc, setSrcdoc] = React.useState<string | null>(null);
  const [renderMode, setRenderMode] = React.useState<RenderMode>(null);
  const [isRendering, setIsRendering] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!content || content.byteLength === 0) {
      setError('Empty or missing file content.');
      setIsRendering(false);
      return;
    }

    let cancelled = false;

    async function renderDocument() {
      setIsRendering(true);
      setError(null);

      // --- PRIMARY: docx-preview ---
      try {
        // Dynamically import docx-preview — references browser APIs, must be lazy
        const { renderAsync } = await import('docx-preview');

        // Render into a temporary off-screen div
        const tempContainer = document.createElement('div');
        tempContainer.style.position = 'absolute';
        tempContainer.style.visibility = 'hidden';
        tempContainer.style.pointerEvents = 'none';
        document.body.appendChild(tempContainer);

        try {
          await renderAsync(content, tempContainer, undefined, {
            inWrapper: true,
            ignoreLastRenderedPageBreak: false,
          });
        } finally {
          document.body.removeChild(tempContainer);
        }

        if (cancelled) return;

        // Extract the rendered HTML and inject it into a sandboxed iframe srcDoc
        const renderedHtml = tempContainer.innerHTML;

        const doc = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${DOCX_PREVIEW_IFRAME_STYLES}</style>
</head>
<body>${renderedHtml}</body>
</html>`;

        if (!cancelled) {
          setSrcdoc(doc);
          setRenderMode('docx-preview');
          setIsRendering(false);
        }
        return;
      } catch (docxPreviewError) {
        if (cancelled) return;
        // docx-preview failed — fall through to mammoth
        console.warn(
          '[DocxRenderer] docx-preview failed, falling back to mammoth:',
          docxPreviewError
        );
      }

      // --- FALLBACK: mammoth ---
      try {
        const mammoth = await import('mammoth');

        if (cancelled) return;

        const result = await mammoth.convertToHtml(
          { arrayBuffer: content },
          {
            // Override image converter to embed base64 images inline.
            // This keeps all document content self-contained in the iframe srcDoc.
            convertImage: mammoth.images.imgElement((image) => {
              return image.read('base64').then((b64) => ({
                src: `data:${image.contentType};base64,${b64}`,
              }));
            }),
          }
        );

        if (cancelled) return;

        // CRITICAL: Always sanitize mammoth output before DOM insertion.
        // mammoth performs NO sanitization. A crafted DOCX can contain
        // javascript: hrefs. DOCX_PURIFY_CONFIG blocks this via ALLOWED_URI_REGEXP.
        if (typeof window === 'undefined') {
          throw new Error('DOMPurify requires browser environment');
        }
        const sanitizeResult = DOMPurify.sanitize(result.value, DOCX_PURIFY_CONFIG);
        const sanitizedHtml =
          typeof sanitizeResult === 'string' ? sanitizeResult : String(sanitizeResult);

        const doc = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${MAMMOTH_IFRAME_STYLES}</style>
</head>
<body>${sanitizedHtml}</body>
</html>`;

        if (!cancelled) {
          setSrcdoc(doc);
          setRenderMode('mammoth');
          setIsRendering(false);
        }
      } catch (mammothError) {
        if (cancelled) return;
        console.error('[DocxRenderer] Both renderers failed:', mammothError);
        setError('Unable to render this document.');
        setIsRendering(false);
      }
    }

    renderDocument().catch((err: unknown) => {
      if (!cancelled) {
        console.error('[DocxRenderer] Unexpected render error:', err);
        setError('Unexpected error rendering document.');
        setIsRendering(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [content]);

  // Error state — both renderers failed
  if (error) {
    return <DownloadFallback filename={filename} signedUrl="" reason="error" />;
  }

  // Loading state
  if (isRendering || srcdoc === null) {
    return (
      <div
        className="flex items-center justify-center p-8"
        role="status"
        aria-label="Rendering document"
      >
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" data-render-mode={renderMode}>
      <iframe
        srcDoc={srcdoc}
        sandbox=""
        title={`Document preview: ${filename}`}
        className="w-full flex-1 border-0 min-h-[500px]"
        aria-label={`Preview of ${filename}`}
      />
    </div>
  );
}
