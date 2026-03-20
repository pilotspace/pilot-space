---
phase: quick-260318-hij
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/features/settings/components/skill-add-modal.tsx
  - frontend/src/features/settings/components/__tests__/skill-add-modal.test.tsx
  - frontend/src/features/settings/pages/skills-settings-page.tsx
  - frontend/src/features/settings/components/skill-generator-modal.tsx
  - frontend/src/features/settings/components/index.ts
autonomous: true
requirements: [SKILL-MODAL-REDESIGN]

must_haves:
  truths:
    - "User can create a skill manually (name + content) without AI generation"
    - "User can create a skill via AI generation (existing flow preserved)"
    - "User can switch between Manual and AI Generate tabs without losing state"
    - "Template pre-seed opens AI Generate tab with description pre-filled"
    - "Modal is wider (896px) with more content breathing room"
    - "Tab triggers are disabled during AI generation to prevent state corruption"
  artifacts:
    - path: "frontend/src/features/settings/components/skill-add-modal.tsx"
      provides: "Dual-mode Add Skill modal with Manual + AI Generate tabs"
      exports: ["SkillAddModal", "SkillAddModalProps"]
    - path: "frontend/src/features/settings/components/__tests__/skill-add-modal.test.tsx"
      provides: "Unit tests covering manual save, AI flow, tab switching, validation, template pre-seed"
      min_lines: 100
  key_links:
    - from: "skill-add-modal.tsx"
      to: "useCreateUserSkill"
      via: "import from @/services/api/user-skills"
      pattern: "useCreateUserSkill"
    - from: "skill-add-modal.tsx"
      to: "useGenerateSkill, useCreateRoleSkill"
      via: "import from @/features/onboarding/hooks"
      pattern: "useGenerateSkill|useCreateRoleSkill"
    - from: "skill-add-modal.tsx"
      to: "useGenerateWorkspaceSkill"
      via: "import from @/services/api/workspace-role-skills"
      pattern: "useGenerateWorkspaceSkill"
    - from: "skills-settings-page.tsx"
      to: "skill-add-modal.tsx"
      via: "import SkillAddModal, replaces SkillGeneratorModal"
      pattern: "SkillAddModal"
---

<objective>
Replace `SkillGeneratorModal` with a new `SkillAddModal` that has dual-mode creation: a Manual tab for direct input and an AI Generate tab preserving the existing flow. Widen the modal from 768px to 896px, remove the right guide panel, and add inline tips.

Purpose: Users with pre-written skills can save directly without going through AI generation. The wider modal gives more editing space for 200-500 word skill content.
Output: New `skill-add-modal.tsx` component, unit tests, updated settings page import.
</objective>

<execution_context>
@/Users/tindang/workspaces/tind-repo/pilot-space/.claude/get-shit-done/workflows/execute-plan.md
@/Users/tindang/workspaces/tind-repo/pilot-space/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@specs/023-skill-modal-redesign/ux-design-spec.md (Full UX spec -- THIS IS THE SOURCE OF TRUTH for layout, fields, behavior, and Tailwind classes)

@frontend/src/features/settings/components/skill-generator-modal.tsx (Current modal to replace -- migrate all AI logic from here)
@frontend/src/features/settings/components/skill-editor.tsx (Reusable SkillEditor -- toolbar + textarea + word count)
@frontend/src/features/settings/components/word-count-bar.tsx (Reusable WordCountBar component)
@frontend/src/features/settings/pages/skills-settings-page.tsx (Consumer -- replace SkillGeneratorModal import)
@frontend/src/features/settings/components/index.ts (Barrel exports to update)
@frontend/src/services/api/user-skills.ts (useCreateUserSkill mutation hook + UserSkillCreate type)

<interfaces>
<!-- Key types and contracts the executor needs -->

From frontend/src/services/api/user-skills.ts:
```typescript
export interface UserSkillCreate {
  template_id?: string;
  skill_content?: string;
  experience_description?: string;
  skill_name?: string;
}

export function useCreateUserSkill(workspaceSlug: string): UseMutationResult<UserSkill, Error, UserSkillCreate>;
```

From frontend/src/features/onboarding/hooks/useRoleSkillActions.ts:
```typescript
export function useGenerateSkill({ workspaceId }: { workspaceId: string }): UseMutationResult<
  { skillContent: string; suggestedRoleName: string; wordCount: number },
  Error,
  { roleType: string; experienceDescription: string }
>;
export function useCreateRoleSkill({ workspaceId }: { workspaceId: string }): UseMutationResult;
```

From frontend/src/services/api/workspace-role-skills.ts:
```typescript
export function useGenerateWorkspaceSkill({ workspaceId }: { workspaceId: string }): UseMutationResult<
  { skill_content: string; role_name: string; /* ... */ },
  Error,
  { experience_description: string }
>;
```

From frontend/src/features/settings/components/skill-editor.tsx:
```typescript
// NOTE: SkillEditor has built-in onSave/onCancel buttons. For the Manual tab,
// DO NOT use SkillEditor directly -- instead, extract and reuse the toolbar pattern
// inline. The footer buttons are shared across tabs (outside TabsContent).
// Use a plain textarea with the toolbar markup from SkillEditor, plus WordCountBar.
interface SkillEditorProps {
  initialContent: string;
  maxWords?: number;
  onSave: (content: string) => void;
  onCancel: () => void;
  isSaving?: boolean;
}
```

