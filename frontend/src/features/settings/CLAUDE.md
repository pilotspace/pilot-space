# Settings Module - Frontend Development Guide

_For project overview, see main `CLAUDE.md` at project root and `frontend/CLAUDE.md`_

## Quick Reference

**Module Location & Stats**:
- **Path**: `frontend/src/features/settings/`
- **Pages**: 5 settings pages (General, Members, AI Providers, Profile, Skills)
- **Components**: 10+ UI components + dialogs
- **Hooks**: 3 TanStack Query hooks
- **Tests**: 9 test files
- **Lines per File**: <700 (enforced)

---

## Module Overview

### Purpose

The **settings** feature module enables:
1. **Workspace Management**: Edit name, slug, description, delete (owner-only)
2. **Member Management**: Invite, remove, change roles
3. **AI Configuration**: Set API keys (Anthropic, OpenAI); toggle features
4. **User Profile**: Edit display name
5. **AI Skills**: Configure role-based skills (max 3 per workspace)

### Permission Model

**Four-tier hierarchy**:
- **Owner**: Full control
- **Admin**: Manage members, settings, AI config
- **Member**: View/toggle (if keys set), edit skills
- **Guest**: Read-only

**Key Rule**: All operations enforced via RLS at database layer + frontend UI checks.

---

## Architecture Overview

### Pages

- `workspace-general-page.tsx` — Name/slug/description/delete (T029)
- `members-settings-page.tsx` — Members, invitations, roles (T022-T025)
- `ai-settings-page.tsx` — API keys, toggles, provider status (T178-T182)
- `profile-settings-page.tsx` — Display name, avatar, email (T013)
- `skills-settings-page.tsx` — Role-based AI skills, max 3 (T038)

### Route Mapping

```
/settings              → WorkspaceGeneralPage (default)
/settings/profile      → ProfileSettingsPage
/settings/members      → MembersSettingsPage
/settings/ai-providers → AISettingsPage
/settings/skills       → SkillsSettingsPage
```

### Key Components

- **APIKeyForm**: Manage Anthropic + OpenAI keys
- **MemberRow**: Single member with role selector
- **InviteMemberDialog**: Email + role selection
- **AIFeatureToggles**: 5 switches (Ghost text, Annotations, Context, Extraction, PR review)
- **DeleteWorkspaceDialog**: Confirmation with name entry
- **SkillCard**: Display skill with edit/regenerate/remove

---

## Functionality Summary

### 1. Workspace General Settings

- **Edit**: Name, slug, description (admin-only)
- **View**: Created date, member count, workspace ID (all users)
- **Delete**: Requires exact workspace name confirmation (owner-only)
- **Validation**: Slug pattern `^[a-z0-9]+(?:-[a-z0-9]+)*$`

### 2. Member Management

- **List**: All members sorted by role hierarchy
- **Actions** (admin+):
  - Change role (except owner, except self)
  - Remove member (except owner, except self)
  - Transfer ownership (owner-only)
- **Invite** (admin+): Email + role selection
- **Pending Invitations**: View + cancel option

### 3. AI Providers

- **Status Cards**: Connection state for Anthropic, OpenAI
- **API Keys**: Input + validate (client + server)
- **Features**: 5 toggles
- **Security**: Keys encrypted via Supabase Vault

### 4. User Profile

- **Avatar**: Display (read-only)
- **Display Name**: Edit (visible to members)
- **Email**: Display (read-only)

### 5. AI Skills

- **Max 3 skills** per workspace
- **Create**: Template + AI generates content
- **Edit**: Modify content with word count
- **Regenerate**: Describe experience, AI generates
- **Reset/Remove**: Revert or delete

---

## Permission Model

### Role Hierarchy

| Role | Workspace | Members | AI Settings | Skills | Delete |
|------|-----------|---------|-------------|--------|--------|
| Owner | Full | Manage all | Full | Full | ✓ |
| Admin | Full | Manage (except owner) | Full | Full | — |
| Member | Read/Write | View | View/toggle | Full | — |
| Guest | Read-only | View | View | Cannot access | — |

### Permission Checks

**Frontend**:
```typescript
const isAdmin = workspaceStore.isAdmin;      // admin OR owner
const isOwner = workspaceStore.isOwner;      // owner only
```

**Backend**: RLS policies enforce database-level access control

---

## State Management

### MobX Stores

