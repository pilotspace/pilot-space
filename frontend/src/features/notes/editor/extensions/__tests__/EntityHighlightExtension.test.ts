/**
 * Unit tests for EntityHighlightExtension — findEntityMatches.
 *
 * Validates project name detection: case-insensitive matching,
 * word boundary respect, correct from/to positions, empty input,
 * and special regex character safety.
 *
 * @module features/notes/editor/extensions/__tests__/EntityHighlightExtension.test
 */
import { describe, it, expect } from 'vitest';
import { findEntityMatches } from '../EntityHighlightExtension';

/**
 * Minimal ProseMirror doc mock for testing text traversal.
 */
function createMockDoc(texts: string[]) {
  const textNodes = texts.map((text) => ({
    isText: true,
    text,
  }));

  return {
    descendants(callback: (node: { isText: boolean; text?: string }, pos: number) => boolean) {
      let pos = 0;
      for (const node of textNodes) {
        callback(node, pos);
        pos += node.text?.length ?? 0;
      }
    },
  } as unknown as Parameters<typeof findEntityMatches>[0];
}

const entities = [
  { name: 'Frontend', projectId: 'proj-1' },
  { name: 'Backend API', projectId: 'proj-2' },
  { name: 'Pilot Space', projectId: 'proj-3' },
];

describe('findEntityMatches', () => {
  it('test_finds_exact_project_name_in_text', () => {
    const doc = createMockDoc(['Working on Frontend today']);
    const matches = findEntityMatches(doc, entities);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      name: 'Frontend',
      projectId: 'proj-1',
      from: 11,
      to: 19,
    });
  });

  it('test_case_insensitive_matching', () => {
    const doc = createMockDoc(['The frontend team is great']);
    const matches = findEntityMatches(doc, entities);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      name: 'frontend',
      projectId: 'proj-1',
    });
  });

  it('test_matches_multi_word_project_names', () => {
    const doc = createMockDoc(['Check the Backend API docs and Pilot Space repo']);
    const matches = findEntityMatches(doc, entities);

    expect(matches).toHaveLength(2);
    expect(matches[0]).toMatchObject({ name: 'Backend API', projectId: 'proj-2' });
    expect(matches[1]).toMatchObject({ name: 'Pilot Space', projectId: 'proj-3' });
  });

  it('test_respects_word_boundaries — no partial matches', () => {
    const doc = createMockDoc(['FrontendX is not Frontend']);
    const matches = findEntityMatches(doc, entities);

    // Only "Frontend" at the end should match, not "FrontendX"
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ name: 'Frontend' });
    // Verify "FrontendX" was NOT matched
    expect(matches.some((m) => m.name === 'FrontendX')).toBe(false);
  });

  it('test_returns_correct_positions_for_multiple_matches', () => {
    const doc = createMockDoc(['Frontend and Frontend again']);
    const matches = findEntityMatches(doc, entities);

    expect(matches).toHaveLength(2);
    expect(matches[0]).toMatchObject({ from: 0, to: 8 });
    expect(matches[1]).toMatchObject({ from: 13, to: 21 });
  });

  it('test_empty_entities_returns_no_matches', () => {
    const doc = createMockDoc(['Frontend Backend']);
    const matches = findEntityMatches(doc, []);
    expect(matches).toHaveLength(0);
  });

  it('test_empty_document_returns_no_matches', () => {
    const doc = createMockDoc([]);
    const matches = findEntityMatches(doc, entities);
    expect(matches).toHaveLength(0);
  });

  it('test_handles_special_regex_characters_in_project_names', () => {
    const specialEntities = [
      { name: 'C++ Engine', projectId: 'proj-cpp' },
      { name: 'My (Project)', projectId: 'proj-parens' },
    ];
    const doc = createMockDoc(['Working on C++ Engine and My (Project)']);
    const matches = findEntityMatches(doc, specialEntities);

    expect(matches).toHaveLength(2);
    expect(matches[0]).toMatchObject({ name: 'C++ Engine', projectId: 'proj-cpp' });
    expect(matches[1]).toMatchObject({ name: 'My (Project)', projectId: 'proj-parens' });
  });

  it('test_ignores_short_names_under_2_chars', () => {
    const shortEntities = [
      { name: 'X', projectId: 'proj-x' },
      { name: 'OK', projectId: 'proj-ok' },
    ];
    const doc = createMockDoc(['X is short but OK is fine']);
    const matches = findEntityMatches(doc, shortEntities);

    // Only "OK" should match (>= 2 chars)
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ name: 'OK', projectId: 'proj-ok' });
  });
});
