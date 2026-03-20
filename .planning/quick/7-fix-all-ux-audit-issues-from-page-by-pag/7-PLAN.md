---
phase: quick-7
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/components/workspace/ai-not-configured-banner.tsx
  - frontend/src/features/settings/pages/sso-settings-page.tsx
  - frontend/src/features/settings/pages/roles-settings-page.tsx
  - frontend/src/features/settings/pages/security-settings-page.tsx
  - frontend/src/features/settings/pages/audit-settings-page.tsx
  - frontend/src/features/homepage/components/DailyBrief.tsx
autonomous: true
requirements: []

must_haves:
  truths:
    - "Amber AI banner dismissal persists across page navigation (localStorage, 7-day TTL)"
    - "SSO page shows heading and description immediately regardless of loading state"
    - "Roles and Security access-restricted pages show amber (not red) alert with page context"
    - "Audit log actor column shows display name or email prefix, not raw UUID"
    - "Dashboard greeting drops raw username when display name is empty (shows 'Good evening' without name)"
  artifacts:
    - path: "frontend/src/components/workspace/ai-not-configured-banner.tsx"
      provides: "Persistent banner dismissal with localStorage + 7-day TTL"
    - path: "frontend/src/features/settings/pages/sso-settings-page.tsx"
      provides: "Page heading always visible, even when not-admin or loading"
    - path: "frontend/src/features/settings/pages/roles-settings-page.tsx"
      provides: "Amber access-restricted alert with page heading and admin guidance"
    - path: "frontend/src/features/settings/pages/security-settings-page.tsx"
      provides: "Amber access-restricted alert with page heading and admin guidance"
    - path: "frontend/src/features/settings/pages/audit-settings-page.tsx"
      provides: "Actor column resolved to display name or truncated email prefix"
    - path: "frontend/src/features/homepage/components/DailyBrief.tsx"
      provides: "Greeting omits raw username when no display name set"
  key_links:
    - from: "AiNotConfiguredBanner dismiss button"
      to: "localStorage key 'ai_banner_dismissed_at'"
      via: "onClick handler writes timestamp, useState initializer reads and checks < 7 days"
    - from: "SsoSettingsPage"
      to: "page heading div"
      via: "Heading rendered outside the isAdmin guard, always visible"
    - from: "RolesSettingsPage / SecuritySettingsPage isAdmin guard"
      to: "Alert component"
      via: "variant changed from 'destructive' to default with amber CSS classes"
    - from: "AuditSettingsPage actor cell"
      to: "workspace members lookup"
      via: "useWorkspaceMembers hook + Map lookup by actorId"
    - from: "DailyBrief greeting"
      to: "firstName variable"
      via: "authStore.userDisplayName returns email when no display name — strip domain and use only if it doesn't look like a raw slug"
---

<objective>
Fix 5 high-priority UX audit issues: banner persistence, SSO/Roles/Security page headers, audit log
actor display, and dashboard greeting fallback.

Purpose: Eliminate the top P0/P1 issues that create confusion or are visually broken for non-admin users.
Output: 6 modified files, all changes frontend-only.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

