import type * as monaco from 'monaco-editor';

export const THEME_LIGHT = 'pilot-space';
export const THEME_DARK = 'pilot-space-dark';

/**
 * Registers Pilot Space light and dark themes with a Monaco editor instance.
 * Call once after Monaco is loaded (e.g., in `beforeMount` of @monaco-editor/react).
 */
export function definePilotSpaceThemes(monacoInstance: typeof monaco): void {
  monacoInstance.editor.defineTheme(THEME_LIGHT, {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '6366f1' },
      { token: 'string', foreground: '059669' },
      { token: 'comment', foreground: '9ca3af', fontStyle: 'italic' },
      { token: 'number', foreground: 'd97706' },
      { token: 'type', foreground: '0891b2' },
      { token: 'function', foreground: '7c3aed' },
      { token: 'heading', foreground: '37352f', fontStyle: 'bold' },
      { token: 'emphasis', fontStyle: 'italic' },
      { token: 'strong', fontStyle: 'bold' },
    ],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#37352f',
      'editor.lineHighlightBackground': '#f7f7f5',
      'editor.selectionBackground': '#e8f5f1',
      'editorCursor.foreground': '#29a386',
      'editorGhostText.foreground': '#6b8fad',
      'editorLineNumber.foreground': '#9b9b9b',
      'editorWidget.background': '#ffffff',
      'editorSuggestWidget.background': '#ffffff',
      'editorSuggestWidget.border': '#e9e9e7',
    },
  });

  monacoInstance.editor.defineTheme(THEME_DARK, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '818cf8' },
      { token: 'string', foreground: '34d399' },
      { token: 'comment', foreground: '6b7280', fontStyle: 'italic' },
      { token: 'number', foreground: 'fbbf24' },
      { token: 'type', foreground: '22d3ee' },
      { token: 'function', foreground: 'a78bfa' },
      { token: 'heading', foreground: 'ebebeb', fontStyle: 'bold' },
      { token: 'emphasis', fontStyle: 'italic' },
      { token: 'strong', fontStyle: 'bold' },
    ],
    colors: {
      'editor.background': '#191919',
      'editor.foreground': '#ebebeb',
      'editor.lineHighlightBackground': '#222222',
      'editor.selectionBackground': '#1f3d35',
      'editorCursor.foreground': '#3db896',
      'editorGhostText.foreground': '#7da3c1',
      'editorLineNumber.foreground': '#9b9b9b',
      'editorWidget.background': '#1e1e1e',
      'editorSuggestWidget.background': '#1e1e1e',
      'editorSuggestWidget.border': '#333333',
    },
  });
}
