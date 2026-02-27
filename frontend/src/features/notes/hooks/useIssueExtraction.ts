/**
 * useIssueExtraction - Hook for managing the issue extraction SSE stream.
 *
 * Connects to the extraction SSE endpoint, collects extracted issues,
 * and auto-creates them on completion (auto-approve, DD-003 non-destructive).
 *
 * Feature 009: Intent-to-Issues extraction pipeline.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { SSEClient } from '@/lib/sse-client';
import type { SSEEvent } from '@/lib/sse-client';
import { aiApi } from '@/services/api/ai';
import type { ExtractedIssue } from '../components/ExtractionPreviewModal';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1';

interface ExtractionState {
  /** Extracted issues collected from SSE events */
  issues: ExtractedIssue[];
  /** Whether extraction is in progress */
  isExtracting: boolean;
  /** Error message if extraction failed */
  error: string | null;
  /** Whether the preview modal is open (always false — auto-approve mode) */
  isModalOpen: boolean;
}

interface ExtractionActions {
  /** Start extraction for a note */
  startExtraction: (params: StartExtractionParams) => void;
  /** Close the modal and reset state */
  closeModal: () => void;
  /** Abort in-progress extraction */
  abort: () => void;
}

interface StartExtractionParams {
  noteId: string;
  noteTitle: string;
  noteContent: Record<string, unknown>;
  workspaceId: string;
  selectedText?: string;
  availableLabels?: string[];
  maxIssues?: number;
  /** Project to assign auto-created issues to */
  projectId?: string | null;
  /** Called after auto-creation with created issue IDs */
  onCreated?: (createdIds: string[]) => void;
}

/**
 * Hook for managing issue extraction from note content via SSE streaming.
 *
 * Auto-approve flow (DD-003 non-destructive):
 * 1. startExtraction() → starts SSE stream
 * 2. Issues arrive via SSE → added to issues array
 * 3. complete event → auto-create all issues, show toast
 */
export function useIssueExtraction(): [ExtractionState, ExtractionActions] {
  const [issues, setIssues] = useState<ExtractedIssue[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<SSEClient | null>(null);
  // Ref to collect issues during streaming (avoids stale closure in SSE callback)
  const collectedIssuesRef = useRef<ExtractedIssue[]>([]);

  // Cleanup on unmount: abort any in-progress SSE connection
  useEffect(() => {
    return () => {
      clientRef.current?.abort();
    };
  }, []);

  const abort = useCallback(() => {
    clientRef.current?.abort();
    clientRef.current = null;
    setIsExtracting(false);
  }, []);

  const closeModal = useCallback(() => {
    abort();
    setIssues([]);
    setError(null);
  }, [abort]);

  const startExtraction = useCallback(
    (params: StartExtractionParams) => {
      // Abort any existing extraction
      abort();

      // Reset state
      setIssues([]);
      setError(null);
      setIsExtracting(true);
      collectedIssuesRef.current = [];

      const url = `${API_BASE}/notes/${params.noteId}/extract-issues`;

      const client = new SSEClient({
        url,
        method: 'POST',
        body: {
          note_title: params.noteTitle,
          note_content: params.noteContent,
          selected_text: params.selectedText ?? null,
          available_labels: params.availableLabels?.slice(0, 50) ?? null,
          max_issues: params.maxIssues ?? 10,
        },
        headers: {
          'X-Workspace-ID': params.workspaceId,
        },
        onMessage: (event: SSEEvent) => {
          switch (event.type) {
            case 'issue': {
              const data = event.data as ExtractedIssue;
              collectedIssuesRef.current.push(data);
              setIssues((prev) => [...prev, data]);
              break;
            }
            case 'complete': {
              setIsExtracting(false);

              const collected = collectedIssuesRef.current;
              if (collected.length === 0) {
                toast.info('No actionable issues found in this note.');
                return;
              }

              if (!params.projectId) {
                toast.warning(
                  `${collected.length} issue${collected.length !== 1 ? 's' : ''} found`,
                  { description: 'Open a project note to auto-create issues.' }
                );
                return;
              }

              // Auto-create all extracted issues (DD-003 non-destructive)
              const issuesToCreate = collected.map((i) => ({
                title: i.title,
                description: i.description || null,
                priority: i.priority,
                source_block_id: i.sourceBlockIds[0] ?? null,
              }));

              aiApi
                .createExtractedIssues(
                  params.workspaceId,
                  params.noteId,
                  issuesToCreate,
                  params.projectId
                )
                .then((result) => {
                  const count = result.created_issues.length;
                  params.onCreated?.(result.created_issues);
                  toast.success(`${count} issue${count !== 1 ? 's' : ''} created`, {
                    description: 'View them in the Issues board.',
                  });
                })
                .catch((err: Error) => {
                  toast.error('Failed to create issues', { description: err.message });
                });

              break;
            }
            case 'error': {
              const errData = event.data as { code?: string; message?: string };
              setError(errData.message ?? 'Extraction failed');
              setIsExtracting(false);
              break;
            }
            case 'progress': {
              // Progress events are informational only
              break;
            }
          }
        },
        onError: (err: Error) => {
          setError(err.message);
          setIsExtracting(false);
        },
        onComplete: () => {
          setIsExtracting(false);
        },
        maxRetries: 0, // No retries for POST extraction
      });

      clientRef.current = client;
      client.connect();
    },
    [abort]
  );

  return [
    { issues, isExtracting, error, isModalOpen: false },
    { startExtraction, closeModal, abort },
  ];
}
