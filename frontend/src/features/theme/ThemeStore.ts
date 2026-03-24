import { makeAutoObservable, runInAction } from 'mobx';
import { THEME_LIGHT, THEME_DARK, THEME_HIGH_CONTRAST } from '@/features/editor/themes/pilotSpaceTheme';
import { applyAccentColor } from './accent-colors';
import type { ThemeMode, AccentColor, ThemePreferences } from './types';
import { DEFAULT_PREFERENCES } from './types';

const STORAGE_KEY = 'pilot-theme-prefs';

/**
 * MobX store for theme state management.
 *
 * Tracks themeMode, accentColor, editorThemeId, fontSize, fontFamily
 * as observables. Persists to localStorage.
 */
export class ThemeStore {
  themeMode: ThemeMode = DEFAULT_PREFERENCES.themeMode;
  accentColor: AccentColor = DEFAULT_PREFERENCES.accentColor;
  editorThemeId: string | null = DEFAULT_PREFERENCES.editorThemeId;
  fontSize: number = DEFAULT_PREFERENCES.fontSize;
  fontFamily: string = DEFAULT_PREFERENCES.fontFamily;

  constructor() {
    makeAutoObservable(this);
    this.loadFromLocalStorage();
    this.applyCurrentAccent();
  }

  /**
   * Resolves 'system' to 'light' or 'dark' based on matchMedia.
   * Returns the raw mode for 'light', 'dark', 'high-contrast'.
   */
  get resolvedMode(): 'light' | 'dark' | 'high-contrast' {
    if (this.themeMode === 'system') {
      if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
      return 'light';
    }
    if (this.themeMode === 'high-contrast') return 'high-contrast';
    return this.themeMode;
  }

  /**
   * Returns the Monaco theme name to use.
   * Custom editorThemeId takes priority; otherwise maps resolvedMode.
   */
  get effectiveMonacoTheme(): string {
    if (this.editorThemeId) return this.editorThemeId;
    switch (this.resolvedMode) {
      case 'dark':
        return THEME_DARK;
      case 'high-contrast':
        return THEME_HIGH_CONTRAST;
      default:
        return THEME_LIGHT;
    }
  }

  setThemeMode(mode: ThemeMode): void {
    this.themeMode = mode;
    this.applyCurrentAccent();
    this.saveToLocalStorage();
  }

  setAccentColor(color: AccentColor): void {
    this.accentColor = color;
    this.applyCurrentAccent();
    this.saveToLocalStorage();
  }

  setEditorThemeId(id: string | null): void {
    this.editorThemeId = id;
    this.saveToLocalStorage();
  }

  setFontSize(size: number): void {
    this.fontSize = size;
    this.saveToLocalStorage();
  }

  setFontFamily(family: string): void {
    this.fontFamily = family;
    this.saveToLocalStorage();
  }

  /**
   * Merge server-provided preferences over current state.
   * Only provided fields are overridden.
   */
  hydrateFromServer(prefs: Partial<ThemePreferences>): void {
    runInAction(() => {
      if (prefs.themeMode !== undefined) this.themeMode = prefs.themeMode;
      if (prefs.accentColor !== undefined) this.accentColor = prefs.accentColor;
      if (prefs.editorThemeId !== undefined) this.editorThemeId = prefs.editorThemeId;
      if (prefs.fontSize !== undefined) this.fontSize = prefs.fontSize;
      if (prefs.fontFamily !== undefined) this.fontFamily = prefs.fontFamily;
    });
    this.applyCurrentAccent();
    this.saveToLocalStorage();
  }

  /**
   * Load preferences from localStorage.
   */
  loadFromLocalStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<ThemePreferences>;
      runInAction(() => {
        if (saved.themeMode) this.themeMode = saved.themeMode;
        if (saved.accentColor) this.accentColor = saved.accentColor;
        if (saved.editorThemeId !== undefined) this.editorThemeId = saved.editorThemeId;
        if (saved.fontSize) this.fontSize = saved.fontSize;
        if (saved.fontFamily) this.fontFamily = saved.fontFamily;
      });
    } catch {
      // Corrupted localStorage -- use defaults
    }
  }

  /**
   * Persist current preferences to localStorage.
   */
  saveToLocalStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      const prefs: ThemePreferences = {
        themeMode: this.themeMode,
        accentColor: this.accentColor,
        editorThemeId: this.editorThemeId,
        fontSize: this.fontSize,
        fontFamily: this.fontFamily,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // localStorage full or unavailable
    }
  }

  private applyCurrentAccent(): void {
    const cssMode = this.resolvedMode === 'high-contrast' ? 'dark' : this.resolvedMode;
    applyAccentColor(this.accentColor, cssMode);
  }
}