Key constraints:
- MUST write unit tests for all modified logic
- Files >700 lines: surgical edits only
- pnpm (not npm/yarn)
- No backend changes
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Banner dismissal persistence + SSO/Roles/Security page context fixes</name>
  <files>
    frontend/src/components/workspace/ai-not-configured-banner.tsx
    frontend/src/features/settings/pages/sso-settings-page.tsx
    frontend/src/features/settings/pages/roles-settings-page.tsx
    frontend/src/features/settings/pages/security-settings-page.tsx
  </files>
  <behavior>
    - Banner: dismiss writes localStorage key 'ai_banner_dismissed_at' = Date.now(). On mount, reads key; if value exists and (Date.now() - value) < 7 * 24 * 60 * 60 * 1000, sets dismissed=true. Otherwise shows banner. Old sessionStorage logic removed.
    - SSO: Move the page heading div ("Single Sign-On (SSO)" h1 + description p) ABOVE the `if (!isAdmin)` guard. The heading renders for all users; only the form cards are gated. The not-admin Alert changes from variant="destructive" to no variant (default), with amber CSS: className="border-amber-500/30 bg-amber-50 text-amber-800". Add guidance text: "Contact your workspace admin to configure SSO."
    - Roles: Same pattern — the page heading ("Custom Roles") is currently INSIDE the isAdmin=true path. Move heading above the guard. The not-admin Alert: remove variant="destructive", add amber classes, add guidance: "Contact your workspace admin to manage custom roles."
    - Security: Same — move heading above guard, amber alert variant, add guidance text.
  </behavior>
  <action>
    **ai-not-configured-banner.tsx** — surgical change to useState initializer and onClick:

    Replace the `useState` initializer from sessionStorage to localStorage with TTL:
    ```
    const DISMISS_KEY = 'ai_banner_dismissed_at';
    const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

    const [dismissed, setDismissed] = useState(() => {
      if (typeof window === 'undefined') return false;
      const ts = localStorage.getItem(DISMISS_KEY);
      if (!ts) return false;
      return Date.now() - parseInt(ts, 10) < DISMISS_TTL_MS;
    });
    ```

    Replace onClick handler:
    ```
    onClick={() => {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
      setDismissed(true);
    }}
    ```

    **sso-settings-page.tsx** — Extract the page heading into a standalone const rendered before isAdmin check. Inside the `!isAdmin` early return, wrap with a fragment: heading div + the Alert (remove variant="destructive", add amber classes, add guidance text). This file is >600 lines — read it fully first, edit surgically.

    **roles-settings-page.tsx** — Same restructure: extract heading above guard, amber Alert, guidance text. File is ~568 lines — surgical edit to the `!isAdmin` early return block only.

    **security-settings-page.tsx** — Same: amber Alert with heading + guidance in the `!isAdmin` block.
  </action>
  <verify>
    <automated>cd /Users/tindang/workspaces/tind-repo/pilot-space/frontend && pnpm test -- --reporter=verbose --run 2>&1 | grep -E "PASS|FAIL|ai-not-configured|sso|roles|security" | head -30</automated>
  </verify>
  <done>
    - Banner: dismiss click writes to localStorage; page refresh within 7 days keeps banner dismissed; after TTL (can mock Date.now) banner shows again
    - SSO/Roles/Security: heading visible to non-admin users; alert uses amber not red; guidance text present
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Audit log actor UUID resolution + dashboard greeting fix</name>
  <files>
    frontend/src/features/settings/pages/audit-settings-page.tsx
    frontend/src/features/homepage/components/DailyBrief.tsx
  </files>
  <behavior>
    - Audit: `truncate(entry.actorId, 8)` currently shows raw UUID prefix. Replace with resolved display name lookup. Use existing `useWorkspaceMembers` hook (already used elsewhere in the app at `frontend/src/features/issues/hooks/use-workspace-members.ts`). Build a Map<string, string> of userId -> display label. In actor cell: show member's `fullName || email.split('@')[0]` if found, otherwise truncate UUID to 8 chars + `...` ellipsis.
    - Dashboard: `firstName` is currently `authStore.userDisplayName?.split(' ')[0] ?? ''`. `userDisplayName` in AuthStore falls back to email when no display name is set (line 68 of AuthStore.ts). The result is "e2e-test" shows as the name. Fix: after splitting, check if the result looks like an email local-part (contains no spaces, is same as email prefix). If `authStore.user?.email` prefix matches the computed `firstName`, treat as "no display name" and show empty string. Greeting: `{getGreeting()}{firstName ? `, ${firstName}` : ''}` — already uses this pattern, just need `firstName` to be empty string in that case.
  </behavior>
  <action>
    **audit-settings-page.tsx** — This file is large; read it first. Add `useWorkspaceMembers` import from `@/features/issues/hooks/use-workspace-members`. Call the hook with `workspaceSlug` at the top of `AuditSettingsPage`. Build a memoized `actorNameMap: Map<string, string>` from the members data. In the actor cell (around line 584), replace:
    ```tsx
    <span className="font-mono text-xs">{truncate(entry.actorId, 8)}</span>
    ```
    with:
    ```tsx
    <span className="text-xs">
      {actorNameMap.get(entry.actorId) ?? `${truncate(entry.actorId, 8)}...`}
    </span>
    ```
    The font-mono class is intentional for UUIDs but not needed for names — drop it when a name is resolved.

    **DailyBrief.tsx** — On line 130, current code:
    ```
    const firstName = authStore.userDisplayName?.split(' ')[0] ?? '';
    ```
    Replace with logic that detects email-derived display names:
    ```
    const rawDisplayName = authStore.userDisplayName ?? '';
    const emailPrefix = authStore.user?.email?.split('@')[0] ?? '';
    const firstName = (rawDisplayName && rawDisplayName !== emailPrefix)
      ? rawDisplayName.split(' ')[0]
      : '';
    ```
    This shows "Good evening" (no name) when the user has no display name set, while still showing "Good evening, Tin" when a real display name is configured.
  </action>
  <verify>
    <automated>cd /Users/tindang/workspaces/tind-repo/pilot-space/frontend && pnpm test -- --reporter=verbose --run 2>&1 | grep -E "PASS|FAIL|audit|DailyBrief|brief" | head -20</automated>
  </verify>
  <done>
    - Audit log actor column shows "e2e-test" or "Tin Dang" (resolved name) instead of "4af6dfd9..."
    - Dashboard greeting shows "Good evening" (no name) for email-only users, "Good evening, Tin" for users with display names
  </done>