From frontend/src/features/settings/components/word-count-bar.tsx:
```typescript
interface WordCountBarProps {
  wordCount: number;
  maxWords?: number;
  className?: string;
}
export function WordCountBar({ wordCount, maxWords, className }: WordCountBarProps): JSX.Element;
```

From frontend/src/features/settings/components/skill-generator-modal.tsx:
```typescript
export type SkillGeneratorMode = 'personal' | 'workspace';
export interface SkillGeneratorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultMode?: SkillGeneratorMode;
  showModeToggle?: boolean;
  workspaceId: string;
  workspaceSlug?: string;
  template?: { id: string; name: string; description: string; skill_content: string } | null;
}
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create SkillAddModal with Manual + AI Generate tabs</name>
  <files>
    frontend/src/features/settings/components/skill-add-modal.tsx
    frontend/src/features/settings/components/__tests__/skill-add-modal.test.tsx
  </files>
  <behavior>
    - Manual tab renders: name input (id="manual-skill-name"), description input (id="manual-skill-description"), content textarea (min-h-[320px] with markdown toolbar from SkillEditor pattern), WordCountBar, inline tip, Save Skill button
    - Manual save: fills name + content, clicks Save Skill, `createUserSkill.mutateAsync` called with `{ skill_name, skill_content, experience_description }`
    - Manual validation: Save Skill button disabled when name empty or content empty
    - Manual name validation: inline error "Skill name is required" shown on blur when name is empty
    - AI tab renders: description textarea (min-h-[260px]), Generate button visible
    - AI generation flow: mock generate mutation, verify form -> generating -> preview step transitions
    - Tab switching preserves state: type in manual fields, switch to AI, switch back, manual content preserved
    - Tab triggers disabled during AI generation (aiStep === 'generating')
    - Template pre-seed: when template prop provided, AI tab is active, description pre-filled
    - Modal close resets all state after 200ms animation delay
    - Word count uses WordCountBar component (reused from existing)
  </behavior>
  <action>
Create `skill-add-modal.tsx` following the UX spec (sections 4-8) precisely:

**Modal shell**: `DialogContent` with `className="sm:max-w-4xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden"`. Remove the two-panel grid layout entirely.

**Header** (px-6 pt-6 pb-4 border-b shrink-0): DialogTitle "Add Skill" + ModeToggle (migrated from current modal, shown when `showModeToggle` is true).

**Tabs** (px-6 border-b shrink-0): shadcn `Tabs` with `TabsList` containing two `TabsTrigger`s: "Manual" and "AI Generate". Disable tab triggers when `aiStep === 'generating'`.

**Manual tab content** (flex-1 overflow-y-auto px-6 py-5):
- `Input` for skill name (id="manual-skill-name", placeholder="e.g. Senior Backend Developer", maxLength=200, required with blur validation)
- `Input` for description (id="manual-skill-description", placeholder="Brief description of what this skill covers", maxLength=500, optional, maps to `experience_description`)
- Content area: Replicate the toolbar from `SkillEditor` (Bold, Italic, H1, H2, H3, List, Code buttons) above a plain `<textarea>` with `min-h-[320px]` and `font-mono text-sm`. Do NOT import SkillEditor component (it has built-in Save/Cancel buttons that conflict with the shared footer). Instead, extract the toolbar action pattern inline. Use `WordCountBar` below.
- Inline tip div: `rounded-md bg-primary/5 border border-primary/10 p-3 mt-4` with tip text per spec.

**AI Generate tab content** (flex-1 overflow-y-auto px-6 py-5):
- Migrate ALL logic from current `SkillGeneratorModal`: FormStep (single-column, no guide panel, textarea min-h-[260px]), GeneratingStep (unchanged), PreviewStep (name as shadcn Input, content textarea min-h-[280px] max-h-[400px], WordCountBar, "Back to description" as ghost Button with ArrowLeft icon).
- Move error alert, description textarea, word count, and tip inline into the AI form step.

**Footer** (px-6 py-4 border-t shrink-0 flex items-center justify-between gap-3 bg-background):
- Button matrix per spec section 8: Manual -> Cancel + Save Skill; AI form -> Cancel + Generate; AI generating -> hidden; AI preview -> Retry + Save & Activate.

**State management**: All React useState, no MobX. State variables per spec section 11 (manualName, manualDescription, manualContent, manualNameError, aiStep, aiDescription, aiPreview, aiEditableName, aiEditableContent, aiShowError, mode, activeTab).

**Props**: `SkillAddModalProps` per spec section 7 (open, onOpenChange, defaultTab, defaultMode, showModeToggle, workspaceId, workspaceSlug, template).

**Hooks**: Import `useCreateUserSkill` from `@/services/api/user-skills`, `useGenerateSkill`/`useCreateRoleSkill` from `@/features/onboarding/hooks`, `useGenerateWorkspaceSkill` from `@/services/api/workspace-role-skills`.

**Manual save behavior**: Call `createUserSkill.mutateAsync({ skill_name: trimmedName, skill_content: manualContent, experience_description: manualDescription || undefined })`. On success: close modal, toast "Skill created".

**AI save behavior**: Same as current `handleSave` in `skill-generator-modal.tsx` -- calls `createUserSkill.mutateAsync` with template_id, skill_content, experience_description, skill_name.

**Close behavior**: `onOpenChange(false)`, then `setTimeout(reset, 200)` to reset all state after exit animation.

**Template pre-seed**: When `template` prop provided, set `activeTab` to 'ai-generate', pre-fill `aiDescription` with `template.description`.

Write tests in `__tests__/skill-add-modal.test.tsx`:
- Mock `useCreateUserSkill`, `useGenerateSkill`, `useCreateRoleSkill`, `useGenerateWorkspaceSkill` with vi.mock
- Mock `next/navigation` useParams returning `{ workspaceSlug: 'test-ws' }`
- Test the 10 scenarios listed in the behavior block above
- Use `@testing-library/react` with `userEvent` for interactions
- Test that tab switching preserves form state by filling manual fields, clicking AI tab, clicking Manual tab, asserting values remain
  </action>
  <verify>
    <automated>cd /Users/tindang/workspaces/tind-repo/pilot-space/frontend && pnpm vitest run src/features/settings/components/__tests__/skill-add-modal.test.tsx --reporter=verbose</automated>
  </verify>
  <done>
    - SkillAddModal renders with Manual tab (default) and AI Generate tab
    - Manual tab: name input, description input, content textarea with toolbar, WordCountBar, inline tip, Save Skill button
    - AI Generate tab: full generation flow (form -> generating -> preview) preserved from current modal
    - All 10 test scenarios pass
    - Modal is 896px wide (sm:max-w-4xl), single-column layout, no guide panel
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire SkillAddModal into settings page and deprecate old modal</name>
  <files>
    frontend/src/features/settings/pages/skills-settings-page.tsx
    frontend/src/features/settings/components/skill-generator-modal.tsx
    frontend/src/features/settings/components/index.ts
  </files>
  <action>
**skills-settings-page.tsx**:
1. Replace import: `import { SkillGeneratorModal } from '../components/skill-generator-modal'` -> `import { SkillAddModal } from '../components/skill-add-modal'`
2. Replace JSX usage (around line 350-361): swap `<SkillGeneratorModal ... />` with:
```tsx
<SkillAddModal
  open={generatorOpen}
  onOpenChange={(v) => {
    setGeneratorOpen(v);
    if (!v) setTimeout(() => setSelectedTemplate(null), 200);
  }}
  defaultTab={selectedTemplate ? 'ai-generate' : 'manual'}
  defaultMode="personal"
  showModeToggle={isAdmin}
  workspaceId={workspaceId}
  workspaceSlug={workspaceSlug}
  template={selectedTemplate}
