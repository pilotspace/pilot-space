/**
 * AddPluginDialog - Modal for installing a plugin from a GitHub repo.
 *
 * Contains: repo URL input, optional PAT input, Install button.
 * Installs all skills from the repo at once.
 */

'use client';

import * as React from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useStore } from '@/stores';
import { toast } from 'sonner';

interface AddPluginDialogProps {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AddPluginDialog = observer(function AddPluginDialog({
  workspaceId,
  open,
  onOpenChange,
}: AddPluginDialogProps) {
  const { ai } = useStore();
  const pluginsStore = ai.plugins;
  const [repoUrl, setRepoUrl] = React.useState('');
  const [pat, setPat] = React.useState('');
  const [localError, setLocalError] = React.useState<string | null>(null);

  const handleInstall = async () => {
    if (!repoUrl.trim()) return;
    setLocalError(null);

    const success = await pluginsStore.installAllFromRepo(
      workspaceId,
      repoUrl.trim(),
      pat.trim() || undefined
    );

    if (success) {
      const group = pluginsStore.groupedPlugins.find((g) => g.repoUrl === repoUrl.trim());
      const count = group?.skillCount ?? 0;
      toast.success(`Plugin installed — ${count} skill${count !== 1 ? 's' : ''} detected`);
      setRepoUrl('');
      setPat('');
      onOpenChange(false);
    } else {
      setLocalError(pluginsStore.error ?? 'Installation failed');
    }
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      setRepoUrl('');
      setPat('');
      setLocalError(null);
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Add Plugin</DialogTitle>
          <DialogDescription>Install a plugin from a GitHub repository.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="add-plugin-url">Repository URL</Label>
            <Input
              id="add-plugin-url"
              type="url"
              placeholder="https://github.com/org/repo"
              value={repoUrl}
              onChange={(e) => {
                setRepoUrl(e.target.value);
                setLocalError(null);
              }}
              disabled={pluginsStore.isInstalling}
              className={localError ? 'border-red-500/50 focus-visible:ring-red-500' : ''}
            />
            {localError && (
              <p className="flex items-center gap-1.5 text-xs text-red-400">
                <AlertCircle className="h-3.5 w-3.5" />
                {localError}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="add-plugin-pat">
              Access Token
              <span className="ml-1.5 font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="add-plugin-pat"
              type="password"
              placeholder="ghp_..."
              value={pat}
              onChange={(e) => setPat(e.target.value)}
              disabled={pluginsStore.isInstalling}
            />
            <p className="text-xs text-muted-foreground">Required for private repositories.</p>
          </div>

          {pluginsStore.isInstalling && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Scanning repository for skills...
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => handleClose(false)}
            disabled={pluginsStore.isInstalling}
          >
            Cancel
          </Button>
          <Button onClick={handleInstall} disabled={!repoUrl.trim() || pluginsStore.isInstalling}>
            {pluginsStore.isInstalling && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {pluginsStore.isInstalling ? 'Scanning...' : 'Install'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
