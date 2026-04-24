import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TextDiffBlock } from '../TextDiffBlock';
import type { TextDiffPayload } from '../types';

describe('TextDiffBlock', () => {
  it('renders JetBrains Mono 13/400 leading-1.5 per UI-SPEC §4.3', () => {
    const payload: TextDiffPayload = {
      kind: 'text',
      hunks: [{ op: 'equal', text: 'line' }],
    };
    const { getByTestId } = render(<TextDiffBlock payload={payload} />);
    const block = getByTestId('text-diff-block');
    expect(block).toHaveClass('font-mono', 'text-[13px]', 'leading-[1.5]');
  });

  it('renders delete hunks with red tokens + role=deletion', () => {
    const payload: TextDiffPayload = {
      kind: 'text',
      hunks: [{ op: 'delete', text: 'removed line' }],
    };
    render(<TextDiffBlock payload={payload} />);
    const del = screen.getByRole('deletion');
    expect(del).toHaveClass('bg-[#fecaca]', 'text-[#dc2626]');
    expect(del).toHaveTextContent('removed line');
    expect(del.getAttribute('aria-label')).toContain('Removed: removed line');
  });

  it('renders insert hunks with green tokens + role=insertion', () => {
    const payload: TextDiffPayload = {
      kind: 'text',
      hunks: [{ op: 'insert', text: 'added line' }],
    };
    render(<TextDiffBlock payload={payload} />);
    const ins = screen.getByRole('insertion');
    expect(ins).toHaveClass('bg-[#bbf7d0]', 'text-[#16a34a]');
    expect(ins).toHaveTextContent('added line');
    expect(ins.getAttribute('aria-label')).toContain('Added: added line');
  });

  it('renders mixed hunks in order', () => {
    const payload: TextDiffPayload = {
      kind: 'text',
      hunks: [
        { op: 'equal', text: 'prefix ' },
        { op: 'delete', text: 'red ' },
        { op: 'insert', text: 'green ' },
        { op: 'equal', text: 'suffix' },
      ],
    };
    render(<TextDiffBlock payload={payload} />);
    expect(screen.getByRole('deletion')).toHaveTextContent('red');
    expect(screen.getByRole('insertion')).toHaveTextContent('green');
  });

  it('splits multi-line hunks into one row per line', () => {
    const payload: TextDiffPayload = {
      kind: 'text',
      hunks: [{ op: 'delete', text: 'line a\nline b\n' }],
    };
    render(<TextDiffBlock payload={payload} />);
    const dels = screen.getAllByRole('deletion');
    expect(dels).toHaveLength(2);
    expect(dels[0]).toHaveTextContent('line a');
    expect(dels[1]).toHaveTextContent('line b');
  });

  it('renders an empty-state placeholder when hunks produce no lines', () => {
    const payload: TextDiffPayload = { kind: 'text', hunks: [] };
    const { getByTestId } = render(<TextDiffBlock payload={payload} />);
    expect(getByTestId('text-diff-empty')).toHaveTextContent('No textual changes');
  });

  it('reports accurate a11y line counts on the region', () => {
    const payload: TextDiffPayload = {
      kind: 'text',
      hunks: [
        { op: 'insert', text: 'a\nb\n' },
        { op: 'delete', text: 'c\n' },
      ],
    };
    render(<TextDiffBlock payload={payload} />);
    const region = screen.getByRole('region');
    expect(region.getAttribute('aria-label')).toContain('2 lines added');
    expect(region.getAttribute('aria-label')).toContain('1 lines removed');
  });
});
