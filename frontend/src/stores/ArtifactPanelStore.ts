'use client';

import { makeAutoObservable, observable, computed } from 'mobx';

export type LayoutMode = 'chat-first' | 'chat-artifact' | 'canvas-first';

export interface ArtifactTab {
  id: string;
  type: 'note' | 'issue' | 'issue-list' | 'project' | 'members' | 'settings';
  entityId: string;
  title: string;
  isPinned: boolean;
}

export class ArtifactPanelStore {
  openTabs: ArtifactTab[] = [];
  activeTabId: string | null = null;
  pinnedTabIds: Set<string> = new Set<string>();

  constructor() {
    makeAutoObservable(this, {
      pinnedTabIds: observable,
      activeTab: computed,
      hasOpenTabs: computed,
      tabCount: computed,
    });
  }

  get activeTab(): ArtifactTab | undefined {
    return this.openTabs.find((tab) => tab.id === this.activeTabId);
  }

  get hasOpenTabs(): boolean {
    return this.openTabs.length > 0;
  }

  get tabCount(): number {
    return this.openTabs.length;
  }

  openTab(tab: Omit<ArtifactTab, 'isPinned'>): void {
    const existing = this.openTabs.find((t) => t.id === tab.id);
    if (existing) {
      this.activeTabId = tab.id;
      return;
    }

    this.openTabs.push({ ...tab, isPinned: false });
    this.activeTabId = tab.id;
  }

  closeTab(tabId: string): void {
    const index = this.openTabs.findIndex((t) => t.id === tabId);
    if (index === -1) return;

    this.openTabs.splice(index, 1);
    this.pinnedTabIds.delete(tabId);

    if (this.activeTabId === tabId) {
      const prev = this.openTabs[Math.max(0, index - 1)];
      this.activeTabId = prev?.id ?? null;
    }
  }

  setActiveTab(tabId: string): void {
    if (this.openTabs.some((t) => t.id === tabId)) {
      this.activeTabId = tabId;
    }
  }

  pinTab(tabId: string): void {
    const tab = this.openTabs.find((t) => t.id === tabId);
    if (tab) {
      tab.isPinned = true;
      this.pinnedTabIds.add(tabId);
    }
  }

  unpinTab(tabId: string): void {
    const tab = this.openTabs.find((t) => t.id === tabId);
    if (tab) {
      tab.isPinned = false;
      this.pinnedTabIds.delete(tabId);
    }
  }

  closeAllUnpinned(): void {
    this.openTabs = this.openTabs.filter((t) => this.pinnedTabIds.has(t.id));
    if (this.activeTabId && !this.openTabs.some((t) => t.id === this.activeTabId)) {
      this.activeTabId = this.openTabs[0]?.id ?? null;
    }
  }

  reset(): void {
    this.openTabs = [];
    this.activeTabId = null;
    this.pinnedTabIds.clear();
  }
}