```typescript
rootStore.ai.settings              // AISettingsStore
  ├── settings: WorkspaceAISettings | null
  ├── isLoading / isSaving
  └── methods: loadSettings, saveSettings, validateKey

rootStore.workspace                // WorkspaceStore
  ├── currentUserRole (computed)
  ├── isAdmin / isOwner (computed)
  └── methods: updateMemberRole, removeMember, inviteMember

rootStore.auth                      // AuthStore
  ├── user: User | null
  └── methods: updateProfile
```

### TanStack Query Hooks

- `useWorkspaceSettings()` — Query workspace data
- `useUpdateWorkspaceSettings()` — Mutation
- `useWorkspaceMembers()` — Query members
- `useWorkspaceInvitations()` — Query invitations
- `useRoleSkills()` — Query role skills
- Query stale time: 60 seconds

---

## Code Patterns

### Observer Pattern (MobX)

```typescript
export const AISettingsPage = observer(function AISettingsPage() {
  const { ai } = useStore();
  // Re-renders when ai.settings changes
});
```

### TanStack Query Pattern

```typescript
export function useWorkspaceSettings(workspaceId: string) {
  return useQuery<Workspace>({
    queryKey: workspaceSettingsKeys.detail(workspaceId),
    queryFn: () => apiClient.get(`/workspaces/{workspaceId}`),
    enabled: !!workspaceId,
    staleTime: 60_000,
  });
}
```

### Role-Based Conditionals

```typescript
const isAdmin = workspaceStore.isAdmin;

if (!isAdmin) {
  return <ReadOnlyView />;
}

return (
  <EditableForm>
    <Input disabled={!isAdmin} />
    <Button disabled={!isAdmin || !hasChanges}>Save</Button>
  </EditableForm>
);
```

### Confirmation Dialog Pattern

```typescript
const handleRemove = (userId: string) => {
  setConfirmDialog({
    open: true,
    title: 'Remove member?',
    onConfirm: () => workspaceStore.removeMember(workspaceId, userId),
  });
};
```

---

## Testing

### Run Tests

```bash
pnpm test -- frontend/src/features/settings
pnpm test -- --coverage frontend/src/features/settings
pnpm test -- --watch frontend/src/features/settings
```

### Critical Scenarios

- Admin can edit workspace settings (Member/Guest cannot)
- Invite new member (valid email required)
- Reject duplicate email (409 conflict)
- Change member role (except owner, except self)
- Transfer ownership (owner-only)
- API key validation (format + min length)
- Workspace deletion (requires name confirmation)
- Guest cannot access certain sections

---

## Quality Gates

```bash
pnpm lint -- frontend/src/features/settings
pnpm type-check
pnpm test -- --coverage frontend/src/features/settings
```

Target: **>80% coverage**

---

## Related Documentation

- **DD-061**: Supabase Auth + RLS
- **DD-065**: MobX for UI state, TanStack Query for server state
- **DD-088**: MCP tool registry
- `docs/architect/backend-architecture.md`
- `docs/architect/rls-patterns.md`
- `docs/dev-pattern/45-pilot-space-patterns.md`

---

## Quick Reference

### Imports

```typescript
import { useStore } from '@/stores';
import { observer } from 'mobx-react-lite';
import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
```

### Permission Checks

```typescript
const isAdmin = workspaceStore.isAdmin;      // admin OR owner
const isOwner = workspaceStore.isOwner;      // owner only
const isGuest = workspaceStore.currentUserRole === 'guest';
```

### API Key Validation

```typescript
// Anthropic: sk-ant-*, min 10 chars
// OpenAI: sk-*, min 10 chars
const pattern = provider === 'anthropic' ? /^sk-ant-/ : /^sk-/;
const valid = pattern.test(key) && key.length >= 10;
```

---

## Summary

Settings module implements workspace configuration with strict role-based access control:

- **5 pages**: General, Members, AI Providers, Profile, Skills
- **10+ components**: Forms, dialogs, toggles, role selectors
- **4-tier roles**: Owner, Admin, Member, Guest
- **MobX + TanStack Query**: Reactive UI + server state
- **Accessibility**: ARIA labels, keyboard navigation
- **RLS Enforcement**: Database-level security

**Files**: 5 pages + 10+ components
**Status**: Production
**Test Coverage**: Target >80%

For broader context, see main `CLAUDE.md` and `frontend/CLAUDE.md`.