</task>

</tasks>

<verification>
After all tasks complete, run full frontend quality gate:
```
cd /Users/tindang/workspaces/tind-repo/pilot-space/frontend && pnpm lint && pnpm type-check && pnpm test --run
```
Zero lint errors. Zero type errors. All tests pass.
</verification>

<success_criteria>
- localStorage-based banner dismissal with 7-day TTL (not sessionStorage)
- SSO, Roles, Security pages show heading+description outside isAdmin guard
- Roles, Security non-admin alert uses amber styling with guidance text
- Audit log actor column resolves UUIDs to names/email-prefixes
- Dashboard greeting shows no username when display name equals email prefix
- All frontend quality gates pass
</success_criteria>

<output>
After completion, create `.planning/quick/7-fix-all-ux-audit-issues-from-page-by-pag/7-01-SUMMARY.md`
</output>

---
phase: quick-7
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/features/issues/components/views/board/BoardView.tsx
  - frontend/src/components/issues/IssueCard.tsx
  - frontend/src/features/members/components/member-card.tsx
  - frontend/src/app/(workspace)/[workspaceSlug]/notes/page.tsx
autonomous: true
requirements: []

must_haves:
  truths:
    - "Kanban board shows a gradient fade on right edge when content overflows horizontally"
    - "Issue cards do not render an empty assignee avatar when issue is unassigned"
    - "Member cards show email only once when display name is absent (not repeated in name row)"
    - "Note card content preview text shows first ~100 chars when note has content"
    - "Note sort dropdown is wide enough to show 'Last modified' untruncated"
  artifacts:
    - path: "frontend/src/features/issues/components/views/board/BoardView.tsx"
      provides: "Horizontal scroll gradient fade on board container"
    - path: "frontend/src/components/issues/IssueCard.tsx"
      provides: "Assignee avatar only rendered when issue.assignee is non-null"
    - path: "frontend/src/features/members/components/member-card.tsx"
      provides: "Email row hidden when displayName was already derived from email"
    - path: "frontend/src/app/(workspace)/[workspaceSlug]/notes/page.tsx"
      provides: "Content preview text + min-width on sort dropdown"
  key_links:
    - from: "BoardView scrollable container"
      to: "gradient mask CSS"
      via: "[mask-image] linear-gradient applied when overflow exists"
    - from: "IssueCard assignee block"
      to: "issue.assignee conditional"
      via: "Already conditionally rendered at lines 248 and 403 — verify both branches are correct"
    - from: "MemberCard email paragraph"
      to: "displayName derivation"
      via: "Only show email row when member.fullName exists (email already shown as name otherwise)"
    - from: "NoteGridCard content preview"
      to: "note.content or note.plainTextPreview"
      via: "Show plainTextPreview field if available, else derive from note content summary"
---

<objective>
Fix 4 medium/low UX polish issues: kanban scroll indicator, unassigned issue avatar noise, member
card email duplication, note card content preview and sort dropdown truncation.

