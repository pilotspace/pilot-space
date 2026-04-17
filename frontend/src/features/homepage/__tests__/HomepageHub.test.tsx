import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock MobX observer as passthrough
vi.mock('mobx-react-lite', () => ({
  observer: (component: React.FC) => component,
}));

// Mock SessionListStore
const mockFetchSessions = vi.fn().mockResolvedValue(undefined);
const mockSessions: unknown[] = [];

vi.mock('@/stores/ai/SessionListStore', () => ({
  SessionListStore: vi.fn().mockImplementation(() => ({
    sessions: mockSessions,
    fetchSessions: mockFetchSessions,
  })),
}));

// Mock AIStore
const mockPilotSpaceStore = {
  workspaceId: '',
  setWorkspaceId: vi.fn(),
};

vi.mock('@/stores/ai/AIStore', () => ({
  getAIStore: () => ({
    pilotSpace: mockPilotSpaceStore,
  }),
}));

import { HomepageHub } from '../components/HomepageHub';

describe('HomepageHub', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPush.mockReset();
  });

  it('renders hero heading "What would you like to build?"', () => {
    render(<HomepageHub workspaceSlug="test-ws" />);

    expect(
      screen.getByText('What would you like to build?')
    ).toBeInTheDocument();
  });

  it('renders the chat hero input with correct placeholder', () => {
    render(<HomepageHub workspaceSlug="test-ws" />);

    const input = screen.getByPlaceholderText(
      'Describe a feature, ask about your sprint, or request a PR review...'
    );
    expect(input).toBeInTheDocument();
  });

  it('renders 4 quick action cards', () => {
    render(<HomepageHub workspaceSlug="test-ws" />);

    expect(screen.getByText('Create issues from idea')).toBeInTheDocument();
    expect(screen.getByText('Review my PR')).toBeInTheDocument();
    expect(screen.getByText('Generate spec from notes')).toBeInTheDocument();
    expect(screen.getByText('Check sprint status')).toBeInTheDocument();
  });

  it('quick action click navigates to /chat?prefill=...', () => {
    render(<HomepageHub workspaceSlug="test-ws" />);

    const card = screen.getByRole('button', { name: 'Create issues from idea' });
    fireEvent.click(card);

    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining('/test-ws/chat?prefill=')
    );
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining('Create%20issues%20from%20this%20idea')
    );
  });

  it('quick action card navigates with encoded prompt', () => {
    render(<HomepageHub workspaceSlug="my-ws" />);

    const card = screen.getByRole('button', { name: 'Check sprint status' });
    fireEvent.click(card);

    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining('/my-ws/chat?prefill=')
    );
  });

  it('does NOT render DailyBrief', () => {
    render(<HomepageHub workspaceSlug="test-ws" />);

    expect(screen.queryByTestId('daily-brief')).not.toBeInTheDocument();
  });

  it('does not render recent conversations section when no sessions', () => {
    render(<HomepageHub workspaceSlug="test-ws" />);

    expect(screen.queryByText('Recent Conversations')).not.toBeInTheDocument();
  });

  it('keyboard Enter on quick action card triggers navigation', () => {
    render(<HomepageHub workspaceSlug="test-ws" />);

    const card = screen.getByRole('button', { name: 'Review my PR' });
    fireEvent.keyDown(card, { key: 'Enter' });

    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining('/test-ws/chat?prefill=')
    );
  });

  it('keyboard Space on quick action card triggers navigation', () => {
    render(<HomepageHub workspaceSlug="test-ws" />);

    const card = screen.getByRole('button', { name: 'Generate spec from notes' });
    fireEvent.keyDown(card, { key: ' ' });

    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining('/test-ws/chat?prefill=')
    );
  });
});
