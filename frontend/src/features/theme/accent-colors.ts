import type { AccentColor, AccentPreset } from './types';

/**
 * 8 accent color presets with light/dark mode hex values.
 * Hover and muted values are hardcoded for CSS performance.
 */
export const ACCENT_PRESETS: Record<AccentColor, AccentPreset> = {
  green: {
    id: 'green',
    label: 'Green',
    lightHex: '#29a386',
    darkHex: '#3db896',
    hoverLight: '#238f75',
    hoverDark: '#35a585',
    mutedLight: '#e8f5f1',
    mutedDark: '#1a3d33',
  },
  blue: {
    id: 'blue',
    label: 'Blue',
    lightHex: '#3b82f6',
    darkHex: '#60a5fa',
    hoverLight: '#2563eb',
    hoverDark: '#3b82f6',
    mutedLight: '#eff6ff',
    mutedDark: '#1e3a5f',
  },
  purple: {
    id: 'purple',
    label: 'Purple',
    lightHex: '#8b5cf6',
    darkHex: '#a78bfa',
    hoverLight: '#7c3aed',
    hoverDark: '#8b5cf6',
    mutedLight: '#f5f3ff',
    mutedDark: '#2e1f5e',
  },
  orange: {
    id: 'orange',
    label: 'Orange',
    lightHex: '#f97316',
    darkHex: '#fb923c',
    hoverLight: '#ea580c',
    hoverDark: '#f97316',
    mutedLight: '#fff7ed',
    mutedDark: '#4a2512',
  },
  pink: {
    id: 'pink',
    label: 'Pink',
    lightHex: '#ec4899',
    darkHex: '#f472b6',
    hoverLight: '#db2777',
    hoverDark: '#ec4899',
    mutedLight: '#fdf2f8',
    mutedDark: '#4a1942',
  },
  red: {
    id: 'red',
    label: 'Red',
    lightHex: '#ef4444',
    darkHex: '#f87171',
    hoverLight: '#dc2626',
    hoverDark: '#ef4444',
    mutedLight: '#fef2f2',
    mutedDark: '#4a1414',
  },
  teal: {
    id: 'teal',
    label: 'Teal',
    lightHex: '#14b8a6',
    darkHex: '#2dd4bf',
    hoverLight: '#0d9488',
    hoverDark: '#14b8a6',
    mutedLight: '#f0fdfa',
    mutedDark: '#134e4a',
  },
  indigo: {
    id: 'indigo',
    label: 'Indigo',
    lightHex: '#6366f1',
    darkHex: '#818cf8',
    hoverLight: '#4f46e5',
    hoverDark: '#6366f1',
    mutedLight: '#eef2ff',
    mutedDark: '#1e1b4b',
  },
};

/**
 * Apply accent color CSS custom properties to :root.
 * Updates --primary, --primary-hover, --primary-muted, --ring,
 * --sidebar-primary, --sidebar-ring, and --editorCursor.
 */
export function applyAccentColor(color: AccentColor, mode: 'light' | 'dark'): void {
  if (typeof document === 'undefined') return;

  const preset = ACCENT_PRESETS[color];
  const hex = mode === 'dark' ? preset.darkHex : preset.lightHex;
  const hover = mode === 'dark' ? preset.hoverDark : preset.hoverLight;
  const muted = mode === 'dark' ? preset.mutedDark : preset.mutedLight;

  const root = document.documentElement.style;
  root.setProperty('--primary', hex);
  root.setProperty('--primary-hover', hover);
  root.setProperty('--primary-muted', muted);
  root.setProperty('--ring', hex);
  root.setProperty('--sidebar-primary', hex);
  root.setProperty('--sidebar-ring', hex);
  root.setProperty('--primary-text', hex);
  root.setProperty('--success', hex);
}
