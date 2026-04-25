/**
 * resolveLucideIcon — map a string icon name (from backend Skill.icon) to a
 * lucide-react component. Tree-shake-friendly via an explicit static import
 * map — no runtime `eval`, no `React.lazy(() => import(name))`.
 *
 * Phase 91 Plan 03 Task 1.
 *
 * Fallback is `Sparkles` to match `91-CONTEXT.md` §Claude's Discretion:
 *   "Card icon — render the icon field literally as a Lucide icon name;
 *    fallback to Sparkles if name is unknown."
 *
 * The supported set is the union of:
 *   - the chat-composer SkillMenu ICON_MAP (keeps parity with `/skill` UX)
 *   - the names emitted by `backend/.../ai/skills/skill_metadata.py`
 *     SKILL_UI_METADATA values, so any backend-defined skill renders correctly.
 *
 * Threat model T-91-12 mitigation: an unknown or hostile `skill.icon` string
 * cannot escape the static map; it falls back to Sparkles.
 */
import {
  Sparkles,
  ListTodo,
  UserCog,
  Copy,
  Network,
  GitBranch,
  PenTool,
  FileText,
  History,
  Plus,
  FilePlus,
  Newspaper,
  BookOpen,
  LayoutDashboard,
  Wand2,
  AlertTriangle,
  ShieldAlert,
  BookOpenCheck,
  ClipboardCheck,
  FileSearch,
  Code2,
  Terminal,
  Hammer,
  type LucideIcon,
} from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  Sparkles,
  ListTodo,
  UserCog,
  Copy,
  Network,
  GitBranch,
  PenTool,
  FileText,
  History,
  Plus,
  FilePlus,
  Newspaper,
  BookOpen,
  LayoutDashboard,
  Wand2,
  AlertTriangle,
  ShieldAlert,
  BookOpenCheck,
  ClipboardCheck,
  FileSearch,
  Code2,
  Terminal,
  Hammer,
};

/**
 * Resolve a skill's `icon` string to a lucide-react component.
 *
 * @param name — the icon name as authored in the skill frontmatter, or null/undefined.
 * @param fallback — component to return when `name` is missing or unknown. Defaults to `Sparkles`.
 */
export function resolveLucideIcon(
  name: string | null | undefined,
  fallback: LucideIcon = Sparkles,
): LucideIcon {
  if (!name) return fallback;
  return ICON_MAP[name] ?? fallback;
}