/>
```
3. Remove unused `SkillGeneratorModal` import.

**skill-generator-modal.tsx**:
1. Add `@deprecated` JSDoc at the top of the file and on the export:
```typescript
/**
 * @deprecated Use SkillAddModal instead. This file is kept for reference during migration.
 * Will be removed in a future cleanup pass.
 */
```

**index.ts** (barrel exports):
1. Add export for new component: `export { SkillAddModal } from './skill-add-modal';`
2. Keep `SkillEditor` and `WordCountBar` exports (still used).
  </action>
  <verify>
    <automated>cd /Users/tindang/workspaces/tind-repo/pilot-space/frontend && pnpm tsc --noEmit 2>&1 | head -30 && pnpm vitest run src/features/settings --reporter=verbose 2>&1 | tail -30</automated>
  </verify>
  <done>
    - skills-settings-page.tsx imports and renders SkillAddModal instead of SkillGeneratorModal
    - defaultTab is 'ai-generate' when template selected, 'manual' otherwise
    - TypeScript compiles with no errors in the settings feature
    - All existing settings tests still pass
    - skill-generator-modal.tsx has @deprecated JSDoc
    - index.ts exports SkillAddModal
  </done>
</task>

</tasks>

<verification>
1. `cd frontend && pnpm tsc --noEmit` -- zero type errors
2. `cd frontend && pnpm vitest run src/features/settings --reporter=verbose` -- all tests pass including new skill-add-modal tests
3. `cd frontend && pnpm lint` -- no lint errors in modified files
</verification>

<success_criteria>
- SkillAddModal renders at 896px with dual tabs (Manual + AI Generate)
- Manual tab allows creating a skill with just name + content (no AI required)
- AI Generate tab preserves the full existing generation flow (form -> generating -> preview -> save)
- Tab switching preserves state in both directions
- Template pre-seed opens AI tab with description pre-filled
- All unit tests pass (10 test scenarios minimum)
- TypeScript compiles cleanly, ESLint passes
- Old SkillGeneratorModal marked @deprecated, not removed
</success_criteria>

<output>
After completion, create `.planning/quick/260318-hij-implement-skill-modal-redesign-widen-mod/260318-hij-SUMMARY.md`
</output>
