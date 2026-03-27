'use client';

/**
 * Accept Invite page — handles Supabase magic-link workspace invitations.
 *
 * S007: Flow:
 * 1. Supabase SDK processes the magic-link hash from the URL and establishes session.
 * 2. Once SIGNED_IN event fires, calls POST /auth/workspace-invitations/{id}/accept.
 * 3. If requires_profile_completion is true, shows ProfileCompletionForm.
 * 4. Redirects to /{workspace_slug} on success.
 */

import { ProfileCompletionForm } from '@/features/auth/components/profile-completion-form';
import { acceptInvitation } from '@/features/members/hooks/use-workspace-invitations';
import { supabase } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

type PageState = 'processing' | 'complete_profile' | 'error' | 'email_mismatch';

export default function AcceptInvitePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pageState, setPageState] = React.useState<PageState>('processing');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [workspaceSlug, setWorkspaceSlug] = React.useState<string | null>(null);

  const invitationId = searchParams.get('invitation_id');

  const handleError = React.useCallback(
    (msg: string) => {
      setErrorMessage(msg);
      setPageState('error');
      setTimeout(() => {
        router.push(`/login?error=${encodeURIComponent(msg)}`);
      }, 3000);
    },
    [router],
  );

  const processInvitation = React.useCallback(async () => {
    if (!invitationId) {
      handleError('Missing invitation ID. Please use the link from your invitation email.');
      return;
    }

    try {
      const result = await acceptInvitation(invitationId);
      setWorkspaceSlug(result.workspace_slug);

      if (result.requires_profile_completion) {
        setPageState('complete_profile');
      } else {
        router.push(`/${result.workspace_slug}`);
      }
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status === 409) {
        setPageState('email_mismatch');
        return;
      }
      const msg = err instanceof Error ? err.message : 'Failed to accept invitation.';
      handleError(msg);
    }
  }, [invitationId, handleError, router]);

  React.useEffect(() => {
    // Supabase SDK with detectSessionInUrl: true auto-processes the magic-link hash.
    // Listen for SIGNED_IN to confirm the session is ready before calling the backend.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        subscription.unsubscribe();
        processInvitation();
      }
      if (event === 'SIGNED_OUT') {
        subscription.unsubscribe();
        handleError('Authentication failed. Please try the link again.');
      }
    });

    // Fast path: session already active (e.g., page reload after magic link processed)
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        subscription.unsubscribe();
        handleError(error.message);
        return;
      }
      if (data.session) {
        subscription.unsubscribe();
        processInvitation();
      }
    });

    const timeout = setTimeout(() => {
      subscription.unsubscribe();
      handleError('Authentication timed out. Please try the link again.');
    }, 15000);

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [processInvitation, handleError]);

  if (pageState === 'complete_profile' && workspaceSlug) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Complete your profile</h1>
            <p className="text-sm text-muted-foreground">
              Just one more step before you join your workspace.
            </p>
          </div>
          <ProfileCompletionForm onComplete={() => router.push(`/${workspaceSlug}`)} />
        </div>
      </div>
    );
  }

  if (pageState === 'email_mismatch') {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="text-center space-y-4 max-w-sm">
          <h1 className="text-lg font-semibold text-destructive">Wrong email address</h1>
          <p className="text-sm text-muted-foreground">
            This invitation was sent to a different email address. Please sign in with the
            invited email or request a new invitation.
          </p>
          <button
            type="button"
            className="text-sm text-primary underline underline-offset-4 hover:text-primary/80"
            onClick={async () => {
              await supabase.auth.signOut();
              if (invitationId) {
                router.push(`/auth/invite?invitation_id=${invitationId}`);
              } else {
                router.push('/login');
              }
            }}
          >
            Sign out and try again
          </button>
        </div>
      </div>
    );
  }

  if (pageState === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="text-center space-y-2">
          <h1 className="text-lg font-semibold text-destructive">Invitation failed</h1>
          <p className="text-sm text-muted-foreground">
            {errorMessage ?? 'An error occurred. Redirecting to login…'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Accepting your invitation…</p>
      </div>
    </div>
  );
}
