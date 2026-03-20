'use client';

import { observer } from 'mobx-react-lite';
import { useState, useEffect } from 'react';
import { useGitStore } from '@/stores/RootStore';
import { GitCommit, ArrowUp, Loader2, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export const CommitPanel = observer(function CommitPanel() {
  const gitStore = useGitStore();
  const [commitMessage, setCommitMessage] = useState('');
  const [isPushingAfterCommit, setIsPushingAfterCommit] = useState(false);

  const stagedCount = gitStore.stagedFiles.length;
  const isDisabled =
    commitMessage.trim() === '' ||
    stagedCount === 0 ||
    gitStore.isCommitting ||
    isPushingAfterCommit;

  // Auto-dismiss commit success after 5 seconds
  useEffect(() => {
    if (!gitStore.lastCommitOid) return;
    setCommitMessage('');
    const timer = setTimeout(() => {
      gitStore.clearCommitState();
    }, 5000);
    return () => clearTimeout(timer);
  }, [gitStore, gitStore.lastCommitOid]);

  async function handleCommit() {
    await gitStore.commit(commitMessage);
  }

  async function handleCommitAndPush() {
    await gitStore.commit(commitMessage);
    if (!gitStore.commitError) {
      setIsPushingAfterCommit(true);
      try {
        await gitStore.push();
      } finally {
        setIsPushingAfterCommit(false);
      }
    }
  }

  const ahead = gitStore.status?.ahead ?? 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Stage summary */}
      <div className="flex items-center gap-1.5">
        <GitCommit className="text-muted-foreground size-3.5 shrink-0" />
        <span className="text-xs text-muted-foreground">
          {stagedCount === 0
            ? 'No files staged'
            : `${stagedCount} file${stagedCount !== 1 ? 's' : ''} staged`}
        </span>
        {gitStore.stageError && (
          <span className="text-destructive text-xs ml-auto flex items-center gap-1">
            <AlertCircle className="size-3" />
            {gitStore.stageError}
          </span>
        )}
      </div>

      {/* Commit message textarea */}
      <Textarea
        placeholder="Commit message..."
        value={commitMessage}
        onChange={(e) => setCommitMessage(e.target.value)}
        rows={3}
        className="resize-none text-sm min-h-[72px] max-h-[144px]"
        disabled={gitStore.isCommitting || isPushingAfterCommit}
      />
      <p className="text-muted-foreground text-xs -mt-2">
        {commitMessage.length} character{commitMessage.length !== 1 ? 's' : ''}
      </p>

      {/* Action buttons */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          {/* Commit */}
          <Button
            size="sm"
            className="flex-1"
            disabled={isDisabled}
            onClick={() => void handleCommit()}
          >
            {gitStore.isCommitting && !isPushingAfterCommit ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Committing…
              </>
            ) : (
              <>
                <GitCommit className="size-3.5" />
                Commit
              </>
            )}
          </Button>

          {/* Commit & Push */}
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            disabled={isDisabled}
            onClick={() => void handleCommitAndPush()}
          >
            {isPushingAfterCommit ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Pushing…
              </>
            ) : gitStore.isCommitting && isPushingAfterCommit ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Committing…
              </>
            ) : (
              <>
                <ArrowUp className="size-3.5" />
                Commit &amp; Push
              </>
            )}
          </Button>
        </div>

        {/* Push button — only visible when ahead of remote */}
        {ahead > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            disabled={gitStore.isPushing || isPushingAfterCommit}
            onClick={() => void gitStore.push()}
          >
            {gitStore.isPushing ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Pushing…
              </>
            ) : (
              <>
                <ArrowUp className="size-3.5" />
                Push {ahead} commit{ahead !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        )}
      </div>

      {/* Success banner */}
      {gitStore.lastCommitOid && (
        <div className="flex items-center gap-1.5 rounded-md bg-green-500/10 px-3 py-2 text-xs text-green-700 dark:text-green-400">
          <Check className="size-3.5 shrink-0" />
          <span>Committed {gitStore.lastCommitOid.slice(0, 7)}</span>
        </div>
      )}

      {/* Error */}
      {gitStore.commitError && (
        <p className="text-destructive text-xs flex items-center gap-1">
          <AlertCircle className="size-3 shrink-0" />
          {gitStore.commitError}
        </p>
      )}
    </div>
  );
});
