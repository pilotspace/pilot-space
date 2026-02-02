/**
 * Unit tests for getTagColor utility in InlineNoteHeader.
 *
 * Validates deterministic color mapping for known tags,
 * case insensitivity, and hash-based fallback for unknown tags.
 *
 * @module components/editor/__tests__/InlineNoteHeader.test
 */
import { describe, it, expect } from 'vitest';
import { getTagColor } from '../InlineNoteHeader';

describe('getTagColor', () => {
  it('test_known_primary_tag — "AI Features" returns primary colors', () => {
    const color = getTagColor('AI Features');
    expect(color).toEqual({ bg: 'bg-primary', text: 'text-primary-foreground' });
  });

  it('test_known_ai_tag — "Product" returns ai colors', () => {
    const color = getTagColor('Product');
    expect(color).toEqual({ bg: 'bg-ai', text: 'text-ai-foreground' });
  });

  it('test_known_foreground_tag — "Architecture" returns foreground colors', () => {
    const color = getTagColor('Architecture');
    expect(color).toEqual({ bg: 'bg-foreground', text: 'text-background' });
  });

  it('test_unknown_tag_fallback — unknown tag returns a valid fallback color', () => {
    const color = getTagColor('unknown-tag');
    const validBgValues = ['bg-primary', 'bg-ai', 'bg-foreground'];
    const validTextValues = ['text-primary-foreground', 'text-ai-foreground', 'text-background'];

    expect(validBgValues).toContain(color.bg);
    expect(validTextValues).toContain(color.text);
  });

  it('test_case_insensitivity — lowercase matches uppercase', () => {
    const lower = getTagColor('ai features');
    const upper = getTagColor('AI Features');
    const mixed = getTagColor('Ai Features');

    expect(lower).toEqual(upper);
    expect(lower).toEqual(mixed);
  });

  it('test_deterministic_fallback — same unknown tag always returns same color', () => {
    const first = getTagColor('random-tag-xyz');
    const second = getTagColor('random-tag-xyz');

    expect(first).toEqual(second);
  });

  it('test_whitespace_trimming — tags with whitespace are trimmed', () => {
    const trimmed = getTagColor('  Product  ');
    const normal = getTagColor('Product');

    expect(trimmed).toEqual(normal);
  });

  it('test_all_known_primary_tags — ai, features map to primary', () => {
    expect(getTagColor('ai')).toEqual({ bg: 'bg-primary', text: 'text-primary-foreground' });
    expect(getTagColor('features')).toEqual({ bg: 'bg-primary', text: 'text-primary-foreground' });
  });

  it('test_all_known_ai_tags — design, ux map to ai colors', () => {
    expect(getTagColor('design')).toEqual({ bg: 'bg-ai', text: 'text-ai-foreground' });
    expect(getTagColor('ux')).toEqual({ bg: 'bg-ai', text: 'text-ai-foreground' });
  });

  it('test_all_known_foreground_tags — engineering, infrastructure map to foreground', () => {
    expect(getTagColor('engineering')).toEqual({ bg: 'bg-foreground', text: 'text-background' });
    expect(getTagColor('infrastructure')).toEqual({
      bg: 'bg-foreground',
      text: 'text-background',
    });
  });
});
