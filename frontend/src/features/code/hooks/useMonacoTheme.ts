'use client';

import { useEffect, useState } from 'react';
import { PILOT_SPACE_LIGHT, PILOT_SPACE_DARK } from '../themes/pilotSpaceTheme';

/**
 * useMonacoTheme — React hook that returns the current Monaco theme name.
 *
 * Observes the `.dark` CSS class on `<html>` via MutationObserver to react
 * to theme changes driven by the system or user preference.
 *
 * Returns PILOT_SPACE_DARK when the `dark` class is present, PILOT_SPACE_LIGHT otherwise.
 *
 * Note: ThemeStore integration is deferred to a later phase. This implementation
 * is intentionally simple and has no MobX dependency.
 */
export function useMonacoTheme(): { theme: string } {
  const [theme, setTheme] = useState<string>(() => {
    // SSR-safe: document may not exist during server render
    if (typeof document === 'undefined') return PILOT_SPACE_LIGHT;
    return document.documentElement.classList.contains('dark')
      ? PILOT_SPACE_DARK
      : PILOT_SPACE_LIGHT;
  });

  useEffect(() => {
    if (typeof document === 'undefined') return;

    // Sync immediately in case the class changed between SSR and hydration
    const isDark = document.documentElement.classList.contains('dark');
    setTheme(isDark ? PILOT_SPACE_DARK : PILOT_SPACE_LIGHT);

    // Watch for subsequent class changes on <html>
    const observer = new MutationObserver(() => {
      const dark = document.documentElement.classList.contains('dark');
      setTheme(dark ? PILOT_SPACE_DARK : PILOT_SPACE_LIGHT);
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  return { theme };
}
