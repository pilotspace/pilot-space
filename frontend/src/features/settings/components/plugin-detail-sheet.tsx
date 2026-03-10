/**
 * PluginDetailDialog - Dialog showing skills in a plugin with individual toggles.
 *
 * Shows plugin header, list of skills with activate/deactivate switches,
 * update button (if available), and remove plugin action.
 */

'use client';

import * as React from 'react';
import { ArrowUpCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { ConfirmActionDialog } from './confirm-action-dialog';
import type { PluginGroup } from '@/stores/ai/PluginsStore';

interface PluginDetailDialogProps {
  group: PluginGroup | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleSkill: (pluginId: string, isActive: boolean) => void;
  onRemove: (repoUrl: string) => void;
}

export function PluginDetailDialog({
  group,
  open,
  onOpenChange,
  onToggleSkill,
  onRemove,
}: PluginDetailDialogProps) {
  const [confirmRemoveOpen, setConfirmRemoveOpen] = React.useState(false);

  if (!group) return null;

  const firstSkill = group.skills[0];
  const shortSha = firstSkill?.installed_sha.slice(0, 8) ?? '';

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <div className="flex items-start justify-between">
              <div>
                <DialogTitle>{group.repoName}</DialogTitle>
                <p className="mt-1 text-xs text-muted-foreground font-mono">
                  {group.repoOwner}/{group.repoName}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">SHA: {shortSha}</p>
              </div>
              {group.hasUpdate && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                >
                  <ArrowUpCircle className="mr-1.5 h-3.5 w-3.5" />
                  Update
                </Button>
              )}
            </div>
          </DialogHeader>

          <Separator />

          {/* Skills list */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Skills ({group.skillCount})
            </h4>
            <div
              className={`space-y-1 ${group.skillCount > 8 ? 'max-h-[320px] overflow-y-auto' : ''}`}
            >
              {group.skills.map((skill) => (
                <div
                  key={skill.id}
                  className="flex items-start justify-between gap-4 rounded-md px-3 py-3 transition-colors duration-100 hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{skill.display_name}</p>
                    {skill.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                        {skill.description}
                      </p>
                    )}
                  </div>
                  <Switch
                    checked={skill.is_active}
                    onCheckedChange={(checked) => onToggleSkill(skill.id, checked)}
                    className="shrink-0 mt-0.5"
                    aria-label={`Toggle ${skill.display_name}`}
                  />
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Remove plugin */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground">Remove plugin</p>
              <p className="text-xs text-muted-foreground">
                Deactivate all skills and remove the plugin.
              </p>
            </div>
            <Button variant="destructive" size="sm" onClick={() => setConfirmRemoveOpen(true)}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Remove confirmation */}
      {confirmRemoveOpen && (
        <ConfirmActionDialog
          open={confirmRemoveOpen}
          onCancel={() => setConfirmRemoveOpen(false)}
          onConfirm={() => {
            onRemove(group.repoUrl);
            setConfirmRemoveOpen(false);
            onOpenChange(false);
          }}
          title={`Remove ${group.repoName}?`}
          description={`This will deactivate all ${group.skillCount} skill${group.skillCount !== 1 ? 's' : ''} and remove the plugin from your workspace. This action cannot be undone.`}
          confirmLabel="Remove Plugin"
          variant="destructive"
        />
      )}
    </>
  );
}
