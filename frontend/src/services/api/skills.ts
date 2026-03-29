/**
 * Skills API client — generated skill save endpoint.
 * Used by SkillSaveDialog after conversational skill generation.
 * Source: Phase 051, P051-03
 */

import { apiClient } from './client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SaveGeneratedSkillParams {
  workspaceId: string;
  sessionId: string;
  saveType: 'personal' | 'workspace';
  name: string;
  description: string;
  category: string;
  icon: string;
  skillContent: string;
  examplePrompts: string[];
  graphData: Record<string, unknown> | null;
}

export interface SaveGeneratedSkillResult {
  skillId: string;
  skillName: string;
  saveType: string;
}

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

export async function saveGeneratedSkill(
  params: SaveGeneratedSkillParams,
): Promise<SaveGeneratedSkillResult> {
  return apiClient.post<SaveGeneratedSkillResult>(
    '/skills/generator/save',
    params,
  );
}
