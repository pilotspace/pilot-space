/**
 * Sidebar responsive tests — Phase 94 Plan 02 (MIG-03).
 *
 * Verifies the `data-sidebar-mode` attribute reflects the value of
 * `useViewport().sidebarMode` so e2e specs can assert layout shape per
 * breakpoint. The visual width-collapse is governed by `sidebarCollapsed`
 * (driven by app-shell's auto-collapse on mobile/tablet) — this test only
 * confirms the *spec-mode* attribute round-trips faithfully.
 *
 * Re-uses the heavy mock harness from sidebar.test.tsx via a reduced clone:
 * we only need enough wiring to render `<Sidebar />` once per mode and
 * inspect the root data attribute.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { makeAutoObservable } from 'mobx';
import { TooltipProvider } from '@/components/ui/tooltip';

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
}

const hoisted = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
  pathname: '/alpha',
  params: { workspaceSlug: 'alpha' } as { workspaceSlug: string },
  addRecentWorkspace: vi.fn(),
  openSettings: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: hoisted.push,
    replace: hoisted.replace,
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  usePathname: () => hoisted.pathname,
  useSearchParams: () => hoisted.searchParams,
  useParams: () => hoisted.params,
}));

vi.mock('@/hooks/useSwitcherQueryStringSync', () => ({
  useSwitcherQueryStringSync: () => undefined,
}));
vi.mock('@/components/workspace-selector', () => ({
  addRecentWorkspace: (slug: string) => hoisted.addRecentWorkspace(slug),
  getRecentWorkspaces: () => [{ slug: 'alpha', lastVisited: 1 }],
}));
vi.mock('@/lib/workspace-nav', () => ({
  getLastWorkspacePath: (slug: string) => `/${slug}`,
  getOrderedRecentWorkspaces: () => [],
}));
vi.mock('@/features/settings/settings-modal-context', () => ({
  useSettingsModal: () => ({
    open: false,
    activeSection: 'general',
    openSettings: hoisted.openSettings,
    closeSettings: vi.fn(),
    setActiveSection: vi.fn(),
  }),
}));
vi.mock('@/services/api/workspaces', () => ({
  workspacesApi: {
    get: vi.fn(),
    list: vi.fn().mockResolvedValue({ items: [] }),
    create: vi.fn(),
  },
}));

class TestUIStore {
  sidebarCollapsed = false;
  workspaceSwitcherOpen = false;
  commandPaletteOpen = false;
  theme: 'light' | 'dark' | 'system' = 'system';
  isFocusMode = false;
  sidebarWidth = 240;
  constructor() {
    makeAutoObservable(this);
  }
  toggleSidebar(): void {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }
  setSidebarCollapsed(v: boolean): void {
    this.sidebarCollapsed = v;
  }
  setTheme(v: 'light' | 'dark' | 'system'): void {
    this.theme = v;
  }
  openCommandPalette(): void {
    this.commandPaletteOpen = true;
  }
  closeCommandPalette(): void {
    this.commandPaletteOpen = false;
  }
  toggleCommandPalette(): void {
    this.commandPaletteOpen = !this.commandPaletteOpen;
  }
  openWorkspaceSwitcher(): void {
    this.workspaceSwitcherOpen = true;
  }
  closeWorkspaceSwitcher(): void {
    this.workspaceSwitcherOpen = false;
  }
}

const featureToggles = {
  notes: true,
  issues: true,
  projects: true,
  members: true,
  knowledge: true,
  docs: true,
  skills: true,
  costs: true,
  approvals: true,
};

class TestWorkspaceStore {
  workspaces = new Map([
    ['id-alpha', { id: 'id-alpha', slug: 'alpha', name: 'Alpha' }],
  ]);
  currentWorkspaceId: string | null = 'id-alpha';
  currentUserRole = 'owner' as const;
  error: string | null = null;
  featureToggles = featureToggles;
  isLoading = false;
  constructor() {
    makeAutoObservable(this);
  }
  get workspaceList() {
    return Array.from(this.workspaces.values());
  }
  get currentWorkspace() {
    return this.workspaces.get('id-alpha') ?? null;
  }
  getWorkspaceBySlug(slug: string) {
    return this.workspaceList.find((w) => w.slug === slug);
  }
  isFeatureEnabled(key: keyof typeof featureToggles): boolean {
    return !!this.featureToggles[key];
  }
  selectWorkspace(): void {}
  fetchWorkspaces(): void {}
  async createWorkspace() {
    return null;
  }
}

class TestNotificationStore {
  unreadCount = 0;
  constructor() {
    makeAutoObservable(this);
  }
  startPolling(): void {}
  stopPolling(): void {}
  fetchNotifications(): void {}
  fetchUnreadCount(): void {}
  markAllAsRead(): void {}
  markAsRead(): void {}
}

class TestAuthStore {
  user = { id: 'u1', name: 'Test', email: 't@t.com', avatarUrl: null };
  userDisplayName = 'Test';
  userInitials = 'TT';
  isAuthenticated = true;
  constructor() {
    makeAutoObservable(this);
  }
  logout(): void {}
}

let stubStores: {
  uiStore: TestUIStore;
  workspaceStore: TestWorkspaceStore;
  notificationStore: TestNotificationStore;
  authStore: TestAuthStore;
} | null = null;

vi.mock('@/stores', () => ({
  useUIStore: () => stubStores!.uiStore,
  useWorkspaceStore: () => stubStores!.workspaceStore,
  useNotificationStore: () => stubStores!.notificationStore,
  useAuthStore: () => stubStores!.authStore,
}));

vi.mock('@/features/notes/hooks', () => ({
  useCreateNote: () => ({ mutate: vi.fn(), isPending: false }),
  createNoteDefaults: () => ({}),
}));
vi.mock('@/features/projects/hooks/useProjects', () => ({
  useProjects: () => ({ data: { items: [] }, isLoading: false }),
}));
vi.mock('@/features/approvals/hooks/use-approvals', () => ({
  usePendingApprovalCount: () => 0,
}));
vi.mock('@/hooks/usePinnedNotes', () => ({
  usePinnedNotes: () => ({ data: [] }),
}));
vi.mock('@/hooks/useMediaQuery', () => ({
  useResponsive: () => ({ isSmallScreen: false }),
}));
vi.mock('@/components/layout/notification-panel', () => ({
  NotificationPanel: () => <div data-testid="notification-panel-stub" />,
}));
vi.mock('@/features/notes/components/TemplatePicker', () => ({
  TemplatePicker: () => null,
}));
vi.mock('@/features/topics/components', () => ({
  TopicTreeContainer: () => <div data-testid="topic-tree-stub" />,
}));
vi.mock('@/components/layout/workspace-switcher', () => ({
  WorkspaceSwitcher: () => <div data-testid="workspace-switcher-stub" />,
}));

const viewportMock = vi.hoisted(() => ({
  current: {
    width: 1280,
    isXs: false,
    isSm: true,
    isMd: true,
    isLg: true,
    isXl: true,
    sidebarMode: 'full' as 'full' | 'rail' | 'drawer',
    peekMode: 'side' as 'side' | 'bottom-sheet',
    splitMode: 'panes' as 'panes' | 'tabs',
  },
}));
vi.mock('@/hooks/useViewport', () => ({
  useViewport: () => viewportMock.current,
}));

import { Sidebar } from '../sidebar';

function setMode(mode: 'full' | 'rail' | 'drawer'): void {
  const w = mode === 'full' ? 1400 : mode === 'rail' ? 900 : 600;
  viewportMock.current = {
    width: w,
    isXs: w < 425,
    isSm: w >= 640,
    isMd: w >= 768,
    isLg: w >= 1024,
    isXl: w >= 1280,
    sidebarMode: mode,
    peekMode: w >= 768 ? 'side' : 'bottom-sheet',
    splitMode: w >= 768 ? 'panes' : 'tabs',
  };
}

function renderSidebar() {
  return render(
    <TooltipProvider>
      <Sidebar />
    </TooltipProvider>,
  );
}

describe('Sidebar — responsive (MIG-03)', () => {
  beforeEach(() => {
    stubStores = {
      uiStore: new TestUIStore(),
      workspaceStore: new TestWorkspaceStore(),
      notificationStore: new TestNotificationStore(),
      authStore: new TestAuthStore(),
    };
    setMode('full');
  });

  it('exposes data-sidebar-mode="full" at xl viewport', () => {
    setMode('full');
    renderSidebar();
    expect(screen.getByTestId('sidebar')).toHaveAttribute('data-sidebar-mode', 'full');
  });

  it('exposes data-sidebar-mode="rail" at md/lg viewport', () => {
    setMode('rail');
    renderSidebar();
    expect(screen.getByTestId('sidebar')).toHaveAttribute('data-sidebar-mode', 'rail');
  });

  it('exposes data-sidebar-mode="drawer" at <md viewport', () => {
    setMode('drawer');
    renderSidebar();
    expect(screen.getByTestId('sidebar')).toHaveAttribute('data-sidebar-mode', 'drawer');
  });
});
