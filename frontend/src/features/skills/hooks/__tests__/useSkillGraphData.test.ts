/**
 * Tests for useSkillGraphData (Phase 92 Plan 02 Task 1).
 *
 * Bridges Plan 92-01's pure `buildSkillGraph` helper with the catalog query.
 * Memoization is tested via reference identity over `renderHook` rerenders.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { Skill } from '@/types/skill';
import type { ApiError } from '@/services/api/client';

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockUseSkillCatalog = vi.fn();

vi.mock('../useSkillCatalog', () => ({
  useSkillCatalog: () => mockUseSkillCatalog(),
}));

// Import AFTER mocks so the hook closes over the mocked module.
import { useSkillGraphData } from '../useSkillGraphData';

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeSkill(slug: string, refs: string[] = []): Skill {
  return {
    name: slug
      .split('-')
      .map((s) => s[0]?.toUpperCase() + s.slice(1))
      .join(' '),
    description: '',
    category: 'core',
    icon: 'Sparkles',
    examples: [],
    slug,
    feature_module: null,
    reference_files: refs,
    updated_at: null,
  };
}

function makeQueryResult(
  overrides: Partial<UseQueryResult<Skill[], ApiError>>,
): UseQueryResult<Skill[], ApiError> {
  return {
    data: undefined,
    error: null,
    isError: false,
    isPending: false,
    isLoading: false,
    isLoadingError: false,
    isRefetchError: false,
    isSuccess: false,
    isFetching: false,
    isStale: false,
    isPlaceholderData: false,
    fetchStatus: 'idle',
    status: 'pending',
    refetch: vi.fn(),
    ...overrides,
  } as unknown as UseQueryResult<Skill[], ApiError>;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('useSkillGraphData', () => {
  beforeEach(() => {
    mockUseSkillCatalog.mockReset();
  });

  it('returns graph: null while catalog is pending', () => {
    mockUseSkillCatalog.mockReturnValue(
      makeQueryResult({ data: undefined, isPending: true, status: 'pending' }),
    );

    const { result } = renderHook(() => useSkillGraphData());

    expect(result.current.graph).toBeNull();
    expect(result.current.catalog.isPending).toBe(true);
  });

  it('returns graph: null when catalog is in error state', () => {
    const error = new Error('boom') as ApiError;
    mockUseSkillCatalog.mockReturnValue(
      makeQueryResult({
        data: undefined,
        isError: true,
        error,
        status: 'error',
      }),
    );

    const { result } = renderHook(() => useSkillGraphData());

    expect(result.current.graph).toBeNull();
    expect(result.current.catalog.isError).toBe(true);
    expect(result.current.catalog.error).toBe(error);
  });

  it('returns empty graph when catalog data is an empty array', () => {
    mockUseSkillCatalog.mockReturnValue(
      makeQueryResult({ data: [], isSuccess: true, status: 'success' }),
    );

    const { result } = renderHook(() => useSkillGraphData());

    expect(result.current.graph).toEqual({
      nodes: [],
      edges: [],
      cycles: [],
    });
  });

  it('builds a bipartite graph for two skills with a shared reference file', () => {
    const skills: Skill[] = [
      makeSkill('alpha', ['docs/shared.md', 'docs/alpha-only.md']),
      makeSkill('beta', ['docs/shared.md']),
    ];
    mockUseSkillCatalog.mockReturnValue(
      makeQueryResult({ data: skills, isSuccess: true, status: 'success' }),
    );

    const { result } = renderHook(() => useSkillGraphData());

    expect(result.current.graph).not.toBeNull();
    expect(result.current.graph!.nodes).toHaveLength(4); // 2 skills + 2 unique files
    const skillNodes = result.current.graph!.nodes.filter((n) => n.kind === 'skill');
    const fileNodes = result.current.graph!.nodes.filter((n) => n.kind === 'file');
    expect(skillNodes).toHaveLength(2);
    expect(fileNodes).toHaveLength(2);
    expect(result.current.graph!.edges).toHaveLength(3); // alpha→shared, alpha→alpha-only, beta→shared
    expect(result.current.graph!.cycles).toEqual([]);
  });

  it('memoizes graph: same catalog data reference yields same graph reference', () => {
    const skills: Skill[] = [makeSkill('alpha', ['docs/a.md'])];
    mockUseSkillCatalog.mockReturnValue(
      makeQueryResult({ data: skills, isSuccess: true, status: 'success' }),
    );

    const { result, rerender } = renderHook(() => useSkillGraphData());
    const first = result.current.graph;
    rerender();
    const second = result.current.graph;

    expect(first).not.toBeNull();
    expect(second).toBe(first); // identical reference
  });

  it('produces a new graph reference when catalog data reference changes', () => {
    const skillsA: Skill[] = [makeSkill('alpha', ['docs/a.md'])];
    mockUseSkillCatalog.mockReturnValue(
      makeQueryResult({ data: skillsA, isSuccess: true, status: 'success' }),
    );
    const { result, rerender } = renderHook(() => useSkillGraphData());
    const first = result.current.graph;

    const skillsB: Skill[] = [...skillsA, makeSkill('beta', ['docs/b.md'])];
    mockUseSkillCatalog.mockReturnValue(
      makeQueryResult({ data: skillsB, isSuccess: true, status: 'success' }),
    );
    rerender();
    const second = result.current.graph;

    expect(second).not.toBe(first);
    expect(second!.nodes).toHaveLength(4); // 2 skills + 2 files
  });
});
