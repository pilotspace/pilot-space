/**
 * Pure prefix helpers for the v3 command palette (Plan 90-03).
 *
 * Single source of truth for the prefix → mode → scope → placeholder
 * pipeline. No React, no MobX, no DOM — keep it boring so it stays
 * testable and reusable.
 *
 * Prefix semantics (UI-SPEC Surface 3 — Interaction Contract):
 *   #  → tasks    (#stale → search Tasks)
 *   @  → people   (@alex  → find member)
 *   /  → pages    (/settings → navigate)
 *   >  → commands (>open new note)
 *
 * Replaces v1/v2 detectMode + effectiveQuery (which also handled `:`
 * goto-line and `#` symbols — both removed in v3).
 */
import type { PaletteScope, PalettePrefixMode } from '@/stores/UIStore';

/**
 * Detect a prefix-driven mode from the leading character of the input.
 *
 * Returns null if the input is empty or starts with anything other than
 * the four documented prefix characters. The leading character is the
 * SOLE signal — whitespace before the prefix is intentionally NOT
 * consumed because users committing to a prefix mode type the prefix
 * first character without leading spaces.
 */
export function detectPrefixMode(input: string): PalettePrefixMode {
  if (!input) return null;
  switch (input[0]) {
    case '#':
      return 'tasks';
    case '@':
      return 'people';
    case '/':
      return 'pages';
    case '>':
      return 'commands';
    default:
      return null;
  }
}

/**
 * Strip the active prefix from the input. When no prefix is active, the
 * input is returned untouched. Leading whitespace AFTER the prefix is
 * trimmed so callers can pass the result straight to `notesApi.list`
 * et al. as `search` text.
 */
export function consumePrefix(input: string): string {
  if (detectPrefixMode(input) === null) return input;
  return input.slice(1).trimStart();
}

/**
 * Map a prefix mode to the scope tab that should be auto-selected.
 *
 * `pages` and `commands` map to 'all' because pages live in the
 * navigation results group and commands render as a distinct group
 * also under 'all'. `tasks` and `people` map 1:1 to their dedicated
 * scope tabs.
 */
export function scopeForPrefix(mode: PalettePrefixMode): PaletteScope {
  switch (mode) {
    case 'tasks':
      return 'tasks';
    case 'people':
      return 'people';
    case 'pages':
      return 'all';
    case 'commands':
      return 'all';
    default:
      return 'all';
  }
}

/**
 * Inline ghost completion. Returns the suffix of `candidate` that
 * extends `query` when the candidate prefix-matches the query
 * (case-insensitive). Returns '' when there is no match, when the
 * query is empty, or when no candidate is provided.
 *
 * Pure: no DOM, no innerHTML — caller renders the result as a React
 * text node only (T-90-07 mitigation).
 */
export function ghostCompletion(query: string, candidate: string | undefined): string {
  if (!candidate) return '';
  if (query.length === 0) return '';
  if (candidate.toLowerCase().startsWith(query.toLowerCase())) {
    return candidate.slice(query.length);
  }
  return '';
}

/**
 * Placeholder text shown in the CommandInput. The default copy comes
 * from UI-SPEC Copywriting Contract; per-prefix copy makes the active
 * mode discoverable without an extra hint row.
 */
export function placeholderForPrefix(mode: PalettePrefixMode): string {
  switch (mode) {
    case 'tasks':
      return 'Find tasks…';
    case 'people':
      return 'Find people…';
    case 'pages':
      return 'Go to page…';
    case 'commands':
      return 'Run command…';
    default:
      return 'Search chats, tasks, topics, specs, people…';
  }
}
