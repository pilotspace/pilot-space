/**
 * Tests for skill-related SSE event type guards.
 * Covers isSkillPreviewEvent, isTestResultEvent, isSkillSavedEvent.
 *
 * @see ../event-guards.ts
 * @see ../events.ts
 */
import { describe, it, expect } from 'vitest';
import {
  isSkillPreviewEvent,
  isTestResultEvent,
  isSkillSavedEvent,
} from '../event-guards';
import type { SkillPreviewEvent, TestResultEvent, SkillSavedEvent } from '../events';

// --------------------------------------------------------------------------
// isSkillPreviewEvent
// --------------------------------------------------------------------------
describe('isSkillPreviewEvent', () => {
  it('returns true for an event with type "skill_preview"', () => {
    const event: SkillPreviewEvent = {
      type: 'skill_preview',
      data: {
        skillName: 'my-skill',
        frontmatter: { name: 'my-skill', description: 'A test skill' },
        content: '## Instructions\nDo the thing.',
        isUpdate: false,
      },
    };
    expect(isSkillPreviewEvent(event)).toBe(true);
  });

  it('returns false for an event with type "text_delta"', () => {
    const event = { type: 'text_delta' as const, data: { messageId: 'msg-1', delta: 'hello' } };
    expect(isSkillPreviewEvent(event)).toBe(false);
  });

  it('returns false for an event with type "message_stop"', () => {
    const event = {
      type: 'message_stop' as const,
      data: { messageId: 'msg-1', stopReason: 'end_turn' as const },
    };
    expect(isSkillPreviewEvent(event)).toBe(false);
  });

  it('returns false for an event with type "tool_use"', () => {
    const event = {
      type: 'tool_use' as const,
      data: { toolCallId: 'tc-1', toolName: 'create_skill', toolInput: {} },
    };
    expect(isSkillPreviewEvent(event)).toBe(false);
  });

  it('correctly narrows the type so data fields are accessible', () => {
    const event = {
      type: 'skill_preview' as const,
      data: {
        skillName: 'review-pr',
        frontmatter: { model: 'claude-opus-4-5' },
        content: 'Review the PR.',
        isUpdate: true,
      },
    };
    if (isSkillPreviewEvent(event)) {
      // TypeScript should allow accessing these without casting
      expect(event.data.skillName).toBe('review-pr');
      expect(event.data.isUpdate).toBe(true);
      expect(event.data.frontmatter.model).toBe('claude-opus-4-5');
    } else {
      throw new Error('Expected isSkillPreviewEvent to return true');
    }
  });
});

// --------------------------------------------------------------------------
// isTestResultEvent
// --------------------------------------------------------------------------
describe('isTestResultEvent', () => {
  it('returns true for an event with type "test_result"', () => {
    const event: TestResultEvent = {
      type: 'test_result',
      data: {
        skillName: 'my-skill',
        score: 0.85,
        passed: ['Returns valid JSON', 'Handles edge cases'],
        failed: ['Exceeds token limit'],
        suggestions: ['Reduce system prompt length'],
        sampleOutput: '{"result": "ok"}',
      },
    };
    expect(isTestResultEvent(event)).toBe(true);
  });

  it('returns false for an event with type "tool_use"', () => {
    const event = {
      type: 'tool_use' as const,
      data: { toolCallId: 'tc-1', toolName: 'test_skill', toolInput: {} },
    };
    expect(isTestResultEvent(event)).toBe(false);
  });

  it('returns false for an event with type "skill_preview"', () => {
    const event = {
      type: 'skill_preview' as const,
      data: {
        skillName: 'my-skill',
        frontmatter: {},
        content: '',
        isUpdate: false,
      },
    };
    expect(isTestResultEvent(event)).toBe(false);
  });

  it('correctly narrows the type so data fields are accessible', () => {
    const event = {
      type: 'test_result' as const,
      data: {
        skillName: 'pr-review',
        score: 0.9,
        passed: ['test-a'],
        failed: [],
        suggestions: [],
        sampleOutput: 'LGTM',
      },
    };
    if (isTestResultEvent(event)) {
      expect(event.data.score).toBe(0.9);
      expect(event.data.passed).toContain('test-a');
      expect(event.data.failed).toHaveLength(0);
    } else {
      throw new Error('Expected isTestResultEvent to return true');
    }
  });
});

// --------------------------------------------------------------------------
// isSkillSavedEvent
// --------------------------------------------------------------------------
describe('isSkillSavedEvent', () => {
  it('returns true for an event with type "skill_saved"', () => {
    const event: SkillSavedEvent = {
      type: 'skill_saved',
      data: {
        skillName: 'my-skill',
        templateId: 'tpl-abc123',
      },
    };
    expect(isSkillSavedEvent(event)).toBe(true);
  });

  it('returns true for skill_saved without templateId (optional field)', () => {
    const event: SkillSavedEvent = {
      type: 'skill_saved',
      data: { skillName: 'minimal-skill' },
    };
    expect(isSkillSavedEvent(event)).toBe(true);
  });

  it('returns false for an event with type "message_stop"', () => {
    const event = {
      type: 'message_stop' as const,
      data: { messageId: 'msg-1', stopReason: 'end_turn' as const },
    };
    expect(isSkillSavedEvent(event)).toBe(false);
  });

  it('returns false for an event with type "skill_preview"', () => {
    const event = {
      type: 'skill_preview' as const,
      data: {
        skillName: 'my-skill',
        frontmatter: {},
        content: '',
        isUpdate: false,
      },
    };
    expect(isSkillSavedEvent(event)).toBe(false);
  });

  it('correctly narrows the type so data fields are accessible', () => {
    const event = {
      type: 'skill_saved' as const,
      data: { skillName: 'deploy-prod', templateId: 'tpl-xyz' },
    };
    if (isSkillSavedEvent(event)) {
      expect(event.data.skillName).toBe('deploy-prod');
      expect(event.data.templateId).toBe('tpl-xyz');
    } else {
      throw new Error('Expected isSkillSavedEvent to return true');
    }
  });
});

// --------------------------------------------------------------------------
// Cross-guard isolation: each guard rejects the other skill event types
// --------------------------------------------------------------------------
describe('Cross-guard isolation', () => {
  const skillPreview = { type: 'skill_preview' as const, data: {} };
  const testResult = { type: 'test_result' as const, data: {} };
  const skillSaved = { type: 'skill_saved' as const, data: {} };

  it('isSkillPreviewEvent rejects test_result and skill_saved', () => {
    expect(isSkillPreviewEvent(testResult)).toBe(false);
    expect(isSkillPreviewEvent(skillSaved)).toBe(false);
  });

  it('isTestResultEvent rejects skill_preview and skill_saved', () => {
    expect(isTestResultEvent(skillPreview)).toBe(false);
    expect(isTestResultEvent(skillSaved)).toBe(false);
  });

  it('isSkillSavedEvent rejects skill_preview and test_result', () => {
    expect(isSkillSavedEvent(skillPreview)).toBe(false);
    expect(isSkillSavedEvent(testResult)).toBe(false);
  });
});
