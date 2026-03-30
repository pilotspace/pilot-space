'use client';

/**
 * EditorLayout — 3-panel resizable IDE layout.
 *
 * Panels:
 * 1. Left: FileTree (defaultSize=20%, minSize=0, maxSize=30%, collapsible)
 * 2. Center: BreadcrumbBar (36px) + TabBar (36px, progressive) + Monaco (flex) + StatusBar (22px)
 * 3. Right: Placeholder for ChatView/SourceControl (defaultSize=0, collapsible, Plan 05)
 *
 * Features:
 * - ResizablePanelGroup from shadcn/ui wrapper for react-resizable-panels v4
 * - Dynamic Monaco import with ssr:false + Skeleton loading
 * - MonacoErrorBoundary wraps editor
 * - observer() safe here (no TipTap in this tree)
 * - useAutoSaveEditor: 2s debounce + Cmd+S flush via file-editor:request-save
 * - Mobile (<768px): read-only CodeRenderer fallback (no Monaco)
 * - Tablet (768-1023px): Monaco with minimap disabled
 * - beforeunload warning when dirty files
 * - CSS custom properties for IDE spacing
 * - Monaco pre-warm via requestIdleCallback
 *
 * Stripped from branch:
 * - usePluginLoader, usePluginEditorBridge, PluginSandbox, PluginSidebar
 * - ThemeStore references
 * - MonacoNoteEditor references
 * - useGitWebStore (placeholder for Plan 05)
 */

import { useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { observer } from 'mobx-react-lite';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import { useFileStore } from '@/stores/RootStore';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useAutoSaveEditor } from '../hooks/useAutoSaveEditor';
import { FileTree } from './FileTree';
import { TabBar } from './TabBar';
import { BreadcrumbBar } from './BreadcrumbBar';
import { StatusBar } from './StatusBar';
import { WelcomePane } from './WelcomePane';
import { MonacoErrorBoundary } from './ErrorBoundary';
import { apiClient } from '@/services/api/client';
import type { Artifact } from '@/types/artifact';

// ─── CSS Custom Properties ────────────────────────────────────────────────────
// These are injected inline on the layout root element:
// --spacing-ide-gutter: 8px
// --spacing-ide-item-y: 4px
// --filetree-item-height: 28px
// --tab-height: 36px
// --status-bar-height: 22px

// ─── Dynamic Imports ──────────────────────────────────────────────────────────

