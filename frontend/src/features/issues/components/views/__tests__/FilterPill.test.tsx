/**
 * FilterPill component tests.
 *
 * Covers: rendering, remove callback, accessibility, teal branding.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FilterPill } from '../FilterPill';

describe('FilterPill', () => {
  const defaultProps = {
    label: 'State',
    value: 'In Progress',
    onRemove: vi.fn(),
  };

  it('renders label and value', () => {
    render(<FilterPill {...defaultProps} />);
    expect(screen.getByText('State:')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('calls onRemove when X button clicked', () => {
    const onRemove = vi.fn();
    render(<FilterPill {...defaultProps} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole('button', { name: /remove state filter/i }));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it('has accessible remove button label', () => {
    render(<FilterPill {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Remove State filter' })).toBeInTheDocument();
  });

  it('applies teal brand color class', () => {
    const { container } = render(<FilterPill {...defaultProps} />);
    const pill = container.firstChild as HTMLElement;
    expect(pill.className).toContain('#29A386');
  });

  it('applies custom className', () => {
    const { container } = render(<FilterPill {...defaultProps} className="my-custom" />);
    const pill = container.firstChild as HTMLElement;
    expect(pill.className).toContain('my-custom');
  });
});
