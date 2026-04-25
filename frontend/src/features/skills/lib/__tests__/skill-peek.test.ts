/**
 * skill-peek — encode/decode round-trip + edge-case validation.
 *
 * Covers T-91-16 (malformed input → null), T-91-19 (special-char round-trip),
 * plus the shape contract enforced by useArtifactPeekState.
 */
import { describe, it, expect } from 'vitest';
import {
  encodeSkillFilePeek,
  decodeSkillFilePeek,
  SKILL_FILE_PEEK_PREFIX,
} from '../skill-peek';

describe('skill-peek encoding', () => {
  it('exports the canonical prefix constant', () => {
    expect(SKILL_FILE_PEEK_PREFIX).toBe('skill-file:');
  });

  it('round-trips a simple slug + single-segment path', () => {
    const enc = encodeSkillFilePeek('ai-context', 'architecture.md');
    expect(enc).toBe('skill-file:ai-context/architecture.md');
    expect(decodeSkillFilePeek(enc)).toEqual({
      slug: 'ai-context',
      path: 'architecture.md',
    });
  });

  it('round-trips a nested multi-segment path', () => {
    const enc = encodeSkillFilePeek('foo', 'sub/nested/bar.py');
    expect(enc).toBe('skill-file:foo/sub/nested/bar.py');
    expect(decodeSkillFilePeek(enc)).toEqual({
      slug: 'foo',
      path: 'sub/nested/bar.py',
    });
  });

  it('encodes special URL characters in path segments', () => {
    const enc = encodeSkillFilePeek('s', 'a b/c?d#e.md');
    // Spaces → %20, '?' → %3F, '#' → %23. Slash separators preserved.
    expect(enc).toBe('skill-file:s/a%20b/c%3Fd%23e.md');
    expect(decodeSkillFilePeek(enc)).toEqual({ slug: 's', path: 'a b/c?d#e.md' });
  });

  it('encodes special characters in the slug', () => {
    const enc = encodeSkillFilePeek('a b', 'x.md');
    expect(enc).toBe('skill-file:a%20b/x.md');
    expect(decodeSkillFilePeek(enc)).toEqual({ slug: 'a b', path: 'x.md' });
  });

  it('returns null for null/undefined/empty input', () => {
    expect(decodeSkillFilePeek(null)).toBeNull();
    expect(decodeSkillFilePeek(undefined)).toBeNull();
    expect(decodeSkillFilePeek('')).toBeNull();
  });

  it('returns null when prefix is missing', () => {
    expect(decodeSkillFilePeek('plain-id')).toBeNull();
    expect(decodeSkillFilePeek('NOTE:n123')).toBeNull();
    expect(decodeSkillFilePeek('skillfile:foo/bar')).toBeNull();
  });

  it('returns null when payload has no slash (slug only)', () => {
    expect(decodeSkillFilePeek('skill-file:onlyslug')).toBeNull();
  });

  it('returns null when slug is empty (leading slash)', () => {
    expect(decodeSkillFilePeek('skill-file:/path.md')).toBeNull();
  });

  it('returns null when path is empty (trailing slash)', () => {
    expect(decodeSkillFilePeek('skill-file:slug/')).toBeNull();
  });

  it('returns null on malformed percent-encoding', () => {
    // %ZZ is not a valid hex escape — decodeURIComponent throws.
    expect(decodeSkillFilePeek('skill-file:slug/%ZZ.md')).toBeNull();
  });

  it('preserves case in slug and path', () => {
    const enc = encodeSkillFilePeek('AI-Context', 'Docs/README.md');
    expect(decodeSkillFilePeek(enc)).toEqual({
      slug: 'AI-Context',
      path: 'Docs/README.md',
    });
  });
});