const MonacoFileEditor = dynamic(() => import('./MonacoFileEditor'), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

// CodeRenderer for mobile read-only fallback
const CodeRenderer = dynamic(
  () =>
    import('@/features/artifacts/components/renderers/CodeRenderer').then((m) => ({
      default: m.CodeRenderer,
    })),
  { ssr: false, loading: () => <Skeleton className="h-full w-full" /> }
);

// ─── Props ────────────────────────────────────────────────────────────────────

interface EditorLayoutProps {
  projectId: string;
  workspaceSlug?: string;
  workspaceId: string;
  artifacts: Artifact[];
  /** Initial file path to open on mount (from [...filePath] catch-all route). */
  initialFilePath?: string;
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const EditorLayout = observer(function EditorLayout({
  projectId,
  workspaceId,
  artifacts,
  initialFilePath,
  className,
}: EditorLayoutProps) {
  const fileStore = useFileStore();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const isTablet = useMediaQuery('(max-width: 1023px)');

  const [cursorLine] = useState(1);
  const [cursorCol] = useState(1);

  // ─── Save function ───────────────────────────────────────────────────────
  const saveFile = useCallback(
    async (fileId: string, content: string) => {
      await apiClient.put(
        `/workspaces/${workspaceId}/projects/${projectId}/artifacts/${fileId}/content`,
        content,
        { headers: { 'Content-Type': 'text/plain' } }
      );
    },
    [workspaceId, projectId]
  );

  // ─── Auto-save hook ──────────────────────────────────────────────────────
  const activeFileId = fileStore.activeFile?.id ?? null;
  const activeContent = fileStore.activeFile?.content ?? '';

  const { isSaving } = useAutoSaveEditor(
    activeFileId,
    activeContent,
    saveFile
  );

  // ─── Content change handler ──────────────────────────────────────────────
  const handleContentChange = useCallback(
    (value: string) => {
      if (!activeFileId) return;
      fileStore.updateContent(activeFileId, value);
      fileStore.markDirty(activeFileId);
    },
    [activeFileId, fileStore]
  );

  // ─── File select from tree ───────────────────────────────────────────────
  const handleFileSelect = useCallback(
    (artifact: Artifact) => {
      fileStore.openFile({
        id: artifact.id,
        name: artifact.filename,
        path: artifact.filename,
        language: 'plaintext',
        isDirty: false,
        content: null, // content loaded lazily
        lastAccessed: Date.now(),
      });

      // Load file content asynchronously
      void (async () => {
        try {
          const res = await apiClient.get<{ content: string; filename: string; content_type: string }>(
            `/workspaces/${workspaceId}/projects/${projectId}/artifacts/${artifact.id}/content`
          );
          fileStore.updateContent(artifact.id, res.content);
        } catch {
          // Content load failed — keep null, editor shows empty state
        }
      })();
    },
    [fileStore, workspaceId, projectId]
  );

  // ─── Auto-open initial file ──────────────────────────────────────────────
  useEffect(() => {
    if (!initialFilePath || artifacts.length === 0) return;
    const artifact = artifacts.find((a) => a.filename === initialFilePath);
    if (artifact) {
      handleFileSelect(artifact);
    }
  }, [initialFilePath, artifacts, handleFileSelect]);

  // ─── Monaco pre-warm ─────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => {
        void import('@monaco-editor/react');
      });
    } else {
      // Fallback for Safari (no requestIdleCallback)
      const timeout = setTimeout(() => {
        void import('@monaco-editor/react');
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, []);

  // ─── beforeunload guard for dirty files ──────────────────────────────────
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (fileStore.hasDirtyFiles) {
        e.preventDefault();
        // Modern browsers ignore custom message, just show generic dialog
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [fileStore]);

  const activeFile = fileStore.activeFile;

  // ─── Mobile fallback ─────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div
        className="flex h-full flex-col"
        style={{
          // CSS custom properties for IDE spacing
          ['--spacing-ide-gutter' as string]: '8px',
          ['--spacing-ide-item-y' as string]: '4px',
          ['--filetree-item-height' as string]: '28px',
          ['--tab-height' as string]: '36px',
          ['--status-bar-height' as string]: '22px',
        }}
      >
        <div className="flex items-center justify-center h-16 border-b border-border px-4">
          <p className="text-sm text-muted-foreground text-center">
            Code editor is not available on mobile.
            <br />
            Visit on desktop for the full IDE experience.
          </p>
        </div>
        {activeFile && activeFile.content !== null && (
          <div className="flex-1 overflow-auto p-4">
            <CodeRenderer content={activeFile.content} language={activeFile.language} />
          </div>
        )}
      </div>
    );
  }

  // ─── Desktop / Tablet layout ──────────────────────────────────────────────
  return (
    <div
      className={`flex h-full flex-col ${className ?? ''}`}
      style={{
        ['--spacing-ide-gutter' as string]: '8px',
        ['--spacing-ide-item-y' as string]: '4px',
        ['--filetree-item-height' as string]: '28px',
        ['--tab-height' as string]: '36px',
        ['--status-bar-height' as string]: '22px',
      }}
    >
      <ResizablePanelGroup orientation="horizontal" className="flex-1">
        {/* ── Left: FileTree ─────────────────────────────────────────── */}
        <ResizablePanel
          defaultSize={isTablet ? 0 : 20}
          minSize={0}
          maxSize={30}
          collapsible
        >
          <FileTree
            artifacts={artifacts}
            onFileSelect={handleFileSelect}
            projectId={projectId}
            className="h-full"
          />
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* ── Center: Editor ──────────────────────────────────────────── */}
        <ResizablePanel defaultSize={isTablet ? 100 : 80} minSize={40}>
          <div className="flex h-full flex-col">
            {/* Breadcrumb bar — hidden on mobile via CSS in BreadcrumbBar */}
            <BreadcrumbBar />

            {/* Tab bar — progressive disclosure (null when empty) */}
            <TabBar />

            {/* Editor content */}
            <div className="relative flex-1 overflow-hidden">
              {activeFile ? (
                <MonacoErrorBoundary>
                  {activeFile.content !== null ? (
                    <MonacoFileEditor
                      fileId={activeFile.id}
                      content={activeFile.content}
                      language={activeFile.language}
                      onChange={handleContentChange}
                      onSave={() => {
                        window.dispatchEvent(new CustomEvent('file-editor:request-save'));
                      }}
                    />
                  ) : (
                    // Content loading skeleton
                    <Skeleton className="h-full w-full" />
                  )}
                </MonacoErrorBoundary>
              ) : (
                <WelcomePane />
              )}
            </div>

            {/* Status bar — 22px */}
            <StatusBar
              line={cursorLine}
              col={cursorCol}
              isSaving={isSaving}
            />
          </div>
        </ResizablePanel>

        {/* ── Right: ChatView/SourceControl placeholder (Plan 05) ──── */}
        <ResizablePanel defaultSize={0} minSize={0} maxSize={35} collapsible>
          {/* Right panel wired in Plan 05 — empty for now */}
          <div className="h-full bg-muted/20" />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
});
