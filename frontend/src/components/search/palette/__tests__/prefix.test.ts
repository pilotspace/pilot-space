/**
 * Pure tests for the palette prefix helpers (Plan 90-03 Task 1).
 *
 * These functions are the single source of truth for the v3 palette's
 * prefix → mode → scope → placeholder pipeline.
 */
import { describe, it, expect } from 'vitest';

import {
  detectPrefixMode,
  consumePrefix,
  scopeForPrefix,
  ghostCompletion,
  placeholderForPrefix,
} from '../prefix';

describe('detectPrefixMode', () => {
  it("returns 'tasks' for '#' prefix", () => {
    expect(detectPrefixMode('#foo')).toBe('tasks');
  });
  it("returns 'people' for '@' prefix", () => {
    expect(detectPrefixMode('@user')).toBe('people');
  });
  it("returns 'pages' for '/' prefix", () => {
    expect(detectPrefixMode('/settings')).toBe('pages');
  });
  it("returns 'commands' for '>' prefix", () => {
    expect(detectPrefixMode('>open')).toBe('commands');
  });
  it('returns null for plain text', () => {
    expect(detectPrefixMode('hello')).toBe(null);
  });
  it('returns null for empty string', () => {
    expect(detectPrefixMode('')).toBe(null);
  });
});

describe('consumePrefix', () => {
  it("strips '#' and trims left", () => {
    expect(consumePrefix('#foo')).toBe('foo');
  });
  it("strips '@' for people", () => {
    expect(consumePrefix('@user')).toBe('user');
  });
  it("strips '/' and leading whitespace", () => {
    expect(consumePrefix('/ page')).toBe('page');
  });
  it("strips '>' for commands", () => {
    expect(consumePrefix('>open-x')).toBe('open-x');
  });
  it('returns plain text unchanged', () => {
    expect(consumePrefix('hello')).toBe('hello');
  });
  it('returns empty string unchanged', () => {
    expect(consumePrefix('')).toBe('');
  });
});

describe('scopeForPrefix', () => {
  it("maps 'tasks' → 'tasks'", () => {
    expect(scopeForPrefix('tasks')).toBe('tasks');
  });
  it("maps 'people' → 'people'", () => {
    expect(scopeForPrefix('people')).toBe('people');
  });
  it("maps 'pages' → 'all'", () => {
    expect(scopeForPrefix('pages')).toBe('all');
  });
  it("maps 'commands' → 'all'", () => {
    expect(scopeForPrefix('commands')).toBe('all');
  });
  it("maps null → 'all'", () => {
    expect(scopeForPrefix(null)).toBe('all');
  });
});

describe('ghostCompletion', () => {
  it('returns suffix when candidate prefix-matches query', () => {
    expect(ghostCompletion('st', 'stale')).toBe('ale');
  });
  it('returns empty string when query is empty', () => {
    expect(ghostCompletion('', 'stale')).toBe('');
  });
  it('returns empty string when candidate does not start with query', () => {
    expect(ghostCompletion('zzz', 'stale')).toBe('');
  });
  it('returns empty string when candidate is undefined', () => {
    expect(ghostCompletion('st', undefined)).toBe('');
  });
  it('matches case-insensitively', () => {
    expect(ghostCompletion('ST', 'stale')).toBe('ale');
  });
  it('returns empty string when query equals candidate', () => {
    expect(ghostCompletion('stale', 'stale')).toBe('');
  });
});

describe('placeholderForPrefix', () => {
  it('returns the default placeholder for null', () => {
    expect(placeholderForPrefix(null)).toBe('Search chats, tasks, topics, specs, people…');
  });
  it("returns 'Find tasks…' for tasks", () => {
    expect(placeholderForPrefix('tasks')).toBe('Find tasks…');
  });
  it("returns 'Find people…' for people", () => {
    expect(placeholderForPrefix('people')).toBe('Find people…');
  });
  it("returns 'Go to page…' for pages", () => {
    expect(placeholderForPrefix('pages')).toBe('Go to page…');
  });
  it("returns 'Run command…' for commands", () => {
    expect(placeholderForPrefix('commands')).toBe('Run command…');
  });
});
