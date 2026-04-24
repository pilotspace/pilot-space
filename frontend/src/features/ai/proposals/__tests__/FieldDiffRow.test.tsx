import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FieldDiffRow } from '../FieldDiffRow';

describe('FieldDiffRow', () => {
  it('renders label + before + after with semantic diff colors', () => {
    render(
      <FieldDiffRow row={{ field: 'priority', label: 'Priority', before: 'low', after: 'high' }} />
    );
    expect(screen.getByText('Priority:')).toBeInTheDocument();
    const before = screen.getByTestId('field-diff-before');
    const after = screen.getByTestId('field-diff-after');
    expect(before).toHaveTextContent('low');
    expect(before).toHaveClass('bg-[#fecaca]', 'text-[#dc2626]');
    expect(after).toHaveTextContent('high');
    expect(after).toHaveClass('bg-[#bbf7d0]', 'text-[#16a34a]');
  });

  it('renders null values as ∅ placeholder', () => {
    render(
      <FieldDiffRow
        row={{ field: 'assignee', label: 'Assignee', before: null, after: 'tin@example.com' }}
      />
    );
    expect(screen.getByTestId('field-diff-before')).toHaveTextContent('∅');
  });

  it('JSON-stringifies complex values and truncates after 80 chars', () => {
    const bigObj = { name: 'x'.repeat(200) };
    render(
      <FieldDiffRow
        row={{ field: 'meta', label: 'Meta', before: {}, after: bigObj }}
      />
    );
    const after = screen.getByTestId('field-diff-after');
    expect(after.textContent!.length).toBeLessThanOrEqual(80);
    expect(after).toHaveTextContent('…');
  });

  it('announces the change through role=group + aria-label', () => {
    render(
      <FieldDiffRow row={{ field: 'priority', label: 'Priority', before: 'low', after: 'high' }} />
    );
    const group = screen.getByRole('group');
    expect(group.getAttribute('aria-label')).toBe('Priority changed from low to high');
  });
});
