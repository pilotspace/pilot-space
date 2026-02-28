'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { Compass, Loader2, Plus, Building2 } from 'lucide-react';
import { WorkspaceSelector, addRecentWorkspace } from '@/components/workspace-selector';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getAuthProvider } from '@/services/auth/providers';
import { workspacesApi } from '@/services/api/workspaces';

const WORKSPACE_STORAGE_KEY = 'pilot-space:last-workspace';

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

const stagger = {
  animate: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function HomePage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = React.useState(true);
  const [hasWorkspaces, setHasWorkspaces] = React.useState(true);
  const [newWorkspaceName, setNewWorkspaceName] = React.useState('');
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [isCreating, setIsCreating] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    async function resolveWorkspace() {
      // 1. Check if user is authenticated (works for both Supabase and AuthCore)
      const provider = await getAuthProvider();
      const token = await provider.getToken();

      if (cancelled) return;

      if (!token) {
        router.replace('/welcome');
        return;
      }

      // 2. Fetch user's workspaces to validate access
      try {
        const { items } = await workspacesApi.list();

        if (cancelled) return;

        if (items.length > 0) {
          const storedSlug = localStorage.getItem(WORKSPACE_STORAGE_KEY);
          // Use stored workspace if user still has access, otherwise use first
          const target = (storedSlug && items.find((w) => w.slug === storedSlug)) || items[0]!;
          addRecentWorkspace(target.slug);
          router.replace(`/${target.slug}`);
          return;
        }
      } catch {
        // API error → fall through to workspace selector
      }

      // 3. No workspaces found → clear stale stored slug and show creation form
      localStorage.removeItem(WORKSPACE_STORAGE_KEY);
      if (!cancelled) {
        setHasWorkspaces(false);
        setIsLoading(false);
      }
    }

    resolveWorkspace();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleWorkspaceSelect = (slug: string) => {
    addRecentWorkspace(slug);
    router.push(`/${slug}`);
  };

  const handleCreateWorkspace = async () => {
    const name = newWorkspaceName.trim();
    if (!name) return;

    setCreateError(null);
    setIsCreating(true);

    try {
      const slug = slugify(name);
      const workspace = await workspacesApi.create({ name, slug });
      addRecentWorkspace(workspace.slug);
      router.replace(`/${workspace.slug}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create workspace');
      setIsCreating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background px-4 py-12">
      <motion.div
        variants={stagger}
        initial="initial"
        animate="animate"
        className="flex w-full max-w-md flex-col items-center"
      >
        {/* Logo */}
        <motion.div variants={fadeUp} className="mb-8">
          <motion.div
            className="relative"
            animate={{ rotate: [0, 5, -5, 0] }}
            transition={{ repeat: Infinity, duration: 6, ease: 'easeInOut' }}
          >
            <div className="absolute inset-0 blur-2xl">
              <div className="h-20 w-20 rounded-full bg-primary/20" />
            </div>
            <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-ai/20 shadow-warm-lg">
              <Compass className="h-10 w-10 text-primary" strokeWidth={1.5} />
            </div>
          </motion.div>
        </motion.div>

        {/* Welcome Text */}
        <motion.h1
          variants={fadeUp}
          className="mb-2 text-center text-3xl font-semibold tracking-tight text-foreground"
        >
          Welcome to Pilot Space
        </motion.h1>

        <motion.p variants={fadeUp} className="mb-8 text-center text-muted-foreground">
          {hasWorkspaces ? 'Select a workspace to get started' : 'Create your first workspace'}
        </motion.p>

        {/* Workspace Selector or Creation Form */}
        <motion.div variants={fadeUp} className="w-full">
          {hasWorkspaces ? (
            <WorkspaceSelector onSelect={handleWorkspaceSelect} />
          ) : (
            <Card className="border-border/50 shadow-warm">
              <CardContent className="p-6">
                <div className="mb-4 flex items-center justify-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    <Building2 className="h-6 w-6 text-primary" />
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="workspace-name">Workspace name</Label>
                    <Input
                      id="workspace-name"
                      type="text"
                      placeholder="My team workspace"
                      value={newWorkspaceName}
                      onChange={(e) => setNewWorkspaceName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleCreateWorkspace()}
                      disabled={isCreating}
                      className="h-11"
                    />
                    {newWorkspaceName.trim() && (
                      <p className="text-xs text-muted-foreground">
                        Slug: {slugify(newWorkspaceName)}
                      </p>
                    )}
                  </div>
                  {createError && (
                    <p className="text-sm text-destructive" role="alert">
                      {createError}
                    </p>
                  )}
                  <Button
                    onClick={handleCreateWorkspace}
                    disabled={!newWorkspaceName.trim() || isCreating}
                    className="w-full gap-2"
                  >
                    {isCreating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Create workspace
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}
