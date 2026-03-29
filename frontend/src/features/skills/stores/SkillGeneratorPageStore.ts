/**
 * SkillGeneratorPageStore - MobX store for the unified /skills/generator page.
 *
 * Manages chat messages, skill content, preview panel state, and edit mode.
 * NOT connected to PilotSpaceStore — instantiated per page via useMemo.
 *
 * @module features/skills/stores/SkillGeneratorPageStore
 */

import { makeAutoObservable } from 'mobx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export class SkillGeneratorPageStore {
  chatMessages: ChatMessage[] = [];
  skillContent: string = '';
  skillName: string = '';
  skillDescription: string = '';
  skillCategory: string = 'custom';
  isStreaming: boolean = false;
  isPreviewOpen: boolean = false;
  isDirty: boolean = false;
  editingTemplateId: string | null = null;
  editingTemplateName: string | null = null;

  constructor() {
    makeAutoObservable(this);
    this._addWelcomeMessage();
  }

  // ── Actions ─────────────────────────────────────────────────────────────

  addUserMessage(content: string): void {
    this.chatMessages.push({
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: 'user',
      content,
      timestamp: new Date(),
    });
  }

  addAssistantMessage(content: string): void {
    this.chatMessages.push({
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: 'assistant',
      content,
      timestamp: new Date(),
    });
  }

  appendToLastAssistant(chunk: string): void {
    const last = this.chatMessages[this.chatMessages.length - 1];
    if (last?.role === 'assistant') {
      last.content += chunk;
    }
  }

  setSkillContent(content: string): void {
    this.skillContent = content;
    this.isDirty = true;
  }

  setSkillName(name: string): void {
    this.skillName = name;
    this.isDirty = true;
  }

  setSkillDescription(description: string): void {
    this.skillDescription = description;
    this.isDirty = true;
  }

  setSkillCategory(category: string): void {
    this.skillCategory = category;
    this.isDirty = true;
  }

  togglePreview(): void {
    this.isPreviewOpen = !this.isPreviewOpen;
  }

  markClean(): void {
    this.isDirty = false;
  }

  markDirty(): void {
    this.isDirty = true;
  }

  setEditMode(templateId: string, name: string): void {
    this.editingTemplateId = templateId;
    this.editingTemplateName = name;
    this.skillName = name;
    // Replace welcome message with edit-mode welcome
    this.chatMessages = [
      {
        id: 'welcome',
        role: 'assistant',
        content: `Editing **${name}**. What would you like to change?`,
        timestamp: new Date(),
      },
    ];
  }

  setStreaming(streaming: boolean): void {
    this.isStreaming = streaming;
  }

  reset(): void {
    this.chatMessages = [];
    this.skillContent = '';
    this.skillName = '';
    this.skillDescription = '';
    this.skillCategory = 'custom';
    this.isStreaming = false;
    this.isPreviewOpen = false;
    this.isDirty = false;
    this.editingTemplateId = null;
    this.editingTemplateName = null;
    this._addWelcomeMessage();
  }

  // ── Computed ────────────────────────────────────────────────────────────

  get hasContent(): boolean {
    return this.skillContent.length > 0;
  }

  get messageCount(): number {
    return this.chatMessages.length;
  }

  get canSave(): boolean {
    return this.skillName.trim().length > 0 && this.skillContent.length > 0;
  }

  get isEditMode(): boolean {
    return this.editingTemplateId !== null;
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private _addWelcomeMessage(): void {
    this.chatMessages.push({
      id: 'welcome',
      role: 'assistant',
      content: 'What kind of skill would you like to create?',
      timestamp: new Date(),
    });
  }
}
