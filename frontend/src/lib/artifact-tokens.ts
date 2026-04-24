/**
 * Artifact type-color tokens — single source of truth.
 *
 * Accent colors mirror `.planning/design.md` Artifact Type Colors.
 * badgeBg uses 12-14% alpha for WCAG AA contrast with badgeText.
 *
 * See `.planning/phases/85-unified-artifact-card-anatomy/85-UI-SPEC.md` §2.
 */

export const ARTIFACT_TYPE_TOKENS = {
  // Tier 1 — native artifacts
  NOTE: {
    tier: 1,
    gStart: '#f0fdf4',
    gEnd: '#dcfce7',
    accent: '#29a386',
    badgeBg: 'rgba(41,163,134,0.12)',
    badgeText: '#1d7a63',
  },
  ISSUE: {
    tier: 1,
    gStart: '#eff6ff',
    gEnd: '#dbeafe',
    accent: '#3b82f6',
    badgeBg: 'rgba(59,130,246,0.12)',
    badgeText: '#1e40af',
  },
  SPEC: {
    tier: 1,
    gStart: '#faf5ff',
    gEnd: '#f3e8ff',
    accent: '#8b5cf6',
    badgeBg: 'rgba(139,92,246,0.12)',
    badgeText: '#5b21b6',
  },
  DECISION: {
    tier: 1,
    gStart: '#fffbeb',
    gEnd: '#fef3c7',
    accent: '#d9853f',
    badgeBg: 'rgba(217,133,63,0.14)',
    badgeText: '#92400e',
  },
  // Tier 2 — file artifacts
  MD: {
    tier: 2,
    gStart: '#f0fdf4',
    gEnd: '#dcfce7',
    accent: '#29a386',
    badgeBg: 'rgba(41,163,134,0.12)',
    badgeText: '#1d7a63',
  },
  HTML: {
    tier: 2,
    gStart: '#fff7ed',
    gEnd: '#ffedd5',
    accent: '#e67e22',
    badgeBg: 'rgba(230,126,34,0.14)',
    badgeText: '#9a3412',
  },
  CODE: {
    tier: 2,
    gStart: '#f1f5f9',
    gEnd: '#e2e8f0',
    accent: '#1a1a2e',
    badgeBg: 'rgba(26,26,46,0.10)',
    badgeText: '#1a1a2e',
  },
  PDF: {
    tier: 2,
    gStart: '#fef2f2',
    gEnd: '#fee2e2',
    accent: '#d9534f',
    badgeBg: 'rgba(217,83,79,0.14)',
    badgeText: '#991b1b',
  },
  CSV: {
    tier: 2,
    gStart: '#ecfdf5',
    gEnd: '#d1fae5',
    accent: '#059669',
    badgeBg: 'rgba(5,150,105,0.14)',
    badgeText: '#064e3b',
  },
  IMG: {
    tier: 2,
    gStart: '#fdf2f8',
    gEnd: '#fce7f3',
    accent: '#db2777',
    badgeBg: 'rgba(219,39,119,0.14)',
    badgeText: '#9d174d',
  },
  PPTX: {
    tier: 2,
    gStart: '#fff1f2',
    gEnd: '#ffe4e6',
    accent: '#be123c',
    badgeBg: 'rgba(190,18,60,0.14)',
    badgeText: '#881337',
  },
  LINK: {
    tier: 2,
    gStart: '#f5f3ff',
    gEnd: '#ede9fe',
    accent: '#7c3aed',
    badgeBg: 'rgba(124,58,237,0.14)',
    badgeText: '#5b21b6',
  },
} as const;

export type ArtifactTokenKey = keyof typeof ARTIFACT_TYPE_TOKENS;
export type ArtifactTokens = (typeof ARTIFACT_TYPE_TOKENS)[ArtifactTokenKey];

/** Returns the token object for a given artifact type. */
export function artifactTokens(type: ArtifactTokenKey): ArtifactTokens {
  return ARTIFACT_TYPE_TOKENS[type];
}

/** Runtime type guard for API-sourced string values. */
export function isArtifactTokenKey(key: string): key is ArtifactTokenKey {
  return Object.prototype.hasOwnProperty.call(ARTIFACT_TYPE_TOKENS, key);
}
