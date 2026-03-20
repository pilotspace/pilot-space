/**
 * Build-time docs content manifest.
 *
 * Imports all markdown content files as raw strings so they are available
 * in both standalone (SSR) and static export (Tauri) builds without
 * requiring fs.readFileSync at runtime.
 *
 * The webpack `asset/source` rule in next.config.ts makes these imports work.
 */

// Raw string imports — bundled at build time by webpack
import overviewContent from '../content/overview.md';
import gettingStartedContent from '../content/getting-started.md';
import architectureContent from '../content/architecture.md';
import aiAgentContent from '../content/ai-agent.md';
import noteFirstContent from '../content/note-first.md';
import apiReferenceContent from '../content/api-reference.md';

/** Map of doc file slug to raw markdown content string */
export const docsManifest: Record<string, string> = {
  overview: overviewContent,
  'getting-started': gettingStartedContent,
  architecture: architectureContent,
  'ai-agent': aiAgentContent,
  'note-first': noteFirstContent,
  'api-reference': apiReferenceContent,
};
