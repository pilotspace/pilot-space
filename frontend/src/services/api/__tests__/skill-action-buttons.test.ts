/**
 * Skill Action Buttons API client tests — SKBTN-01, SKBTN-02
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { actionButtonsApi, ACTION_BUTTONS_KEY } from '../skill-action-buttons';

// Mock the API client
vi.mock('../client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import { apiClient } from '../client';

const mockClient = apiClient as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const WORKSPACE_ID = 'ws-123';

describe('actionButtonsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getButtons calls GET /workspaces/{id}/action-buttons', async () => {
    const mockData = [{ id: 'btn-1', name: 'Test' }];
    mockClient.get.mockResolvedValue(mockData);

    const result = await actionButtonsApi.getButtons(WORKSPACE_ID);

    expect(mockClient.get).toHaveBeenCalledWith(`/workspaces/${WORKSPACE_ID}/action-buttons`);
    expect(result).toEqual(mockData);
  });

  it('getAdminButtons calls GET /workspaces/{id}/action-buttons/admin', async () => {
    const mockData = [{ id: 'btn-1', name: 'Test' }];
    mockClient.get.mockResolvedValue(mockData);

    const result = await actionButtonsApi.getAdminButtons(WORKSPACE_ID);

    expect(mockClient.get).toHaveBeenCalledWith(`/workspaces/${WORKSPACE_ID}/action-buttons/admin`);
    expect(result).toEqual(mockData);
  });

  it('createButton calls POST /workspaces/{id}/action-buttons', async () => {
    const payload = { name: 'New Button', binding_type: 'skill' as const };
    const mockResponse = { id: 'btn-2', ...payload };
    mockClient.post.mockResolvedValue(mockResponse);

    const result = await actionButtonsApi.createButton(WORKSPACE_ID, payload);

    expect(mockClient.post).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/action-buttons`,
      payload
    );
    expect(result).toEqual(mockResponse);
  });

  it('updateButton calls PATCH /workspaces/{id}/action-buttons/{buttonId}', async () => {
    const buttonId = 'btn-1';
    const payload = { name: 'Updated' };
    mockClient.patch.mockResolvedValue({ id: buttonId, ...payload });

    await actionButtonsApi.updateButton(WORKSPACE_ID, buttonId, payload);

    expect(mockClient.patch).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/action-buttons/${buttonId}`,
      payload
    );
  });

  it('reorderButtons calls PUT /workspaces/{id}/action-buttons/reorder', async () => {
    const buttonIds = ['btn-2', 'btn-1', 'btn-3'];
    mockClient.put.mockResolvedValue(undefined);

    await actionButtonsApi.reorderButtons(WORKSPACE_ID, buttonIds);

    expect(mockClient.put).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/action-buttons/reorder`,
      { button_ids: buttonIds }
    );
  });

  it('deleteButton calls DELETE /workspaces/{id}/action-buttons/{buttonId}', async () => {
    const buttonId = 'btn-1';
    mockClient.delete.mockResolvedValue(undefined);

    await actionButtonsApi.deleteButton(WORKSPACE_ID, buttonId);

    expect(mockClient.delete).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/action-buttons/${buttonId}`
    );
  });
});

describe('ACTION_BUTTONS_KEY', () => {
  it('exports the query key constant', () => {
    expect(ACTION_BUTTONS_KEY).toBe('action-buttons');
  });
});
