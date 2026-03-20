'use client';

import { observer } from 'mobx-react-lite';
import { useRef, useEffect } from 'react';
import { Terminal as TerminalIcon, X } from 'lucide-react';
import { useTerminalStore } from '@/stores/RootStore';
import { useTerminal } from '../hooks/useTerminal';
import { isTauri } from '@/lib/tauri';

/**
 * TerminalPanel — a toggleable bottom panel embedding an xterm.js terminal.
 *
 * - Only renders inside the Tauri desktop app (isTauri() gate)
 * - Visibility is controlled by terminalStore.isOpen
 * - Panel height is stored in terminalStore.panelHeight
 * - Keyboard shortcut Ctrl+` toggles the panel
 * - Close button hides the panel but does NOT destroy the PTY session
 *
 * The xterm.js lifecycle (Terminal instance, PTY session, resize) is
 * managed entirely by the useTerminal hook.
 */
export const TerminalPanel = observer(function TerminalPanel() {
  const terminalStore = useTerminalStore();
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Wire the xterm.js lifecycle — hook manages everything internally
  useTerminal(containerRef);

  // Global keyboard shortcut: Ctrl+` toggles the terminal panel
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      // Ctrl+` — ignore when typing in an input or textarea
      if (
        event.ctrlKey &&
        event.key === '`' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        event.preventDefault();
        terminalStore.toggle();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [terminalStore]);

  // Terminal is desktop-only — never render in web/browser mode
  if (!isTauri()) return null;

  // Panel is hidden — render nothing (PTY session is preserved by the hook's ref)
  if (!terminalStore.isOpen) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 flex flex-col border-t border-border bg-[#1a1b26]"
      style={{ height: terminalStore.panelHeight }}
    >
      {/* Header bar */}
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-border bg-muted/80 px-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <TerminalIcon className="h-3.5 w-3.5" />
          <span>Terminal</span>
        </div>
        <button
          onClick={() => terminalStore.close()}
          aria-label="Close terminal"
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* xterm.js mount point — must always be present when panel is open */}
      <div ref={containerRef} className="min-h-0 flex-1 overflow-hidden" />
    </div>
  );
});
