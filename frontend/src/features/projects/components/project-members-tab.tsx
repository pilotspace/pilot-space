/**
 * ProjectMembersTab — Member management tab for a project (US1, FR-01).
 *
 * Allows admins/owners to view, add, and remove project members.
 * Regular members see a read-only list.
 */

'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { useWorkspaceMembers } from '@/features/issues/hooks/use-workspace-members';
import { getInitials } from '@/features/members/utils/member-utils';
import {
  useAddProjectMember,
  useProjectMembers,
  useRemoveProjectMember,
} from '@/services/api/project-members';
import { Loader2, Search, UserMinus, UserPlus } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

interface ProjectMembersTabProps {
  workspaceId: string;
  projectId: string;
  isAdmin: boolean;
}

export function ProjectMembersTab({ workspaceId, projectId, isAdmin }: ProjectMembersTabProps) {
  const [search, setSearch] = React.useState('');
  const [addOpen, setAddOpen] = React.useState(false);

  const { data: projectMembersData, isLoading } = useProjectMembers(workspaceId, projectId);
  const { data: workspaceMembers } = useWorkspaceMembers(workspaceId);

  const addMember = useAddProjectMember(workspaceId, projectId);
  const removeMember = useRemoveProjectMember(workspaceId, projectId);

  const projectMembers = projectMembersData?.members ?? [];
  const projectMemberIds = new Set(projectMembers.map((m) => m.userId));

  // Workspace members not yet in this project (for the add picker)
  const addableCandidates =
    workspaceMembers?.filter((wm) => !projectMemberIds.has(wm.userId)) ?? [];

  const filtered = search
    ? projectMembers.filter(
        (m) =>
          m.email.toLowerCase().includes(search.toLowerCase()) ||
          (m.fullName?.toLowerCase() ?? '').includes(search.toLowerCase())
      )
    : projectMembers;

  function handleAdd(userId: string) {
    addMember.mutate(
      { userId },
      {
        onSuccess: () => {
          toast.success('Member added to project');
          setAddOpen(false);
        },
        onError: () => toast.error('Failed to add member'),
      }
    );
  }

  function handleRemove(userId: string) {
    removeMember.mutate(userId, {
      onSuccess: () => toast.success('Member removed from project'),
      onError: () => toast.error('Failed to remove member'),
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search members…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {isAdmin && (
          <Popover open={addOpen} onOpenChange={setAddOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" className="gap-2">
                <UserPlus className="h-4 w-4" />
                Add Member
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-72" align="end">
              <Command>
                <CommandInput placeholder="Search workspace members…" />
                <CommandList>
                  <CommandEmpty>No workspace members to add.</CommandEmpty>
                  <CommandGroup heading="Workspace Members">
                    {addableCandidates.map((wm) => (
                      <CommandItem
                        key={wm.userId}
                        value={`${wm.email} ${wm.fullName ?? ''}`}
                        onSelect={() => handleAdd(wm.userId)}
                        disabled={addMember.isPending}
                      >
                        <Avatar className="h-6 w-6 mr-2">
                          <AvatarImage src={wm.avatarUrl ?? undefined} />
                          <AvatarFallback className="text-[9px]">
                            {getInitials(wm.fullName, wm.email)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm truncate">{wm.fullName ?? wm.email}</span>
                          {wm.fullName && (
                            <span className="text-[10px] text-muted-foreground truncate">
                              {wm.email}
                            </span>
                          )}
                        </div>
                        <Badge
                          variant="outline"
                          className="ml-auto text-[10px] capitalize py-0 px-1.5"
                        >
                          {wm.role}
                        </Badge>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </div>

      <div className="text-sm text-muted-foreground">
        {filtered.length} {filtered.length === 1 ? 'member' : 'members'}
        {projectMembersData?.total && projectMembersData.total > filtered.length
          ? ` of ${projectMembersData.total} total`
          : ''}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          {search ? 'No members match your search.' : 'No members assigned to this project yet.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((member) => {
            const initials = getInitials(member.fullName, member.email);
            const displayName = member.fullName ?? member.email.split('@')[0];
            return (
              <li
                key={member.userId}
                className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
              >
                <Avatar className="h-9 w-9 flex-shrink-0">
                  <AvatarImage src={member.avatarUrl ?? undefined} />
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{displayName}</p>
                  <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                </div>
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive flex-shrink-0"
                    title="Remove from project"
                    onClick={() => handleRemove(member.userId)}
                    disabled={removeMember.isPending}
                  >
                    {removeMember.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <UserMinus className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
