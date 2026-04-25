/**
 * artifact-tokens tests — Phase 91 Plan 03 Task 1.
 *
 * Validates that ARTIFACT_TYPE_TOKENS includes a SKILL entry with the brand-
 * violet accent and that the badge text/background pair clears WCAG AA on the
 * effective surface (12% violet over white card body).
 */
import { describe, it, expect } from 'vitest';
import { ARTIFACT_TYPE_TOKENS, isArtifactTokenKey } from '../artifact-tokens';

// Minimal WCAG AA contrast helper — inlined here to avoid depending on a util
// that doesn't exist. Returns the contrast ratio between two sRGB colors.
type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  let h = hex.replace('#', '');
  if (h.length === 3) {
    h = h.split('').map((c) => c + c).join('');
  }
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return [r, g, b];
}

function relativeLuminance([r, g, b]: RGB): number {
  const ch = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

function alphaOver(fg: RGB, alpha: number, bg: RGB): RGB {
  return [
    fg[0] * alpha + bg[0] * (1 - alpha),
    fg[1] * alpha + bg[1] * (1 - alpha),
    fg[2] * alpha + bg[2] * (1 - alpha),
  ];
}

function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

describe('SKILL token (Phase 91)', () => {
  it('exists with tier=1 and brand-violet accent', () => {
    expect(ARTIFACT_TYPE_TOKENS.SKILL).toEqual({
      tier: 1,
      gStart: '#f5f3ff',
      gEnd: '#ffffff',
      accent: '#7c5cff',
      badgeBg: 'rgba(124,92,255,0.12)',
      badgeText: '#5a3df0',
    });
  });

  it('is enumerated by isArtifactTokenKey', () => {
    expect(isArtifactTokenKey('SKILL')).toBe(true);
  });

  it('badge text/bg pair clears WCAG AA on white card body (4.5:1)', () => {
    // The badge background is rgba(124,92,255,0.12) which composes over the
    // white card body (#ffffff). Compute the effective surface and verify
    // contrast vs. badgeText.
    const violetFg = hexToRgb('#7c5cff');
    const white: RGB = [1, 1, 1];
    const effectiveBg = alphaOver(violetFg, 0.12, white);
    const badgeText = hexToRgb('#5a3df0');
    const ratio = contrastRatio(badgeText, effectiveBg);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('SKILL key is present in ARTIFACT_TYPE_TOKENS Object.keys', () => {
    expect(Object.keys(ARTIFACT_TYPE_TOKENS)).toContain('SKILL');
  });
});
