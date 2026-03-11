/**
 * ActionButtonsTabContent - Admin configuration UI for action buttons.
 *
 * Manages CRUD + reorder + toggle for workspace action buttons.
 * Source: Phase 17, SKBTN-01..02
 */

'use client';

import * as React from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Sparkles, Trash2, Zap } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';

import {
  useAdminActionButtons,
  useCreateActionButton,
  useUpdateActionButton,
  useReorderActionButtons,
  useDeleteActionButton,
} from '@/services/api/skill-action-buttons';
import type {
  SkillActionButton,
  SkillActionButtonCreate,
} from '@/services/api/skill-action-buttons';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ActionButtonsTabContentProps {
  workspaceId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ActionButtonsTabContent({ workspaceId }: ActionButtonsTabContentProps) {
  const { data: buttons, isLoading } = useAdminActionButtons(workspaceId);
  const createButton = useCreateActionButton(workspaceId);
  const updateButton = useUpdateActionButton(workspaceId);
  const reorderButtons = useReorderActionButtons(workspaceId);
  const deleteButton = useDeleteActionButton(workspaceId);

  const [addDialogOpen, setAddDialogOpen] = React.useState(false);
  const [editButton, setEditButton] = React.useState<SkillActionButton | null>(null);

  // Form state
  const [formName, setFormName] = React.useState('');
  const [formIcon, setFormIcon] = React.useState('');
  const [formBindingType, setFormBindingType] = React.useState<'skill' | 'mcp_tool'>('skill');

  const resetForm = () => {
    setFormName('');
    setFormIcon('');
    setFormBindingType('skill');
  };

  const openAddDialog = () => {
    resetForm();
    setAddDialogOpen(true);
  };

  const openEditDialog = (btn: SkillActionButton) => {
    setFormName(btn.name);
    setFormIcon(btn.icon ?? '');
    setFormBindingType(btn.binding_type);
    setEditButton(btn);
  };

  const handleSubmitCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    const payload: SkillActionButtonCreate = {
      name: formName.trim(),
      icon: formIcon.trim() || null,
      binding_type: formBindingType,
      binding_metadata: {},
    };

    createButton.mutate(payload, {
      onSuccess: () => {
        toast.success('Action button created');
        setAddDialogOpen(false);
        resetForm();
      },
      onError: () => {
        toast.error('Failed to create action button');
      },
    });
  };

  const handleSubmitEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editButton || !formName.trim()) return;

    updateButton.mutate(
      {
        buttonId: editButton.id,
        data: {
          name: formName.trim(),
          icon: formIcon.trim() || null,
          binding_type: formBindingType,
        },
      },
      {
        onSuccess: () => {
          toast.success('Action button updated');
          setEditButton(null);
          resetForm();
        },
        onError: () => {
          toast.error('Failed to update action button');
        },
      }
    );
  };

  const handleToggle = (btn: SkillActionButton) => {
    updateButton.mutate(
      { buttonId: btn.id, data: { is_active: !btn.is_active } },
      {
        onSuccess: () => {
          toast.success(btn.is_active ? 'Button deactivated' : 'Button activated');
        },
        onError: () => {
          toast.error('Failed to toggle button');
        },
      }
    );
  };

  const handleDelete = (btn: SkillActionButton) => {
    deleteButton.mutate(btn.id, {
      onSuccess: () => {
        toast.success('Action button deleted');
      },
      onError: () => {
        toast.error('Failed to delete action button');
      },
    });
  };

  const handleMoveUp = (index: number) => {
    if (!buttons || index === 0) return;
    const ids = buttons.map((b) => b.id);
    const temp = ids[index - 1]!;
    ids[index - 1] = ids[index]!;
    ids[index] = temp;
    reorderButtons.mutate(ids);
  };

  const handleMoveDown = (index: number) => {
    if (!buttons || index >= buttons.length - 1) return;
    const ids = buttons.map((b) => b.id);
    const temp = ids[index]!;
    ids[index] = ids[index + 1]!;
    ids[index + 1] = temp;
    reorderButtons.mutate(ids);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-2 pt-3">
        <Skeleton className="h-[64px] w-full rounded-lg" />
        <Skeleton className="h-[64px] w-full rounded-lg" />
      </div>
    );
  }

  // Sort by sort_order
  const sortedButtons = [...(buttons ?? [])].sort((a, b) => a.sort_order - b.sort_order);

  // Form dialog (shared for create/edit)
  const formDialog = (
    <Dialog
      open={addDialogOpen || !!editButton}
      onOpenChange={(open) => {
        if (!open) {
          setAddDialogOpen(false);
          setEditButton(null);
          resetForm();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editButton ? 'Edit Action Button' : 'Add Action Button'}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={editButton ? handleSubmitEdit : handleSubmitCreate}
          className="space-y-4 pt-2"
        >
          <div className="space-y-1.5">
            <Label htmlFor="btn-name">Name</Label>
            <Input
              id="btn-name"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. Generate Tests"
              maxLength={100}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="btn-icon">Icon (Lucide icon name)</Label>
            <Input
              id="btn-icon"
              value={formIcon}
              onChange={(e) => setFormIcon(e.target.value)}
              placeholder="e.g. Zap, Send, Bug"
            />
            <p className="text-xs text-muted-foreground">
              Optional. Use a Lucide icon name like Zap, Send, Bug, Code, etc.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="btn-binding-type">Binding Type</Label>
            <Select
              value={formBindingType}
              onValueChange={(v) => setFormBindingType(v as 'skill' | 'mcp_tool')}
            >
              <SelectTrigger id="btn-binding-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="skill">Skill</SelectItem>
                <SelectItem value="mcp_tool">MCP Tool</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setAddDialogOpen(false);
                setEditButton(null);
                resetForm();
              }}
              disabled={createButton.isPending || updateButton.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!formName.trim() || createButton.isPending || updateButton.isPending}
            >
              {createButton.isPending || updateButton.isPending
                ? 'Saving...'
                : editButton
                  ? 'Save Changes'
                  : 'Add Button'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="space-y-3 pt-3">
      {/* Header with Add button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Action Buttons</h2>
          <p className="text-xs text-muted-foreground">
            One-click skill actions visible on issue pages.
          </p>
        </div>
        <Button size="sm" onClick={openAddDialog}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add Button
        </Button>
      </div>

      {/* Button list or empty state */}
      {sortedButtons.length > 0 ? (
        <div className="space-y-2">
          {sortedButtons.map((btn, index) => (
            <div
              key={btn.id}
              className={`flex items-center gap-3 rounded-lg border p-3 ${
                !btn.is_active ? 'opacity-50' : ''
              }`}
            >
              {/* Icon */}
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                {btn.icon ? (
                  <Zap className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Sparkles className="h-4 w-4 text-muted-foreground" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{btn.name}</span>
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    {btn.binding_type === 'skill' ? 'Skill' : 'MCP Tool'}
                  </Badge>
                  {!btn.is_active && (
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      Inactive
                    </Badge>
                  )}
                </div>
                {(() => {
                  const target =
                    btn.binding_metadata?.skill_name ?? btn.binding_metadata?.tool_name;
                  return target ? (
                    <p className="text-xs text-muted-foreground truncate">{String(target)}</p>
                  ) : null;
                })()}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                <Switch
                  checked={btn.is_active}
                  onCheckedChange={() => handleToggle(btn)}
                  aria-label={`Toggle ${btn.name}`}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleMoveUp(index)}
                  disabled={index === 0}
                  aria-label={`Move ${btn.name} up`}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleMoveDown(index)}
                  disabled={index === sortedButtons.length - 1}
                  aria-label={`Move ${btn.name} down`}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => openEditDialog(btn)}
                  aria-label={`Edit ${btn.name}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => handleDelete(btn)}
                  aria-label={`Delete ${btn.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-10 px-4">
          <div className="rounded-lg border border-border/50 bg-muted/30 p-3 mb-3">
            <Zap className="h-6 w-6 text-muted-foreground/50" />
          </div>
          <h3 className="text-sm font-medium text-foreground">No action buttons configured</h3>
          <p className="mt-0.5 text-xs text-muted-foreground text-center max-w-[260px]">
            Add buttons to give your team quick actions on issues.
          </p>
          <Button size="sm" className="mt-3" onClick={openAddDialog}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Button
          </Button>
        </div>
      )}

      {formDialog}
    </div>
  );
}
