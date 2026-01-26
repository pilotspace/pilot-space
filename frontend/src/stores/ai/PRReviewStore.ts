/**
 * PR Review Store - MobX store for AI-powered PR review state management.
 *
 * T147-T149: Manages PR review request lifecycle with SSE streaming.
 * Provides:
 * - Review aspect progress tracking (5 aspects)
 * - Review result caching per PR
 * - Token usage and cost tracking
 * - SSE connection management
 *
 * @see specs/004-mvp-agents-build/tasks/Wave6-Track3-T143-T153.md
 */

import { makeAutoObservable, runInAction } from 'mobx';
import type { AIStore } from './AIStore';
import { SSEClient } from '@/lib/sse-client';
import { aiApi } from '@/services/api/ai';

// ============================================================================
// Types
// ============================================================================

export type ReviewAspectName =
  | 'architecture'
  | 'security'
  | 'quality'
  | 'performance'
  | 'documentation';

export type AspectStatus = 'pending' | 'in_progress' | 'complete';

export interface ReviewAspect {
  name: ReviewAspectName;
  status: AspectStatus;
}

export type FindingSeverity = 'critical' | 'warning' | 'info' | 'success';

export interface ReviewFinding {
  severity: FindingSeverity;
  message: string;
  file?: string;
  line?: number;
  suggestion?: string;
}

export interface PRReviewResult {
  summary: string;
  architecture: ReviewFinding[];
  security: ReviewFinding[];
  quality: ReviewFinding[];
  performance: ReviewFinding[];
  documentation: ReviewFinding[];
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

// SSE Event types
interface AspectEvent {
  aspect: ReviewAspectName;
  status: AspectStatus;
}

interface CompleteEvent {
  result: PRReviewResult;
  tokenUsage: TokenUsage;
}

// ============================================================================
// Store
// ============================================================================

export class PRReviewStore {
  // State
  aspects: ReviewAspect[] = [
    { name: 'architecture', status: 'pending' },
    { name: 'security', status: 'pending' },
    { name: 'quality', status: 'pending' },
    { name: 'performance', status: 'pending' },
    { name: 'documentation', status: 'pending' },
  ];

  result: PRReviewResult | null = null;
  tokenUsage: TokenUsage | null = null;
  isLoading = false;
  error: string | null = null;

  // Cache: key is `${repoId}:${prNumber}`
  private cache: Map<string, { result: PRReviewResult; tokenUsage: TokenUsage }> = new Map();

  // SSE client
  private sseClient: SSEClient | null = null;

  constructor(_aiStore: AIStore) {
    makeAutoObservable(this);
    // _aiStore reserved for future use with global AI settings/error handling
  }

  // ============================================================================
  // Computed
  // ============================================================================

  get isComplete(): boolean {
    return this.aspects.every((a) => a.status === 'complete');
  }

  get inProgressCount(): number {
    return this.aspects.filter((a) => a.status === 'in_progress').length;
  }

  get completedCount(): number {
    return this.aspects.filter((a) => a.status === 'complete').length;
  }

  get progress(): number {
    return Math.round((this.completedCount / this.aspects.length) * 100);
  }

  // ============================================================================
  // Actions
  // ============================================================================

  /**
   * Request PR review with SSE streaming.
   * Shows progress per aspect and caches result.
   *
   * @param repoId - Repository UUID
   * @param prNumber - Pull request number
   * @param forceRefresh - If true, bypass cache and re-review
   */
  async requestReview(repoId: string, prNumber: number, forceRefresh = false): Promise<void> {
    const cacheKey = `${repoId}:${prNumber}`;

    // Check cache first
    if (!forceRefresh) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        runInAction(() => {
          this.result = cached.result;
          this.tokenUsage = cached.tokenUsage;
          this.aspects = this.aspects.map((a) => ({ ...a, status: 'complete' as const }));
          this.isLoading = false;
          this.error = null;
        });
        return;
      }
    }

    // Reset state
    runInAction(() => {
      this.aspects = this.aspects.map((a) => ({ ...a, status: 'pending' as const }));
      this.result = null;
      this.tokenUsage = null;
      this.isLoading = true;
      this.error = null;
    });

    // Abort existing connection
    this.abort();

    try {
      // Create SSE client
      this.sseClient = new SSEClient({
        url: aiApi.getPRReviewUrl(repoId, prNumber),
        body: { force_refresh: forceRefresh },
        onMessage: (event) => {
          runInAction(() => {
            if (event.type === 'aspect') {
              const data = event.data as AspectEvent;
              this.updateAspectStatus(data.aspect, data.status);
            } else if (event.type === 'complete') {
              const data = event.data as CompleteEvent;
              this.result = data.result;
              this.tokenUsage = data.tokenUsage;
              this.isLoading = false;

              // Cache result
              this.cache.set(cacheKey, {
                result: data.result,
                tokenUsage: data.tokenUsage,
              });
            } else if (event.type === 'error') {
              this.error = (event.data as { message: string }).message || 'Review failed';
              this.isLoading = false;
            }
          });
        },
        onError: (error) => {
          runInAction(() => {
            this.error = error.message || 'Connection failed';
            this.isLoading = false;
          });
        },
        onComplete: () => {
          runInAction(() => {
            this.isLoading = false;
          });
        },
      });

      // Connect
      await this.sseClient.connect();
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : 'Unknown error';
        this.isLoading = false;
      });
    }
  }

  /**
   * Clear cache for specific PR and re-review.
   *
   * @param repoId - Repository UUID
   * @param prNumber - Pull request number
   */
  async reReview(repoId: string, prNumber: number): Promise<void> {
    const cacheKey = `${repoId}:${prNumber}`;
    this.cache.delete(cacheKey);
    await this.requestReview(repoId, prNumber, true);
  }

  /**
   * Update aspect status from SSE event.
   */
  private updateAspectStatus(name: ReviewAspectName, status: AspectStatus): void {
    const aspect = this.aspects.find((a) => a.name === name);
    if (aspect) {
      aspect.status = status;
    }
  }

  /**
   * Abort ongoing review.
   */
  abort(): void {
    if (this.sseClient) {
      this.sseClient.abort();
      this.sseClient = null;
    }
  }

  /**
   * Reset state.
   */
  reset(): void {
    this.abort();
    this.aspects = this.aspects.map((a) => ({ ...a, status: 'pending' as const }));
    this.result = null;
    this.tokenUsage = null;
    this.isLoading = false;
    this.error = null;
  }

  /**
   * Clear all cached results.
   */
  clearCache(): void {
    this.cache.clear();
  }
}
