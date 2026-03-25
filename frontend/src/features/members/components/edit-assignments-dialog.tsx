/**
 * EditAssignmentsDialog — Admin dialog to bulk-update a member's project assignments.
 *
 * T030: Shows checkboxes for each non-archived project; pre-checks current assignments.
 * Workspace role select (Member/Admin). Soft-warning on demotion.
 * Optimistic update via TanStack mutation + invalidateQueries on save.
 */

'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { workspaceMembersKeys } from '@/features/issues/hooks/use-workspace-members';
import { selectAllProjects, useProjects } from '@/features/projects/hooks/useProjects';
import { projectMemberKeys, useBulkUpdateAssignments } from '@/services/api/project-members';
import type { WorkspaceRole } from '@/stores/WorkspaceStore';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

interface EditAssignmentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  userId: string;
  memberName: string;
  currentRole: WorkspaceRole;
  /** Currently assigned project IDs */
  currentProjectIds: string[];
}

export function EditAssignmentsDialog({
  open,
  onOpenChange,
  workspaceId,
  userId,
  memberName,
  currentRole,
  currentProjectIds,
}: EditAssignmentsDialogProps) {
  const queryClient = useQueryClient();
  const bulkUpdate = useBulkUpdateAssignments(workspaceId);

  const { data: projectsData } = useProjects({ workspaceId, enabled: open });
  const allProjects = selectAllProjects(projectsData).filter((p) => !p.is_archived);

  const [selectedIds, setSelectedIds] = React.useState<string[]>(currentProjectIds);
  const [role, setRole] = React.useState<WorkspaceRole>(currentRole);

  // Sync state when dialog opens (handles re-opens with fresh data)
  React.useEffect(() => {
    if (open) {
      setSelectedIds(currentProjectIds);
      setRole(currentRole);
    }
  }, [open, currentProjectIds, currentRole]);

  const isDemotion =
    (currentRole === 'admin' || currentRole === 'owner') && (role === 'member' || role === 'guest');

  const toggleProject = (projectId: string) => {
    setSelectedIds((prev) =>
      prev.includes(projectId) ? prev.filter((id) => id !== projectId) : [...prev, projectId]
    );
  };

  const handleSave = async () => {
    const addIds = selectedIds.filter((id) => !currentProjectIds.includes(id));
    const removeIds = currentProjectIds.filter((id) => !selectedIds.includes(id));

    const projectAssignments = [
      ...addIds.map((id) => ({ projectId: id, action: 'add' as const })),
      ...removeIds.map((id) => ({ projectId: id, action: 'remove' as const })),
    ];

    try {
      await bulkUpdate.mutateAsync({
        userId,
        payload: {
          workspaceRole: role !== currentRole ? role : undefined,
          projectAssignments,
        },
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: workspaceMembersKeys.all(workspaceId) }),
        queryClient.invalidateQueries({ queryKey: projectMemberKeys.all }),
      ]);

      toast.success('Assignments updated', {
        description: `${memberName}'s project assignments have been updated.`,
      });
      onOpenChange(false);
    } catch {
      toast.error('Failed to update assignments');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Assignments</DialogTitle>
          <DialogDescription>
            Update project assignments and role for{' '}
            <span className="font-medium">{memberName}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Role select */}
          <div className="space-y-2">
            <Label htmlFor="edit-role">Workspace Role</Label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as WorkspaceRole)}
              disabled={bulkUpdate.isPending}
            >
              <SelectTrigger id="edit-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="guest">Guest</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Demotion warning */}
          {isDemotion && (
            <Alert variant="default" className="border-amber-200 bg-amber-50 text-amber-900">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-sm">
                Changing this member&apos;s role to <strong>{role}</strong> will reduce their
                workspace permissions. Make sure they are assigned to the correct projects.
              </AlertDescription>
            </Alert>
          )}

          {/* Project checkboxes */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Project Assignments</Label>
              <Badge variant="secondary" className="text-xs">
                {selectedIds.length} selected
              </Badge>
            </div>
            <ScrollArea className="h-48 rounded-md border">
              <div className="p-2 space-y-1">
                {allProjects.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No projects in this workspace.
                  </p>
                ) : (
                  allProjects.map((project) => {
                    const checked = selectedIds.includes(project.id);
                    return (
                      <label
                        key={project.id}
                        className="flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 hover:bg-accent transition-colors"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleProject(project.id)}
                          disabled={bulkUpdate.isPending}
                          aria-label={`Toggle ${project.name}`}
                        />
                        <span className="font-mono text-xs text-muted-foreground">
                          {project.identifier}
                        </span>
                        <span className="text-sm flex-1 truncate">{project.name}</span>
                        {checked && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                      </label>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={bulkUpdate.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={bulkUpdate.isPending}
            aria-busy={bulkUpdate.isPending}
          >
            {bulkUpdate.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            {bulkUpdate.isPending ? 'Saving…' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
