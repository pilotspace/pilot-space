'use client';

import { useEffect, useState } from 'react';
import { checkForUpdates, downloadAndInstallUpdate, type UpdateInfo } from '@/lib/tauri';
import { Button } from '@/components/ui/button';
import { X, Download, RefreshCw } from 'lucide-react';

type UpdateState = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'dismissed';

/**
 * Non-blocking in-app update notification banner (Phase 38).
 *
 * Checks for updates on mount (5s delay to avoid competing with app init),
 * shows a subtle muted banner when a new version is available, and
 * downloads/installs in the background. Installs on next app restart —
 * does NOT force-restart the app.
 *
 * Design: warm, capable, collaborative — informative, not alarming.
 * Renders nothing when idle, checking, or dismissed.
 *
 * Mount in workspace layout via dynamic import (ssr: false), conditionally
 * on isTauri() — this component uses Tauri APIs unavailable in browser/SSG.
 */
export function UpdateNotification() {
  const [state, setState] = useState<UpdateState>('idle');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    const doCheck = async () => {
      setState('checking');
      const info = await checkForUpdates();
      if (cancelled) return;
      if (info?.available) {
        setUpdateInfo(info);
        setState('available');
      } else {
        setState('idle');
      }
    };
    // Check on mount (app launch) — delay 5 seconds to not compete with app initialization
    const timer = setTimeout(doCheck, 5000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const handleUpdate = async () => {
    setState('downloading');
    try {
      await downloadAndInstallUpdate();
      setState('ready');
    } catch (e) {
      console.error('[update] Download failed:', e);
      setState('available'); // revert to allow retry
    }
  };

  if (state === 'idle' || state === 'checking' || state === 'dismissed') return null;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/50 px-4 py-2 text-sm">
      <div className="flex items-center gap-2">
        <Download className="h-4 w-4 text-primary" />
        {state === 'available' && (
          <span>
            A new version <strong>v{updateInfo?.version}</strong> is available.
          </span>
        )}
        {state === 'downloading' && (
          <span className="flex items-center gap-2">
            <RefreshCw className="h-3 w-3 animate-spin" />
            Downloading update...
          </span>
        )}
        {state === 'ready' && <span>Update downloaded. Restart the app to apply.</span>}
      </div>
      <div className="flex items-center gap-2">
        {state === 'available' && (
          <Button size="sm" variant="default" onClick={handleUpdate}>
            Update
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setState('dismissed')}
          aria-label="Dismiss update notification"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
