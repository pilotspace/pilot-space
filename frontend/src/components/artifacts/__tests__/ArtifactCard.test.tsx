/**
 * ArtifactCard unit tests — Phase 85.
 *
 * Spec: `.planning/phases/85-unified-artifact-card-anatomy/85-UI-SPEC.md` §13.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ArtifactCard } from '../ArtifactCard';
import { ArtifactCardSkeleton } from '../ArtifactCardSkeleton';
import { ARTIFACT_TYPE_TOKENS, type ArtifactTokenKey } from '@/lib/artifact-tokens';
import { artifactLabel } from '@/lib/artifact-labels';

const BASE_PROPS = {
  id: 'a1',
  title: 'Sample artifact title',
  updatedAt: new Date('2026-04-20T10:00:00Z'),
  projectName: 'Platform',
  projectColor: '#3b82f6',
} as const;

describe('ArtifactCard', () => {
  describe('role and aria-label', () => {
    it('renders with role="article" and aria-label containing type label and title', () => {
      render(<ArtifactCard type="ISSUE" {...BASE_PROPS} />);
      const article = screen.getByRole('article');
      expect(article).toHaveAttribute('aria-label', `Task: ${BASE_PROPS.title}`);
    });
  });

  describe('type badge label', () => {
    const ALL_TYPES = Object.keys(ARTIFACT_TYPE_TOKENS) as ArtifactTokenKey[];

    it.each(ALL_TYPES)('renders uppercase label from artifactLabel() for %s', (type) => {
      render(<ArtifactCard type={type} {...BASE_PROPS} />);
      const expected = artifactLabel(type, false).toUpperCase();
      // Compact and non-compact both render exactly one badge by default density=full
      expect(screen.getByText(expected)).toBeInTheDocument();
    });
  });

  describe('density variants', () => {
    it('density="compact" does NOT render gradient', () => {
      render(<ArtifactCard type="NOTE" density="compact" {...BASE_PROPS} />);
      expect(screen.queryByTestId('artifact-gradient')).toBeNull();
    });

    it('density="full" renders gradient with height 110px', () => {
      render(<ArtifactCard type="NOTE" density="full" {...BASE_PROPS} />);
      const gradient = screen.getByTestId('artifact-gradient');
      expect(gradient).toBeInTheDocument();
      expect(gradient.className).toContain('h-[110px]');
    });

    it('density="preview" renders gradient with height 72px', () => {
      render(<ArtifactCard type="NOTE" density="preview" {...BASE_PROPS} />);
      const gradient = screen.getByTestId('artifact-gradient');
      expect(gradient).toBeInTheDocument();
      expect(gradient.className).toContain('h-[72px]');
    });
  });

  describe('keyboard interaction', () => {
    it('fires onClick on Enter key when onClick provided', () => {
      const onClick = vi.fn();
      render(<ArtifactCard type="NOTE" onClick={onClick} {...BASE_PROPS} />);
      const article = screen.getByRole('article');
      fireEvent.keyDown(article, { key: 'Enter' });
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('fires onClick on Space key when onClick provided', () => {
      const onClick = vi.fn();
      render(<ArtifactCard type="NOTE" onClick={onClick} {...BASE_PROPS} />);
      const article = screen.getByRole('article');
      fireEvent.keyDown(article, { key: ' ' });
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('does not fire onClick on other keys', () => {
      const onClick = vi.fn();
      render(<ArtifactCard type="NOTE" onClick={onClick} {...BASE_PROPS} />);
      const article = screen.getByRole('article');
      fireEvent.keyDown(article, { key: 'a' });
      expect(onClick).not.toHaveBeenCalled();
    });

    it('fires onClick on mouse click', () => {
      const onClick = vi.fn();
      render(<ArtifactCard type="NOTE" onClick={onClick} {...BASE_PROPS} />);
      fireEvent.click(screen.getByRole('article'));
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('tabIndex', () => {
    it('is 0 when onClick provided', () => {
      render(<ArtifactCard type="NOTE" onClick={() => {}} {...BASE_PROPS} />);
      expect(screen.getByRole('article')).toHaveAttribute('tabIndex', '0');
    });

    it('is -1 when onClick is absent', () => {
      render(<ArtifactCard type="NOTE" {...BASE_PROPS} />);
      expect(screen.getByRole('article')).toHaveAttribute('tabIndex', '-1');
    });
  });

  describe('focus and hover classes', () => {
    it('includes focus-visible ring classes', () => {
      render(<ArtifactCard type="NOTE" {...BASE_PROPS} />);
      const article = screen.getByRole('article');
      expect(article.className).toContain('focus-visible:ring-2');
      expect(article.className).toContain('focus-visible:ring-ring');
    });

    it('includes motion-safe hover shadow classes', () => {
      render(<ArtifactCard type="NOTE" {...BASE_PROPS} />);
      const article = screen.getByRole('article');
      expect(article.className).toContain('motion-safe:hover:shadow-md');
    });
  });

  describe('children slot', () => {
    it('renders children inside a bordered container', () => {
      render(
        <ArtifactCard type="ISSUE" {...BASE_PROPS}>
          <div data-testid="child-content">inner</div>
        </ArtifactCard>,
      );
      const child = screen.getByTestId('child-content');
      expect(child).toBeInTheDocument();
      const container = child.parentElement;
      expect(container?.className).toContain('border-t');
      expect(container?.className).toContain('max-h-[320px]');
    });

    it('does not render children container when no children', () => {
      render(<ArtifactCard type="ISSUE" {...BASE_PROPS} />);
      expect(screen.queryByText('inner')).toBeNull();
    });
  });

  describe('footer slot', () => {
    it('renders footer inside its own bordered container', () => {
      render(
        <ArtifactCard
          type="ISSUE"
          {...BASE_PROPS}
          footer={<div data-testid="footer-content">footer</div>}
        />,
      );
      const footer = screen.getByTestId('footer-content');
      expect(footer.parentElement?.className).toContain('border-t');
    });
  });

  describe('snippet', () => {
    it('renders snippet for full density', () => {
      render(<ArtifactCard type="NOTE" density="full" {...BASE_PROPS} snippet="brief summary" />);
      expect(screen.getByText('brief summary')).toBeInTheDocument();
    });

    it('does not render snippet for compact density', () => {
      render(
        <ArtifactCard type="NOTE" density="compact" {...BASE_PROPS} snippet="brief summary" />,
      );
      expect(screen.queryByText('brief summary')).toBeNull();
    });
  });
});

describe('ArtifactCardSkeleton', () => {
  it('renders with aria-busy=true', () => {
    render(<ArtifactCardSkeleton />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveAttribute('aria-label', 'Loading artifact');
  });

  it('omits gradient row for compact density', () => {
    const { container } = render(<ArtifactCardSkeleton density="compact" />);
    // There should be 2 skeleton children (title + subtitle), no gradient skeleton.
    const skeletons = container.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBe(2);
  });

  it('includes gradient-height skeleton for full density', () => {
    const { container } = render(<ArtifactCardSkeleton density="full" />);
    const skeletons = container.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBe(3);
    expect(skeletons[0]?.className).toContain('h-[110px]');
  });
});
