/**
 * SkillDetailPage tests — Phase 91 Plan 04, Task 3.
 *
 * Mocks `useSkill`, `useArtifactPeekState`, and the chat MarkdownContent so
 * we can validate the four state branches (loading / 404 / error / data),
 * the metadata row, the back link, and the ref-file → openSkillFilePeek
 * dispatch path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { SkillDetail } from '@/types/skill';
import { ApiError } from '@/services/api/client';

// ---------------------------------------------------------------------------
// Mocks (declared via factory — no top-level vi.fn refs).
// ---------------------------------------------------------------------------

const mockUseSkill = vi.fn();
const mockOpenSkillFilePeek = vi.fn();
const mockRefetch = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => ({ workspaceSlug: 'workspace', skillSlug: 'ai-context' }),
}));

vi.mock('../../hooks', () => ({
  useSkill: (slug: string) => mockUseSkill(slug),
}));

vi.mock('@/hooks/use-artifact-peek-state', () => ({
  useArtifactPeekState: () => ({
    peekId: null,
    peekType: null,
    focusId: null,
    focusType: null,
    view: 'split',
    isPeekOpen: false,
    isFocusOpen: false,
    skillFile: null,
    isSkillFilePeek: false,
    openPeek: vi.fn(),
    closePeek: vi.fn(),
    openFocus: vi.fn(),
    closeFocus: vi.fn(),
    escalate: vi.fn(),
    demote: vi.fn(),
    setView: vi.fn(),
    openSkillFilePeek: mockOpenSkillFilePeek,
  }),
}));

// Render the markdown body as plain text so we can assert on its content
// without pulling in react-markdown's full pipeline.
vi.mock('@/features/ai/ChatView/MessageList/MarkdownContent', () => ({
  MarkdownContent: ({ content }: { content: string }) => (
    <div data-testid="markdown-content">{content}</div>
  ),
}));

// next/link stub — preserves href for assertions.
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// date-fns: deterministic time stamp so the metadata text is stable.
vi.mock('date-fns', () => ({
  formatDistanceToNow: () => '2 days ago',
}));

import { SkillDetailPage } from '../SkillDetailPage';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function buildDetail(over: Partial<SkillDetail> = {}): SkillDetail {
  return {
    name: 'AI Context',
    slug: 'ai-context',
    description: 'Generate AI context for a chat session.',
    category: 'AI',
    icon: 'Sparkles',
    examples: [],
    feature_module: ['chat'],
    body: '# AI Context\n\nThis skill assembles project context for the AI.',
    reference_files: [
      {
        name: 'architecture.md',
        path: 'architecture.md',
        size_bytes: 2048,
        mime_type: 'text/markdown',
      },
    ],
    updated_at: '2026-04-23T12:00:00Z',
    ...over,
  };
}

interface QueryShape {
  data?: SkillDetail;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: typeof mockRefetch;
}

function makeQuery(over: Partial<QueryShape>): QueryShape {
  return {
    data: undefined,
    isPending: false,
    isError: false,
    error: null,
    refetch: mockRefetch,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('SkillDetailPage', () => {
  beforeEach(() => {
    mockUseSkill.mockReset();
    mockOpenSkillFilePeek.mockReset();
    mockRefetch.mockReset();
  });

  it('renders the skeleton while isPending', () => {
    mockUseSkill.mockReturnValue(makeQuery({ isPending: true }));
    render(<SkillDetailPage />);
    expect(screen.getByTestId('skill-detail-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('skill-detail-article')).toBeNull();
  });

  it('renders the 404 empty state when error is ApiError 404', () => {
    const err = new ApiError({ title: 'Not Found', status: 404 });
    mockUseSkill.mockReturnValue(makeQuery({ isError: true, error: err }));
    render(<SkillDetailPage />);
    expect(screen.getByTestId('skill-detail-404')).toBeInTheDocument();
    expect(screen.getByText('Skill not found')).toBeInTheDocument();
    expect(screen.queryByTestId('skill-detail-error')).toBeNull();
  });

  it('renders the generic error state when error is ApiError 500', () => {
    const err = new ApiError({ title: 'Server Error', status: 500 });
    mockUseSkill.mockReturnValue(makeQuery({ isError: true, error: err }));
    render(<SkillDetailPage />);
    expect(screen.getByTestId('skill-detail-error')).toBeInTheDocument();
    expect(screen.getByText("Couldn't load this skill.")).toBeInTheDocument();
    expect(screen.queryByTestId('skill-detail-404')).toBeNull();
  });

  it('Retry button calls refetch on the generic error state', () => {
    const err = new ApiError({ title: 'Server Error', status: 500 });
    mockUseSkill.mockReturnValue(makeQuery({ isError: true, error: err }));
    render(<SkillDetailPage />);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('renders the SKILL hero, category chip, and feature chip when data', () => {
    mockUseSkill.mockReturnValue(makeQuery({ data: buildDetail() }));
    render(<SkillDetailPage />);
    expect(screen.getByTestId('skill-detail-article')).toBeInTheDocument();
    expect(screen.getByText('AI Context')).toBeInTheDocument();
    expect(
      screen.getByText('Generate AI context for a chat session.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('skill-detail-category-chip')).toHaveTextContent(
      'AI',
    );
    expect(screen.getByTestId('skill-detail-feature-chip')).toHaveTextContent(
      'chat',
    );
  });

  it('renders MarkdownContent with the skill body', () => {
    mockUseSkill.mockReturnValue(makeQuery({ data: buildDetail() }));
    render(<SkillDetailPage />);
    const md = screen.getByTestId('markdown-content');
    expect(md).toHaveTextContent('# AI Context');
    expect(md).toHaveTextContent('This skill assembles project context');
  });

  it('renders SkillReferenceFiles; clicking a row calls openSkillFilePeek with (slug, path)', () => {
    mockUseSkill.mockReturnValue(
      makeQuery({
        data: buildDetail({
          reference_files: [
            {
              name: 'architecture.md',
              path: 'architecture.md',
              size_bytes: 2048,
              mime_type: 'text/markdown',
            },
            {
              name: 'patterns.md',
              path: 'docs/patterns.md',
              size_bytes: 4096,
              mime_type: 'text/markdown',
            },
          ],
        }),
      }),
    );
    render(<SkillDetailPage />);
    fireEvent.click(
      screen.getByTestId('skill-ref-file-row-docs/patterns.md'),
    );
    expect(mockOpenSkillFilePeek).toHaveBeenCalledTimes(1);
    expect(mockOpenSkillFilePeek).toHaveBeenCalledWith(
      'ai-context',
      'docs/patterns.md',
    );
  });

  it('back link points to /{workspaceSlug}/skills', () => {
    mockUseSkill.mockReturnValue(makeQuery({ data: buildDetail() }));
    render(<SkillDetailPage />);
    const back = screen.getByTestId('skill-detail-back-link');
    expect(back).toHaveAttribute('href', '/workspace/skills');
  });

  it('metadata row formats `{category} · {feature_module} · Updated {time}`', () => {
    mockUseSkill.mockReturnValue(makeQuery({ data: buildDetail() }));
    render(<SkillDetailPage />);
    expect(
      screen.getByTestId('skill-detail-metadata'),
    ).toHaveTextContent('AI · chat · Updated 2 days ago');
  });

  it('metadata uses dash placeholders when feature_module is null', () => {
    mockUseSkill.mockReturnValue(
      makeQuery({
        data: buildDetail({ feature_module: null }),
      }),
    );
    render(<SkillDetailPage />);
    expect(
      screen.getByTestId('skill-detail-metadata'),
    ).toHaveTextContent('AI · — · Updated 2 days ago');
    // No feature chip when feature_module is null
    expect(screen.queryByTestId('skill-detail-feature-chip')).toBeNull();
  });

  it('does not render description when empty', () => {
    mockUseSkill.mockReturnValue(
      makeQuery({ data: buildDetail({ description: '' }) }),
    );
    render(<SkillDetailPage />);
    // Article still rendered with hero — description paragraph is omitted.
    expect(screen.getByTestId('skill-detail-article')).toBeInTheDocument();
    expect(
      screen.queryByText('Generate AI context for a chat session.'),
    ).toBeNull();
  });
});
