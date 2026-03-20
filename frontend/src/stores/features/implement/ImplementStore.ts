'use client';

import { makeAutoObservable, runInAction } from 'mobx';
import type { SidecarOutput, SidecarResult } from '@/lib/tauri';

/** Re-export types for convenience */
export type { SidecarOutput, SidecarResult };

/**
 * Pipeline step the ImplementStore is currently executing.
 * Transitions: idle -> branching -> implementing -> staging -> committing -> pushing -> done
 *                                                                                     -> error (from any step)
 */
export type ImplementStep =
  | 'idle'
  | 'branching'
  | 'implementing'
  | 'staging'
  | 'committing'
  | 'pushing'
  | 'done'
  | 'error';

/**
 * ImplementStore — MobX store orchestrating the full one-click implement pipeline.
 *
 * Pipeline: create branch -> git switch -> run pilot implement --oneshot
 *           -> git status -> git stage all -> git commit -> git push -> done
 *
 * Emits window CustomEvent 'implement-complete' on pipeline completion (success or failure)
 * so the system tray (Plan 02) can display a notification.
 */
export class ImplementStore {
  /** Whether the pipeline is currently running. */
  isRunning: boolean = false;

  /** Current pipeline step. */
  currentStep: ImplementStep = 'idle';

  /** Issue ID currently being implemented. */
  issueId: string | null = null;

  /** Auto-generated branch name (implement/<issueId>). */
  branchName: string | null = null;

  /** Absolute path to the repository. */
  repoPath: string | null = null;

  /** Sidecar process ID for cancellation (available after pilot implement starts). */
  sidecarId: string | null = null;

  /** Collected sidecar stdout/stderr lines (capped at 500). */
  output: string[] = [];

  /** Error message from any failed step, or null. */
  error: string | null = null;

  /** Resulting commit OID after successful commit step. */
  commitOid: string | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  // --- Computed ---

  /** Human-readable label for the current pipeline step. */
  get stepLabel(): string {
    switch (this.currentStep) {
      case 'idle':
        return 'Ready';
      case 'branching':
        return 'Creating branch...';
      case 'implementing':
        return 'Running pilot implement...';
      case 'staging':
        return 'Staging changes...';
      case 'committing':
        return 'Committing...';
      case 'pushing':
        return 'Pushing to remote...';
      case 'done':
        return 'Complete!';
      case 'error':
        return 'Failed';
    }
  }

  /** True when the sidecar process is running and can be cancelled. */
  get canCancel(): boolean {
    return this.currentStep === 'implementing' && this.sidecarId !== null;
  }

  // --- Actions ---

  /**
   * Run the full one-click implement pipeline for the given issue.
   *
   * Steps:
   *   1. Create + switch to branch `implement/<issueId>`
   *   2. Run `pilot implement <issueId> --oneshot` via sidecar
   *   3. Git status -> stage all changed files
   *   4. Git commit with message `feat: implement <issueId>`
   *   5. Git push to remote
   *
   * Emits `implement-complete` window CustomEvent on completion.
   */
  async startImplement(issueId: string, repoPath: string): Promise<void> {
    // Reset and initialise pipeline state
    runInAction(() => {
      this.isRunning = true;
      this.currentStep = 'branching';
      this.issueId = issueId;
      this.repoPath = repoPath;
      this.branchName = null;
      this.sidecarId = null;
      this.output = [];
      this.error = null;
      this.commitOid = null;
    });

    const branchName = `implement/${issueId}`;

    try {
      // --- Step 1: Branch create + switch ---
      runInAction(() => {
        this.branchName = branchName;
      });

      const { gitBranchCreate, gitBranchSwitch } = await import('@/lib/tauri');
      await gitBranchCreate(repoPath, branchName);
      await gitBranchSwitch(repoPath, branchName);

      // --- Step 2: Run pilot implement --oneshot ---
      runInAction(() => {
        this.currentStep = 'implementing';
      });

      const { runPilotImplement } = await import('@/lib/tauri');
      const result: SidecarResult = await runPilotImplement(issueId, repoPath, (output) => {
        runInAction(() => {
          // Capture the sidecar ID from the first output event
          if (this.sidecarId === null && output.id) {
            this.sidecarId = output.id;
          }
          // Append line to output, capping at 500 entries
          if (this.output.length >= 500) {
            this.output.shift();
          }
          this.output.push(output.data);
        });
      });

      if (result.exit_code !== 0) {
        runInAction(() => {
          this.currentStep = 'error';
          this.error = `pilot implement failed with exit code ${result.exit_code}`;
          this.isRunning = false;
        });
        this._emitComplete(issueId, false, this.error);
        return;
      }

      // --- Step 3: Stage all changed files ---
      runInAction(() => {
        this.currentStep = 'staging';
      });

      const { gitStatus, gitStage } = await import('@/lib/tauri');
      const status = await gitStatus(repoPath);
      const allPaths = status.files.map((f) => f.path);
      if (allPaths.length > 0) {
        await gitStage(repoPath, allPaths);
      }

      // --- Step 4: Commit ---
      runInAction(() => {
        this.currentStep = 'committing';
      });

      const { gitCommit } = await import('@/lib/tauri');
      const oid = await gitCommit(repoPath, `feat: implement ${issueId}`);
      runInAction(() => {
        this.commitOid = oid;
      });

      // --- Step 5: Push ---
      runInAction(() => {
        this.currentStep = 'pushing';
      });

      const { gitPush } = await import('@/lib/tauri');
      await gitPush(repoPath, () => {});

      // --- Done ---
      runInAction(() => {
        this.currentStep = 'done';
        this.isRunning = false;
      });

      this._emitComplete(issueId, true, null);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      runInAction(() => {
        this.currentStep = 'error';
        this.error = message;
        this.isRunning = false;
      });
      this._emitComplete(issueId, false, message);
    }
  }

  /**
   * Cancel the running sidecar process (only available during `implementing` step).
   */
  async cancel(): Promise<void> {
    if (!this.sidecarId) return;
    try {
      const { cancelSidecar } = await import('@/lib/tauri');
      await cancelSidecar(this.sidecarId);
    } catch {
      // Best effort — ignore errors on cancel
    }
    runInAction(() => {
      this.currentStep = 'error';
      this.error = 'Cancelled by user';
      this.isRunning = false;
    });
  }

  /** Reset all fields to defaults. Call after dialog close. */
  reset(): void {
    this.isRunning = false;
    this.currentStep = 'idle';
    this.issueId = null;
    this.branchName = null;
    this.repoPath = null;
    this.sidecarId = null;
    this.output = [];
    this.error = null;
    this.commitOid = null;
  }

  // --- Private helpers ---

  /**
   * Emit `implement-complete` window CustomEvent for tray notification consumption (Plan 02).
   */
  private _emitComplete(issueId: string, success: boolean, error: string | null): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent('implement-complete', {
        detail: { issueId, success, error },
      })
    );
  }
}
