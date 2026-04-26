/**
 * Vitest coverage for e2e/fixtures/seed-helpers.ts.
 *
 * Phase 94 Plan 03 Task 1 — vitest excludes `e2e/` from its include glob,
 * so the test file lives under `src/__tests__/e2e-fixtures/` and imports
 * via relative path. No vitest.config change required.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { getSeedContextFrom, type SeedContext } from '../../../e2e/fixtures/seed-helpers';

describe('seed-helpers', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'seed-helpers-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('throws a clear error when seed file is missing', () => {
    const missing = path.join(tmpDir, 'does-not-exist.json');
    expect(() => getSeedContextFrom(missing)).toThrow(/Seed context not found/);
  });

  it('parses a valid seed JSON file', () => {
    const ctx: SeedContext = {
      workspaceSlug: 'workspace',
      workspaceId: '00000000-0000-0000-0000-000000000001',
      rootTopicId: null,
      childTopicAId: null,
      childTopicBId: null,
      deepTopicId: null,
      taskId: null,
      chatSessionId: null,
      artifactId: null,
      pendingProposalId: null,
      skillSlug: null,
      skillReferenceFilePath: null,
    };
    const seedPath = path.join(tmpDir, 'seed-context.json');
    writeFileSync(seedPath, JSON.stringify(ctx));

    const loaded = getSeedContextFrom(seedPath);
    expect(loaded.workspaceSlug).toBe('workspace');
    expect(loaded.workspaceId).toBe('00000000-0000-0000-0000-000000000001');
    expect(loaded.pendingProposalId).toBeNull();
  });

  it('preserves non-null seed ids for specs that need real fixtures', () => {
    const ctx = {
      workspaceSlug: 'workspace',
      workspaceId: 'abc',
      rootTopicId: 'root-1',
      childTopicAId: 'child-a',
      childTopicBId: 'child-b',
      deepTopicId: 'deep-5',
      taskId: 'task-1',
      chatSessionId: 'sess-1',
      artifactId: 'art-1',
      pendingProposalId: 'prop-1',
      skillSlug: 'extract-issues',
      skillReferenceFilePath: 'docs/extract.md',
    };
    const seedPath = path.join(tmpDir, 'seed-context.json');
    writeFileSync(seedPath, JSON.stringify(ctx));

    const loaded = getSeedContextFrom(seedPath);
    expect(loaded).toEqual(ctx);
  });
});
