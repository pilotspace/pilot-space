/**
 * Axios wrappers for `/api/v1/proposals/*` endpoints (Phase 89 Plan 02).
 *
 * All mutation endpoints return a `ProposalEnvelope` of the updated
 * proposal so the UI can swap card → receipt without a follow-up fetch.
 */

import { apiClient } from '@/services/api/client';
import type {
  ProposalEnvelope,
  ProposalListResponse,
  RejectProposalRequestBody,
  RetryProposalRequestBody,
  RevertResultEnvelope,
  VersionHistoryResponse,
} from './types';

const BASE = '/proposals';

export function acceptProposal(id: string): Promise<ProposalEnvelope> {
  return apiClient.post<ProposalEnvelope>(`${BASE}/${id}/accept`, {});
}

export function rejectProposal(id: string, reason?: string): Promise<ProposalEnvelope> {
  const body: RejectProposalRequestBody = reason ? { reason } : {};
  return apiClient.post<ProposalEnvelope>(`${BASE}/${id}/reject`, body);
}

export function retryProposal(id: string, hint?: string): Promise<ProposalEnvelope> {
  const body: RetryProposalRequestBody = hint ? { hint } : {};
  return apiClient.post<ProposalEnvelope>(`${BASE}/${id}/retry`, body);
}

export function listProposals(sessionId: string): Promise<ProposalListResponse> {
  return apiClient.get<ProposalListResponse>(BASE, {
    params: { session_id: sessionId },
  });
}

/**
 * Phase 89 Plan 05 — POST /proposals/{id}/revert. Restores the artifact
 * to the pre-apply snapshot if within the server-authoritative 10-minute
 * window and the proposal is still in APPLIED state. 409 otherwise
 * (application/problem+json).
 */
export function revertProposal(id: string): Promise<RevertResultEnvelope> {
  return apiClient.post<RevertResultEnvelope>(`${BASE}/${id}/revert`, {});
}

/**
 * Phase 89 Plan 05 — read-only version history surface. Usually inlined
 * on GET /issues/{id}; kept here for parity with the backend wrapper
 * schema and any future per-artifact dedicated endpoint.
 */
export function listVersionHistory(
  artifactType: string,
  artifactId: string
): Promise<VersionHistoryResponse> {
  return apiClient.get<VersionHistoryResponse>(
    `/${artifactType.toLowerCase()}s/${artifactId}/version-history`
  );
}

export const proposalApi = {
  acceptProposal,
  rejectProposal,
  retryProposal,
  revertProposal,
  listProposals,
  listVersionHistory,
};
