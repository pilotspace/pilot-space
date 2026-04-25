/**
 * resolveLucideIcon tests — Phase 91 Plan 03 Task 1.
 */
import { describe, it, expect } from 'vitest';
import { Sparkles, ListTodo, BookOpen, Hammer } from 'lucide-react';
import { resolveLucideIcon } from '../skill-icon';

describe('resolveLucideIcon', () => {
  it('returns Sparkles when name is undefined', () => {
    expect(resolveLucideIcon(undefined)).toBe(Sparkles);
  });

  it('returns Sparkles when name is empty string', () => {
    expect(resolveLucideIcon('')).toBe(Sparkles);
  });

  it('returns Sparkles when name is unknown', () => {
    expect(resolveLucideIcon('TotallyMadeUp')).toBe(Sparkles);
  });

  it('returns the requested icon when the name is known (ListTodo)', () => {
    expect(resolveLucideIcon('ListTodo')).toBe(ListTodo);
  });

  it('returns the requested icon when the name is known (BookOpen)', () => {
    expect(resolveLucideIcon('BookOpen')).toBe(BookOpen);
  });

  it('returns the requested icon when the name is known (Hammer)', () => {
    expect(resolveLucideIcon('Hammer')).toBe(Hammer);
  });

  it('honors a custom fallback when name is unknown', () => {
    expect(resolveLucideIcon('Unknown', ListTodo)).toBe(ListTodo);
  });

  it('honors a custom fallback when name is undefined', () => {
    expect(resolveLucideIcon(undefined, ListTodo)).toBe(ListTodo);
  });
});