Purpose: Reduce visual noise and improve scannability on the most-visited pages.
Output: 4 modified files, all surgical frontend changes.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Kanban scroll fade + unassigned avatar + member card email</name>
  <files>
    frontend/src/features/issues/components/views/board/BoardView.tsx
    frontend/src/components/issues/IssueCard.tsx
    frontend/src/features/members/components/member-card.tsx
  </files>
  <action>
    **BoardView.tsx** — Read the file first. Find the scrollable board container div (the one with `overflow-x-auto` or `gap-3 overflow-x-auto`). Add a wrapping `relative` div and a gradient overlay sibling:
    ```tsx
    <div className="relative">
      <div className={cn('flex h-full gap-3 overflow-x-auto p-3', className)}>
        {/* columns */}
      </div>
      {/* Right-edge fade indicator for horizontal scroll */}
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-background to-transparent"
        aria-hidden="true"
      />
    </div>
    ```
    This is a static gradient (always visible), which is simpler and reliable — the visual cue disappears naturally when the user scrolls all the way right.

    **IssueCard.tsx** — Read the file. The assignee avatar is already conditionally rendered (`{issue.assignee ? (...)}`). Verify BOTH density branches (compact at ~line 248 and default at ~line 403) correctly gate on `issue.assignee`. If either branch renders an empty avatar circle when `issue.assignee` is null/undefined, add the null guard. No change needed if already correct — confirm by reading.

    **member-card.tsx** — Currently: `displayName = member.fullName || member.email.split('@')[0] || member.email`. When `member.fullName` is null/empty, `displayName` is derived from email. Then the email paragraph below (`{member.email}`) shows the full email. This creates duplication: name row shows "e2e-member" and email row shows "e2e-member@pilotspace.dev". Fix: only render the email paragraph when `member.fullName` is non-empty:
    ```tsx
    {/* Email — only show when we have a real display name, otherwise name already shows email-derived text */}
    {member.fullName && (
      <p className="text-center text-xs text-muted-foreground truncate max-w-full">
        {member.email}
      </p>
    )}
    ```
  </action>
  <verify>
    <automated>cd /Users/tindang/workspaces/tind-repo/pilot-space/frontend && pnpm test -- --reporter=verbose --run 2>&1 | grep -E "PASS|FAIL|BoardView|IssueCard|member-card|MemberCard" | head -20</automated>
  </verify>
  <done>
    - Board container has right-edge gradient overlay
    - Issue cards with null assignee have no avatar circle rendered
    - Member cards with no fullName show email only once (as name row, not repeated below)
    - If both assignee branches in IssueCard.tsx are already null-guarded, confirm by comment in task summary — no file change required
  </done>
</task>

