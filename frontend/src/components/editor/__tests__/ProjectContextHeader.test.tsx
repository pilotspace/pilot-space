/**
 * Unit tests for ProjectContextHeader component (v2).
 *
 * Tests: null states, loading skeleton, project name link,
 * nav tabs with correct hrefs, active tab highlight,
 * progress bar, open issue tab badge, project icon emoji.
 *
 * @module components/editor/__tests__/ProjectContextHeader.test
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useProject } from '@/features/projects/hooks';
import { useActiveCycle } from '@/features/cycles/hooks/useCycle';
import { ProjectContextHeader } from '../ProjectContextHeader';

vi.mock('@/features/projects/hooks', () => ({
  useProject: vi.fn(),
}));

vi.mock('@/features/cycles/hooks/useCycle', () => ({
  useActiveCycle: vi.fn().mockReturnValue({ data: undefined }),
}));

const mockProject = {
  id: 'proj-1',
  name: 'Frontend',
  identifier: 'FE',
  workspaceId: 'ws-1',
  issueCount: 18,
  openIssueCount: 10,
  completedIssueCount: 8,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

describe('ProjectContextHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('test_renders_null_when_projectId_empty', () => {
    (useProject as Mock).mockReturnValue({ data: undefined, isLoading: false });
    const { container } = render(<ProjectContextHeader projectId="" workspaceSlug="acme" />);
    expect(container.firstChild).toBeNull();
  });

  it('test_renders_skeleton_while_loading', () => {
    (useProject as Mock).mockReturnValue({ data: undefined, isLoading: true });
    render(<ProjectContextHeader projectId="proj-1" workspaceSlug="acme" />);
    expect(screen.queryByText('Frontend')).not.toBeInTheDocument();
    // Container renders (h-8 preserved — no layout shift) but project content absent
    expect(screen.queryByRole('link', { name: /^overview$/i })).not.toBeInTheDocument();
  });

  it('test_renders_null_when_project_not_found', () => {
    (useProject as Mock).mockReturnValue({ data: null, isLoading: false });
    const { container } = render(<ProjectContextHeader projectId="proj-1" workspaceSlug="acme" />);
    expect(container.firstChild).toBeNull();
  });

  it('test_renders_project_name_linking_to_project_root', () => {
    (useProject as Mock).mockReturnValue({ data: mockProject, isLoading: false });
    render(<ProjectContextHeader projectId="proj-1" workspaceSlug="acme" />);
    const nameLink = screen.getByText('Frontend').closest('a');
    expect(nameLink).toHaveAttribute('href', '/acme/projects/proj-1');
  });

  it('test_renders_overview_tab_with_correct_href', () => {
    (useProject as Mock).mockReturnValue({ data: mockProject, isLoading: false });
    render(<ProjectContextHeader projectId="proj-1" workspaceSlug="acme" />);
    expect(screen.getByRole('link', { name: /^overview$/i })).toHaveAttribute(
      'href',
      '/acme/projects/proj-1/overview'
    );
  });

  it('test_renders_issues_tab_with_correct_href', () => {
    (useProject as Mock).mockReturnValue({ data: mockProject, isLoading: false });
    render(<ProjectContextHeader projectId="proj-1" workspaceSlug="acme" />);
    expect(screen.getByRole('link', { name: /issues/i })).toHaveAttribute(
      'href',
      '/acme/projects/proj-1/issues'
    );
  });

  it('test_renders_cycles_tab_with_correct_href', () => {
    (useProject as Mock).mockReturnValue({ data: mockProject, isLoading: false });
    render(<ProjectContextHeader projectId="proj-1" workspaceSlug="acme" />);
    expect(screen.getByRole('link', { name: /^cycles$/i })).toHaveAttribute(
      'href',
      '/acme/projects/proj-1/cycles'
    );
  });

  it('test_active_tab_has_border_primary_class', () => {
    (useProject as Mock).mockReturnValue({ data: mockProject, isLoading: false });
    render(<ProjectContextHeader projectId="proj-1" workspaceSlug="acme" activeTab="issues" />);
    const issuesLink = screen.getByRole('link', { name: /issues/i });
    expect(issuesLink.className).toContain('border-primary');
  });

  it('test_inactive_tabs_have_border_transparent_class', () => {
    (useProject as Mock).mockReturnValue({ data: mockProject, isLoading: false });
    render(<ProjectContextHeader projectId="proj-1" workspaceSlug="acme" activeTab="issues" />);
    const overviewLink = screen.getByRole('link', { name: /^overview$/i });
    expect(overviewLink.className).toContain('border-transparent');
  });

  it('test_no_active_tab_when_activeTab_prop_omitted', () => {
    (useProject as Mock).mockReturnValue({ data: mockProject, isLoading: false });
    render(<ProjectContextHeader projectId="proj-1" workspaceSlug="acme" />);
    const allTabLinks = screen.getAllByRole('link');
    const tabLinks = allTabLinks.filter((l) =>
      ['/overview', '/issues', '/cycles'].some((s) => l.getAttribute('href')?.endsWith(s))
    );
    tabLinks.forEach((link) => {
      expect(link.className).toContain('border-transparent');
    });
  });

  it('test_renders_progress_bar_with_completion_fraction', () => {
    (useProject as Mock).mockReturnValue({ data: mockProject, isLoading: false });
    render(<ProjectContextHeader projectId="proj-1" workspaceSlug="acme" />);
    // 18 - 10 = 8 completed
    expect(screen.getByText('8/18')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '8');
    expect(bar).toHaveAttribute('aria-valuemax', '18');
  });

  it('test_issues_tab_shows_open_count_badge', () => {
    (useProject as Mock).mockReturnValue({ data: mockProject, isLoading: false });
    render(<ProjectContextHeader projectId="proj-1" workspaceSlug="acme" />);
    // Issues tab shows the open count inline badge (not a separate "10 open" stat)
    const issuesLink = screen.getByRole('link', { name: /issues/i });
    expect(issuesLink).toHaveTextContent('10');
  });

  it('test_issues_tab_hides_badge_when_zero_open', () => {
    (useProject as Mock).mockReturnValue({
      data: { ...mockProject, openIssueCount: 0 },
      isLoading: false,
    });
    render(<ProjectContextHeader projectId="proj-1" workspaceSlug="acme" />);
    const issuesLink = screen.getByRole('link', { name: /^issues$/i });
    // Badge text "0" should not appear (badge is hidden when openIssueCount === 0)
    expect(issuesLink.textContent?.trim()).toBe('Issues');
  });

  it('test_uses_project_icon_emoji_when_available', () => {
    (useProject as Mock).mockReturnValue({
      data: { ...mockProject, icon: '🚀' },
      isLoading: false,
    });
    render(<ProjectContextHeader projectId="proj-1" workspaceSlug="acme" />);
    expect(screen.getByText('🚀')).toBeInTheDocument();
    // Lucide Folder icon not rendered when emoji is set
    expect(document.querySelector('svg')).toBeNull();
  });

  it('test_falls_back_to_folder_icon_when_no_icon', () => {
    (useProject as Mock).mockReturnValue({ data: mockProject, isLoading: false });
    render(<ProjectContextHeader projectId="proj-1" workspaceSlug="acme" />);
    // Folder SVG rendered as fallback
    expect(document.querySelector('svg')).toBeInTheDocument();
  });

  it('test_cycle_burndown_renders_when_active_cycle_has_metrics', () => {
    (useProject as Mock).mockReturnValue({ data: mockProject, isLoading: false });
    (useActiveCycle as Mock).mockReturnValue({
      data: {
        id: 'cycle-1',
        name: 'Sprint 5',
        metrics: {
          totalIssues: 10,
          completedIssues: 6,
          completionPercentage: 60,
        },
      },
    });
    render(
      <ProjectContextHeader projectId="proj-1" workspaceSlug="acme" workspaceId="ws-uuid-1" />
    );
    expect(screen.getByText('Sprint 5')).toBeInTheDocument();
    expect(screen.getByText('6/10')).toBeInTheDocument();
    // Cycle progress bar renders
    const cycleBars = screen.getAllByRole('progressbar');
    expect(cycleBars.length).toBeGreaterThanOrEqual(2); // project + cycle
  });

  it('test_cycle_burndown_hidden_when_no_active_cycle', () => {
    (useProject as Mock).mockReturnValue({ data: mockProject, isLoading: false });
    (useActiveCycle as Mock).mockReturnValue({ data: undefined });
    render(
      <ProjectContextHeader projectId="proj-1" workspaceSlug="acme" workspaceId="ws-uuid-1" />
    );
    expect(screen.queryByText('Sprint 5')).not.toBeInTheDocument();
  });

  it('test_cycle_burndown_hidden_when_cycle_has_no_metrics', () => {
    (useProject as Mock).mockReturnValue({ data: mockProject, isLoading: false });
    (useActiveCycle as Mock).mockReturnValue({
      data: { id: 'cycle-1', name: 'Sprint 5', metrics: undefined },
    });
    render(
      <ProjectContextHeader projectId="proj-1" workspaceSlug="acme" workspaceId="ws-uuid-1" />
    );
    expect(screen.queryByText('Sprint 5')).not.toBeInTheDocument();
  });
});
