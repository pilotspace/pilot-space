/**
 * FilterDropdown component tests.
 *
 * Covers: rendering options, toggle selection, search filtering,
 * clear selection, badge count, accessibility.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FilterDropdown } from '../FilterDropdown';
import { Circle } from 'lucide-react';

// Mock shadcn Popover to always be open for testability
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="trigger">{children}</div>
  ),
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="popover-content">{children}</div>
  ),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: { children: React.ReactNode; [k: string]: unknown }) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="badge">{children}</span>
  ),
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

const OPTIONS = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'todo', label: 'Todo' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
];

describe('FilterDropdown', () => {
  let onChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onChange = vi.fn();
  });

  it('renders label and all options', () => {
    render(
      <FilterDropdown
        label="State"
        icon={Circle}
        options={OPTIONS}
        selected={[]}
        onChange={onChange}
      />
    );
    expect(screen.getByText('State')).toBeInTheDocument();
    expect(screen.getByText('Backlog')).toBeInTheDocument();
    expect(screen.getByText('Todo')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('adds value when clicking unselected option', () => {
    render(
      <FilterDropdown
        label="State"
        icon={Circle}
        options={OPTIONS}
        selected={['backlog']}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByText('Todo'));
    expect(onChange).toHaveBeenCalledWith(['backlog', 'todo']);
  });

  it('removes value when clicking selected option', () => {
    render(
      <FilterDropdown
        label="State"
        icon={Circle}
        options={OPTIONS}
        selected={['backlog', 'todo']}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByText('Backlog'));
    expect(onChange).toHaveBeenCalledWith(['todo']);
  });

  it('shows badge count when items are selected', () => {
    render(
      <FilterDropdown
        label="State"
        icon={Circle}
        options={OPTIONS}
        selected={['backlog', 'todo']}
        onChange={onChange}
      />
    );
    expect(screen.getByTestId('badge')).toHaveTextContent('2');
  });

  it('does not show badge when nothing selected', () => {
    render(
      <FilterDropdown
        label="State"
        icon={Circle}
        options={OPTIONS}
        selected={[]}
        onChange={onChange}
      />
    );
    expect(screen.queryByTestId('badge')).not.toBeInTheDocument();
  });

  it('filters options by search query', () => {
    render(
      <FilterDropdown
        label="State"
        icon={Circle}
        options={OPTIONS}
        selected={[]}
        onChange={onChange}
      />
    );
    const searchInput = screen.getByPlaceholderText('Search state...');
    fireEvent.change(searchInput, { target: { value: 'prog' } });
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.queryByText('Backlog')).not.toBeInTheDocument();
    expect(screen.queryByText('Todo')).not.toBeInTheDocument();
  });

  it('shows "No results" when search matches nothing', () => {
    render(
      <FilterDropdown
        label="State"
        icon={Circle}
        options={OPTIONS}
        selected={[]}
        onChange={onChange}
      />
    );
    fireEvent.change(screen.getByPlaceholderText('Search state...'), { target: { value: 'zzz' } });
    expect(screen.getByText('No results')).toBeInTheDocument();
  });

  it('clears all selections via "Clear selection" button', () => {
    render(
      <FilterDropdown
        label="State"
        icon={Circle}
        options={OPTIONS}
        selected={['backlog', 'todo']}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByText('Clear selection'));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