<task type="auto">
  <name>Task 2: Note card content preview + sort dropdown min-width</name>
  <files>
    frontend/src/app/(workspace)/[workspaceSlug]/notes/page.tsx
  </files>
  <action>
    Read the file first (it's large, surgical edits only).

    **Content preview in NoteGridCard** — The card currently shows `topics.join(', ')` or "No topics" as the fallback. The Note type may have a `plainTextPreview` or `summary` field; check what the API returns. If `note.plainTextPreview` exists, use that. Otherwise, construct preview from topics or just the title area. Change the fallback paragraph (~line 142):
    ```tsx
    {/* Content preview or topics */}
    {linkedIssues.length === 0 && (
      <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">
        {note.plainTextPreview
          ? note.plainTextPreview.slice(0, 100)
          : topics.length > 0
            ? topics.join(', ')
            : null}
      </p>
    )}
    ```
    Crucially: DO NOT render "No topics" — if there's nothing to show, render nothing (null). Remove the "No topics" fallback string entirely.

    **Word count — remove "0 words" noise** — In the stats row (line 148), change:
    ```tsx
    <span>{(note.wordCount ?? 0).toLocaleString()} words</span>
    ```
    to:
    ```tsx
    {(note.wordCount ?? 0) > 0 && (
      <span>{note.wordCount!.toLocaleString()} words</span>
    )}
    ```

    **Sort dropdown min-width** — Find the SelectTrigger for the sort dropdown (around line 488+). Add `className="min-w-[140px]"` to the SelectTrigger to prevent "Last modif..." truncation:
    ```tsx
    <SelectTrigger className="h-8 min-w-[140px] text-xs">
    ```

    Apply same preview logic to `NoteListRow` if it also shows "No topics".
  </action>
  <verify>
    <automated>cd /Users/tindang/workspaces/tind-repo/pilot-space/frontend && pnpm test -- --reporter=verbose --run 2>&1 | grep -E "PASS|FAIL|note-cards|notes" | head -20</automated>
  </verify>
  <done>
    - Note grid cards show content preview text (or nothing) instead of "No topics"
    - "0 words" is not rendered on cards with no content
    - Sort dropdown trigger is wide enough to show "Last modified" untruncated
  </done>
</task>

</tasks>

<verification>
```
cd /Users/tindang/workspaces/tind-repo/pilot-space/frontend && pnpm lint && pnpm type-check && pnpm test --run
```
Zero lint/type errors. All tests pass.
</verification>

<success_criteria>
- Kanban board has right-edge gradient indicating more columns to scroll
- Unassigned issues have no avatar circle
- Member cards with no display name show email only once
- Note cards show content preview, not "No topics" noise
- Sort dropdown shows full "Last modified" label
</success_criteria>

<output>
After completion, update `.planning/quick/7-fix-all-ux-audit-issues-from-page-by-pag/7-01-SUMMARY.md` or create `7-02-SUMMARY.md`
</output>

---
phase: quick-7
plan: 03
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/components/projects/ProjectCard.tsx
  - frontend/src/app/(workspace)/[workspaceSlug]/projects/[projectId]/cycles/page.tsx
  - frontend/src/features/issues/components/graph-empty-state.tsx
  - frontend/src/app/(workspace)/[workspaceSlug]/projects/[projectId]/settings/page.tsx
  - frontend/src/app/(auth)/login/page.tsx
autonomous: true
requirements: []

must_haves:
  truths:
    - "Project card hides progress ring when progress is 0% (no empty circle rendered)"
    - "Cycle card hides progress bar when progress is 0%"
    - "Knowledge graph empty state has descriptive text and a CTA button"
    - "Project settings Icon field has helper text"
    - "Login page error banner shows AlertTriangle icon"
    - "Login page Terms/Privacy links are actual anchor tags"
  artifacts:
    - path: "frontend/src/components/projects/ProjectCard.tsx"
      provides: "ProgressRing only rendered when progress > 0"
    - path: "frontend/src/app/(workspace)/[workspaceSlug]/projects/[projectId]/cycles/page.tsx"
      provides: "Progress bar hidden at 0%, text '0%' shown instead"
    - path: "frontend/src/features/issues/components/graph-empty-state.tsx"
      provides: "Empty state has description text and CTA"
    - path: "frontend/src/app/(auth)/login/page.tsx"
      provides: "Error banner has AlertTriangle icon; Terms/Privacy are anchor tags"
  key_links:
    - from: "ProjectCard ProgressRing component"
      to: "progress variable"
      via: "Conditional: {progress > 0 && <ProgressRing .../>}"
    - from: "Cycles page Progress component"
      to: "completionPercentage value"
      via: "Conditional render based on completionPercentage > 0"
    - from: "GraphEmptyState empty variant"
      to: "description + CTA"
      via: "Add p tag + Button with workspaceSlug link or onCreateNote callback"
    - from: "Login error div"
      to: "AlertTriangle icon"
      via: "Prepend <AlertTriangle className='h-4 w-4' /> to error message container"
---

<objective>
Fix 6 low-priority UX polish issues: project/cycle progress rings at 0%, knowledge graph empty state
description, project settings icon helper text, login error icon, and Terms/Privacy links.

Purpose: Remove visual noise and improve clarity on edge cases.
Output: 5 modified files, all surgical frontend changes.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Project and cycle progress ring/bar at 0% + knowledge graph empty state</name>
  <files>
    frontend/src/components/projects/ProjectCard.tsx
    frontend/src/app/(workspace)/[workspaceSlug]/projects/[projectId]/cycles/page.tsx
    frontend/src/features/issues/components/graph-empty-state.tsx
  </files>
  <action>
    **ProjectCard.tsx** — Read the file. `progress` is computed as `completedCount / project.issueCount` (0 when no issues). `ProgressRing` is rendered at two places (compact ~line 122, default ~line 170). Wrap each with a conditional:
    ```tsx
    {progress > 0 && <ProgressRing progress={progress} size={24} />}
    ```
    For the default variant at ~line 170, same conditional. The `{completedCount}/{project.issueCount} issues` text should remain visible regardless.

    **cycles/page.tsx** — Read the file. Find the `<Progress value={completionPercentage} />` block (~line 221-227). The surrounding structure shows a label "Progress" and the Progress bar. Replace with:
    ```tsx
    {completionPercentage > 0 ? (
      <Progress value={completionPercentage} className="h-2" />
    ) : (
      <p className="text-sm text-muted-foreground">0%</p>
    )}
    ```
    This is inside the cycle metrics card — surgical edit to the conditional rendering of the Progress component only.

    **graph-empty-state.tsx** — Read the file. In the `empty` variant section (~line 76-112), add a description and CTA after "No knowledge graph yet":
    ```tsx
    <p className="text-sm text-muted-foreground">No knowledge graph yet</p>
    <p className="mt-1 text-xs text-muted-foreground max-w-xs text-center">
      The knowledge graph visualizes relationships between your notes, issues, and code.
    </p>
    ```
    This component doesn't have access to `workspaceSlug`, so skip the CTA button unless a prop can be added. Check the component interface — if `onCreateNote?: () => void` prop is easy to add and the caller `project-knowledge-graph.tsx` can pass it, add it. Otherwise just add the description text.
  </action>
  <verify>
    <automated>cd /Users/tindang/workspaces/tind-repo/pilot-space/frontend && pnpm test -- --reporter=verbose --run 2>&1 | grep -E "PASS|FAIL|ProjectCard|project-card|graph-empty|cycles" | head -20</automated>
  </verify>
  <done>
    - Project card shows no ring when all issues are open (progress = 0)
    - Cycle card shows "0%" text instead of empty progress bar when no issues completed
    - Knowledge graph empty state has descriptive explanation text
  </done>
</task>

<task type="auto">
  <name>Task 2: Login page error icon + Terms/Privacy links + project settings icon helper</name>
  <files>
    frontend/src/app/(auth)/login/page.tsx
    frontend/src/app/(workspace)/[workspaceSlug]/projects/[projectId]/settings/page.tsx
  </files>
  <action>
    **login/page.tsx** — Read the file first. Find the error display block (the `id="auth-error"` div at ~line 279 and ~line 306). The error container is likely a div with red/pink background. Add `AlertTriangle` import from lucide-react and prepend the icon:
    ```tsx
    <div id="auth-error" role="alert" className="...existing classes...">
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{error}</span>
    </div>
    ```
    Make the container `flex items-center gap-2` if not already.

    Find the Terms/Privacy text (~line 368): "By continuing, you agree to our Terms of Service and Privacy Policy."
    Replace with:
    ```tsx
    By continuing, you agree to our{' '}
    <a href="#" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
      Terms of Service
    </a>
    {' '}and{' '}
    <a href="#" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
      Privacy Policy
    </a>.
    ```

    **projects/[projectId]/settings/page.tsx** — Read the file. Find the Icon input field (~line 111). Add a helper text paragraph after the Input:
    ```tsx
    <p className="text-xs text-muted-foreground">
      Enter an emoji or a single letter to identify this project.
    </p>
    ```
  </action>
  <verify>
    <automated>cd /Users/tindang/workspaces/tind-repo/pilot-space/frontend && pnpm lint 2>&1 | grep -E "error|warning" | grep -v "node_modules" | head -20</automated>
  </verify>
  <done>
    - Login error banner has AlertTriangle icon on the left
    - "Terms of Service" and "Privacy Policy" are clickable anchor tags with href="#" and target="_blank"
    - Project settings Icon field has helper text below the input
    - No lint errors
  </done>
</task>

</tasks>

<verification>
```
cd /Users/tindang/workspaces/tind-repo/pilot-space/frontend && pnpm lint && pnpm type-check && pnpm test --run
```
Zero errors. All tests pass.
</verification>

<success_criteria>
- No empty progress ring on project cards with 0 completed issues
- Cycle progress shows "0%" text at zero, not empty bar
- Knowledge graph explains what it is in the empty state
- Login error has icon; Terms/Privacy are anchor links
- Project settings Icon field has guidance text
</success_criteria>

<output>
After completion, create `.planning/quick/7-fix-all-ux-audit-issues-from-page-by-pag/7-03-SUMMARY.md`
</output>
