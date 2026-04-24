/**
 * Shared types for the chat composer (ChatInput).
 *
 * Phase 87 Plan 01 — introduces the ChatMode union that travels with every
 * SSE submit and gates frontend tool permissions per DD-003.
 *
 * @module features/ai/ChatView/ChatInput/types
 */

/**
 * Conversation mode chosen by the user in the ModeSelector chip group.
 *
 * - `plan`     — agent proposes only; mutating tool calls are rejected client-side.
 * - `act`      — full DD-003 destructive approval flow active (existing ApprovalOverlay).
 * - `research` — read-only tool subset; mutating requests are blocked.
 * - `draft`    — ephemeral; messages flagged `persist: false` and skipped in cache.
 */
export type ChatMode = 'plan' | 'act' | 'research' | 'draft';

/** Ordered list of modes for keyboard cycling and rendering. Plan is the default. */
export const CHAT_MODES: readonly ChatMode[] = ['plan', 'act', 'research', 'draft'] as const;

/** Default mode for new sessions (per CONTEXT.md "Mode selector + permissions"). */
export const DEFAULT_CHAT_MODE: ChatMode = 'plan';
