'use client';

import { useEffect, useState } from 'react';
import { autorun } from 'mobx';
import { definePilotSpaceThemes, THEME_LIGHT, THEME_DARK, THEME_HIGH_CONTRAST } from '../themes/pilotSpaceTheme';
import { useThemeStore } from '@/stores/RootStore';

const BUILTIN_THEMES = new Set([THEME_LIGHT, THEME_DARK, THEME_HIGH_CONTRAST]);

/**
 * Hook that registers Pilot Space Monaco themes and tracks the active theme.
 *
 * Reads from ThemeStore.effectiveMonacoTheme (MobX reactive) for theme selection.
 * Falls back to DOM class observation when ThemeStore is not yet available.
 * Custom editor themes (from .tmTheme imports) are assumed to already be
 * registered with Monaco by the AppearanceSettingsPage preview.
 */
export function useMonacoTheme(monaco: typeof import('monaco-editor') | null): string {
  const themeStore = useThemeStore();

  const [currentTheme, setCurrentTheme] = useState<string>(() => {
    // Read from ThemeStore if available, otherwise fall back to DOM
    if (themeStore) return themeStore.effectiveMonacoTheme;
    if (typeof document === 'undefined') return THEME_LIGHT;
    return document.documentElement.classList.contains('dark') ? THEME_DARK : THEME_LIGHT;
  });

  // Register built-in themes once when monaco becomes available
  useEffect(() => {
    if (!monaco) return;
    definePilotSpaceThemes(monaco);
  }, [monaco]);

  // React to ThemeStore.effectiveMonacoTheme changes via MobX autorun
  useEffect(() => {
    if (!themeStore) return;

    const dispose = autorun(() => {
      const theme = themeStore.effectiveMonacoTheme;
      // Set theme regardless of whether it's built-in or custom
      // Custom themes should already be registered with Monaco by the appearance settings page
      if (BUILTIN_THEMES.has(theme) || !monaco) {
        setCurrentTheme(theme);
      } else {
        // Custom theme -- set it (it should already be registered with Monaco)
        setCurrentTheme(theme);
      }
    });

    return dispose;
  }, [themeStore, monaco]);

  // Fallback: watch for theme class changes on <html> when ThemeStore is unavailable
  useEffect(() => {
    if (themeStore) return; // ThemeStore handles it
    if (typeof document === 'undefined') return;

    const observer = new MutationObserver(() => {
      const isDark = document.documentElement.classList.contains('dark');
      const isHC = document.documentElement.classList.contains('high-contrast');
      if (isHC) {
        setCurrentTheme(THEME_HIGH_CONTRAST);
      } else {
        setCurrentTheme(isDark ? THEME_DARK : THEME_LIGHT);
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, [themeStore]);

  return currentTheme;
}
