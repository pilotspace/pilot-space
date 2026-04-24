/**
 * Frontend TypeScript mirror of the backend `ProposalEnvelope` (Phase 89
 * Plan 02). All fields arrive camelCase via the BaseSchema alias generator.
 *
 * DO NOT drift from `backend/src/pilot_space/api/v1/schemas/proposals.py` —
 * any field added there must be mirrored here or cast-access will silently
 * return `undefined`.
 */

export type ProposalStatus =
  | 'pending'
  | 'applied'
  | 'rejected'
  | 'retried'
  | 'errored'
  | 'reverted';
export type DiffKind = 'text' | 'fields';
export type ArtifactType = 'NOTE' | 'ISSUE' | 'SPEC' | 'DECISION';
export type ChatMode = 'plan' | 'act' | 'research' | 'draft';

/** Unified-diff hunk — exactly as emitted by backend diff_builders. */
export interface TextDiffHunk {
  op: 'equal' | 'insert' | 'delete';
  text: string;
}

export interface TextDiffPayload {
  kind: 'text';
  hunks: TextDiffHunk[];
}

export interface FieldDiffRowPayload {
  field: string;
  label: string;
  before: unknown;
  after: unknown;
}

export interface FieldsDiffPayload {
  kind: 'fields';
  rows: FieldDiffRowPayload[];
}

export type DiffPayload = TextDiffPayload | FieldsDiffPayload;

/**
 * Mirror of `ProposalEnvelope` Pydantic schema.
 * `diffPayload` is typed loose in tests but narrowed by `diffKind` at render.
 */
export interface ProposalEnvelope {
  id: string;
  workspaceId: string;
  sessionId: string;
  messageId: string;
  targetArtifactType: ArtifactType;
  targetArtifactId: string;
  intentTool: string;
  intentArgs: Record<string, unknown>;
  diffKind: DiffKind;
  diffPayload: DiffPayload | Record<string, unknown>;
  reasoning: string | null;
  status: ProposalStatus;
  appliedVersion: number | null;
  decidedAt: string | null;
  decidedBy: string | null;
  createdAt: string;
  // REV-89-01-A / REV-89-02-A policy flags (always present; default-true/false on backend).
  mode: ChatMode;
  acceptDisabled: boolean;
  persist: boolean;
  planPreviewOnly: boolean;
}

// -----------------------------------------------------------------------------
// SSE event payloads.
// -----------------------------------------------------------------------------

/**
 * `proposal_request` SSE frame uses flat composition — payload is a
 * `ProposalEnvelope` plus `eventTimestamp` at the top level. The frontend
 * can cast `event.data as ProposalEnvelope` directly.
 */
export type ProposalRequestEventData = ProposalEnvelope & {
  eventTimestamp: string;
};

export interface ProposalAppliedEventData {
  proposalId: string;
  appliedVersion: number;
  linesChanged: number | null;
  timestamp: string;
}

export interface ProposalRejectedEventData {
  proposalId: string;
  reason: string | null;
  timestamp: string;
}

export interface ProposalRetriedEventData {
  proposalId: string;
  hint: string | null;
  timestamp: string;
}

// Phase 89 Plan 05 — revert pipeline. Mirrors
// backend/src/pilot_space/api/v1/schemas/proposals.py camelCase aliases.

/** One entry in an artifact's append-only version history. `vN` is wire alias for the version number. */
export interface VersionHistoryEntry {
  vN: number;
  by: 'ai' | 'user';
  at: string;
  summary: string;
  snapshot: Record<string, unknown>;
}

/** Separate wrapper returned by a dedicated history endpoint. */
export interface VersionHistoryResponse {
  versionNumber: number;
  history: VersionHistoryEntry[];
}

/** POST /proposals/{id}/revert response envelope. */
export interface RevertResultEnvelope {
  proposal: ProposalEnvelope;
  newVersionNumber: number;
  newHistoryEntry: VersionHistoryEntry;
}

/** `proposal_reverted` SSE frame data. */
export interface ProposalRevertedEventData {
  proposalId: string;
  newVersionNumber: number;
  revertedFromVersion: number;
  timestamp: string;
}

// -----------------------------------------------------------------------------
// REST bodies / responses (mirror backend).
// -----------------------------------------------------------------------------

export interface RejectProposalRequestBody {
  reason?: string | null;
}

export interface RetryProposalRequestBody {
  hint?: string | null;
}

export interface ProposalListResponse {
  proposals: ProposalEnvelope[];
  pendingCount: number;
}
