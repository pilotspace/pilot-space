/**
 * useRevertShortcut — Phase 89 Plan 06.
 *
 * Global ⌘Z / Ctrl+Z shortcut that reverts the most-recently-applied
 * proposal IF all of these hold:
 *   1. At least one proposal has `status === 'applied'`.
 *   2. Its `decidedAt` is within the 10-minute client-side window.
 *      (The server window is authoritative per D-89-05-03; the client
 *      check just prevents wasted 409s.)
 *   3. The event target is NOT inside an editor surface
 *      (textarea, input, or contenteditable). That preserves native
 *      undo in TipTap, Monaco, and every chat input.
 *   4. Shift is NOT held — Shift+⌘Z is the browser's native "redo"
 *      shortcut and must not be hijacked.
 *
 * Mount at ChatView top-level; runs once while ChatView is mounted.
 */
'use client';

import { useEffect } from 'react';
import { useProposalsStore } from '@/stores/RootStore';
import { useRevertProposal } from '@/features/ai/proposals/useProposalActions';

const REVERT_WINDOW_MS = 10 * 60 * 1000;

function isEditorTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'INPUT') return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useRevertShortcut(): void {
  const proposalsStore = useProposalsStore();
  const revert = useRevertProposal();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      // Plain ⌘Z / Ctrl+Z only — NEVER Shift+⌘Z (native redo).
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key !== 'z' && e.key !== 'Z') return;
      if (e.shiftKey) return;

      // Don't hijack editor undo.
      if (isEditorTarget(e.target)) return;

      // Find the most-recent APPLIED proposal inside the 10-min window.
      let target: { id: string; decidedAtMs: number } | null = null;
      const nowMs = Date.now();
      for (const p of proposalsStore.proposals.values()) {
        if (p.status !== 'applied') continue;
        if (!p.decidedAt) continue;
        const decidedAtMs = new Date(p.decidedAt).getTime();
        if (nowMs - decidedAtMs > REVERT_WINDOW_MS) continue;
        if (!target || decidedAtMs > target.decidedAtMs) {
          target = { id: p.id, decidedAtMs };
        }
      }

      if (!target) return;

      e.preventDefault();
      revert.mutate(target.id);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [proposalsStore, revert]);
}
