/**
 * GitHubAccessSection - PAT management for accessing private GitHub repos.
 *
 * Phase 19 Plan 04: Status line + password input + Save button.
 * Pattern mirrors MCP server credential input form.
 */

'use client';

import * as React from 'react';
import { CheckCircle2, KeyRound } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useStore } from '@/stores';
import { toast } from 'sonner';

interface GitHubAccessSectionProps {
  workspaceId: string;
}

export const GitHubAccessSection = observer(function GitHubAccessSection({
  workspaceId,
}: GitHubAccessSectionProps) {
  const { ai } = useStore();
  const pluginsStore = ai.plugins;
  const [pat, setPat] = React.useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pat.trim()) return;
    await pluginsStore.saveGitHubPat(workspaceId, pat.trim());
    if (!pluginsStore.error) {
      setPat('');
      toast.success('GitHub PAT saved');
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">GitHub Access</h3>
        </div>
        {pluginsStore.hasGitHubPat ? (
          <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            GitHub PAT configured
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No PAT -- only public repos accessible</p>
        )}
      </div>
      <form onSubmit={handleSave} className="flex gap-2">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="github-pat" className="sr-only">
            GitHub Personal Access Token
          </Label>
          <Input
            id="github-pat"
            type="password"
            placeholder="ghp_..."
            value={pat}
            onChange={(e) => setPat(e.target.value)}
          />
        </div>
        <Button type="submit" size="sm" disabled={!pat.trim() || pluginsStore.isInstalling}>
          {pluginsStore.isInstalling ? 'Saving...' : 'Save'}
        </Button>
      </form>
    </div>
  );
});
