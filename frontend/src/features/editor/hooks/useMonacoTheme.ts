'use client';

import { useEffect, useState } from 'react';
import { definePilotSpaceThemes, THEME_LIGHT, THEME_DARK } from '../themes/pilotSpaceTheme';

/**
 * Hook that registers Pilot Space Monaco themes and tracks the active theme.
 *
 * Detects dark/light mode from the `<html>` element's `dark` class
 * (standard next-themes pattern) and listens for changes via MutationObserver.
 */
export function useMonacoTheme(monaco: typeof import('monaco-editor') | null): string {
  const [currentTheme, setCurrentTheme] = useState<string>(() => {
    if (typeof document === 'undefined') return THEME_LIGHT;
    return document.documentElement.classList.contains('dark') ? THEME_DARK : THEME_LIGHT;
  });

  // Register themes once when monaco becomes available
  useEffect(() => {
    if (!monaco) return;
    definePilotSpaceThemes(monaco);
  }, [monaco]);

  // Watch for theme class changes on <html>
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const observer = new MutationObserver(() => {
      const isDark = document.documentElement.classList.contains('dark');
      setCurrentTheme(isDark ? THEME_DARK : THEME_LIGHT);
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  return currentTheme;
}
