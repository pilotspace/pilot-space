import { describe, it, expect } from 'vitest';
import {
  isSkillDraftEvent,
  isSkillPreviewEvent,
  isSkillSavedEvent,
  isGraphUpdateEvent,
} from '../types/events-skill-gen';
import type { SSEEvent } from '../types/events';
import { SkillGeneratorStore } from '../SkillGeneratorStore';

describe('Skill Generator SSE Event Type Guards', () => {
  it('isSkillDraftEvent returns true for skill_draft events', () => {
    const event = {
      type: 'skill_draft',
      data: { sessionId: '1', content: 'test', isPartial: true },
    } as SSEEvent;
    expect(isSkillDraftEvent(event)).toBe(true);
  });

  it('isSkillDraftEvent returns false for other events', () => {
    expect(isSkillDraftEvent({ type: 'text_delta', data: {} } as SSEEvent)).toBe(false);
  });

  it('isSkillPreviewEvent returns true for skill_preview events', () => {
    expect(isSkillPreviewEvent({ type: 'skill_preview', data: {} } as SSEEvent)).toBe(true);
  });

  it('isSkillPreviewEvent returns false for other events', () => {
    expect(isSkillPreviewEvent({ type: 'message_start', data: {} } as SSEEvent)).toBe(false);
  });

  it('isSkillSavedEvent returns true for skill_saved events', () => {
    expect(isSkillSavedEvent({ type: 'skill_saved', data: {} } as SSEEvent)).toBe(true);
  });

  it('isSkillSavedEvent returns false for other events', () => {
    expect(isSkillSavedEvent({ type: 'error', data: {} } as SSEEvent)).toBe(false);
  });

  it('isGraphUpdateEvent returns true for graph_update events', () => {
    expect(isGraphUpdateEvent({ type: 'graph_update', data: {} } as SSEEvent)).toBe(true);
  });

  it('isGraphUpdateEvent returns false for other events', () => {
    expect(isGraphUpdateEvent({ type: 'tool_use', data: {} } as SSEEvent)).toBe(false);
  });
});

describe('SkillGeneratorStore', () => {
  it('starts with null currentDraft and default state', () => {
    const store = new SkillGeneratorStore();
    expect(store.currentDraft).toBeNull();
    expect(store.isGenerating).toBe(false);
    expect(store.isPreviewVisible).toBe(false);
    expect(store.isSaveDialogOpen).toBe(false);
    expect(store.lastSaved).toBeNull();
    expect(store.streamingContent).toBe('');
  });

  it('handleSkillDraft sets isGenerating and streamingContent', () => {
    const store = new SkillGeneratorStore();
    store.handleSkillDraft({ sessionId: '1', content: 'partial content', isPartial: true });
    expect(store.isGenerating).toBe(true);
    expect(store.streamingContent).toBe('partial content');
  });

  it('handleSkillDraft with isPartial=false updates existing draft skillContent', () => {
    const store = new SkillGeneratorStore();
    // Set up a draft first
    store.handleSkillPreview({
      sessionId: '1',
      name: 'Test',
      description: '',
      category: '',
      icon: '',
      skillContent: 'old content',
      examplePrompts: [],
      contextRequirements: [],
      toolDeclarations: [],
      graphData: null,
    });
    // Now send a non-partial draft update
    store.handleSkillDraft({ sessionId: '1', content: 'final content', isPartial: false });
    expect(store.currentDraft!.skillContent).toBe('final content');
  });

  it('handleSkillPreview sets currentDraft and shows preview', () => {
    const store = new SkillGeneratorStore();
    store.handleSkillPreview({
      sessionId: '1',
      name: 'Test Skill',
      description: 'A test skill',
      category: 'development',
      icon: 'Wand2',
      skillContent: '# Test',
      examplePrompts: ['test prompt'],
      contextRequirements: ['source code'],
      toolDeclarations: [],
      graphData: null,
    });
    expect(store.currentDraft).not.toBeNull();
    expect(store.currentDraft!.name).toBe('Test Skill');
    expect(store.currentDraft!.description).toBe('A test skill');
    expect(store.currentDraft!.category).toBe('development');
    expect(store.currentDraft!.icon).toBe('Wand2');
    expect(store.currentDraft!.skillContent).toBe('# Test');
    expect(store.currentDraft!.examplePrompts).toEqual(['test prompt']);
    expect(store.currentDraft!.contextRequirements).toEqual(['source code']);
    expect(store.currentDraft!.graphData).toBeNull();
    expect(store.isPreviewVisible).toBe(true);
    expect(store.isGenerating).toBe(false);
    expect(store.streamingContent).toBe('');
  });

  it('handleSkillSaved clears draft and sets lastSaved', () => {
    const store = new SkillGeneratorStore();
    // First set up a draft
    store.handleSkillPreview({
      sessionId: '1',
      name: 'Test',
      description: '',
      category: '',
      icon: '',
      skillContent: '',
      examplePrompts: [],
      contextRequirements: [],
      toolDeclarations: [],
      graphData: null,
    });
    expect(store.currentDraft).not.toBeNull();
    // Then save
    store.handleSkillSaved({ skillId: 'abc', skillName: 'Test', saveType: 'personal' });
    expect(store.currentDraft).toBeNull();
    expect(store.isPreviewVisible).toBe(false);
    expect(store.isSaveDialogOpen).toBe(false);
    expect(store.lastSaved).toEqual({
      skillId: 'abc',
      skillName: 'Test',
      saveType: 'personal',
    });
  });

  it('handleGraphUpdate is a no-op without a draft', () => {
    const store = new SkillGeneratorStore();
    // Should not throw
    store.handleGraphUpdate({
      sessionId: '1',
      operation: 'add_node',
      payload: { id: 'n1' },
    });
    expect(store.currentDraft).toBeNull();
  });

  it('UI actions toggle dialog and preview state', () => {
    const store = new SkillGeneratorStore();
    store.openSaveDialog();
    expect(store.isSaveDialogOpen).toBe(true);
    store.closeSaveDialog();
    expect(store.isSaveDialogOpen).toBe(false);

    store.handleSkillPreview({
      sessionId: '1',
      name: 'Test',
      description: '',
      category: '',
      icon: '',
      skillContent: '',
      examplePrompts: [],
      contextRequirements: [],
      toolDeclarations: [],
      graphData: null,
    });
    expect(store.isPreviewVisible).toBe(true);
    store.dismissPreview();
    expect(store.isPreviewVisible).toBe(false);
  });

  it('clearLastSaved clears lastSaved', () => {
    const store = new SkillGeneratorStore();
    store.handleSkillSaved({ skillId: 'abc', skillName: 'Test', saveType: 'workspace' });
    expect(store.lastSaved).not.toBeNull();
    store.clearLastSaved();
    expect(store.lastSaved).toBeNull();
  });

  it('reset() clears all state', () => {
    const store = new SkillGeneratorStore();
    store.handleSkillDraft({ sessionId: '1', content: 'test', isPartial: true });
    store.openSaveDialog();
    store.reset();
    expect(store.currentDraft).toBeNull();
    expect(store.streamingContent).toBe('');
    expect(store.isGenerating).toBe(false);
    expect(store.isPreviewVisible).toBe(false);
    expect(store.isSaveDialogOpen).toBe(false);
    expect(store.lastSaved).toBeNull();
  });
});
