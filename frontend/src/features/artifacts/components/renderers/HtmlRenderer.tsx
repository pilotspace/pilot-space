'use client';

import * as React from 'react';
import DOMPurify from 'dompurify';
import { CodeRenderer } from './CodeRenderer';

/**
 * Sandbox attributes for the HTML preview iframe.
 * NEVER include 'allow-scripts' — prevents XSS via JavaScript execution.
 * 'allow-same-origin' is required for CSS to resolve relative URLs.
 */
const SANDBOX_ATTRS = 'allow-same-origin';

/**
 * DOMPurify config for HTML preview sanitization.
 * Forbids executable tags. Use html profile only (no SVG extras needed here).
 */
const PURIFY_CONFIG = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ['script', 'object', 'embed'] as string[],
};

interface HtmlRendererProps {
  content: string;
  filename: string;
}

/**
 * HtmlRenderer — sandboxed iframe preview + source code toggle.
 *
 * Defaults to 'source' mode (safe-by-default posture).
 * Preview mode renders HTML in a sandboxed iframe with DOMPurify sanitization.
 * No JavaScript execution is possible in preview mode (sandbox lacks allow-scripts).
 */
export function HtmlRenderer({ content, filename }: HtmlRendererProps) {
  const [viewMode, setViewMode] = React.useState<'preview' | 'source'>('source');

  const sanitizedHtml = React.useMemo(() => {
    if (typeof window === 'undefined') return '';
    return DOMPurify.sanitize(content, PURIFY_CONFIG) as string;
  }, [content]);

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="HTML view mode"
        className="flex items-center gap-1 px-3 py-2 border-b border-border shrink-0"
      >
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === 'source'}
          onClick={() => setViewMode('source')}
          className={
            'px-3 py-1.5 text-xs rounded-md transition-colors ' +
            (viewMode === 'source'
              ? 'bg-muted text-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground')
          }
        >
          Source
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === 'preview'}
          onClick={() => setViewMode('preview')}
          className={
            'px-3 py-1.5 text-xs rounded-md transition-colors ' +
            (viewMode === 'preview'
              ? 'bg-muted text-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground')
          }
        >
          Preview
        </button>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-auto min-h-0">
        {viewMode === 'preview' ? (
          <iframe
            srcDoc={sanitizedHtml}
            sandbox={SANDBOX_ATTRS}
            title={`HTML preview: ${filename}`}
            className="w-full h-full border-0 min-h-[400px]"
          />
        ) : (
          <CodeRenderer content={content} language="html" />
        )}
      </div>
    </div>
  );
}
