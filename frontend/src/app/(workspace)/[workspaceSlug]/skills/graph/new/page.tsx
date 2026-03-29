/**
 * New Graph Workflow page -- create a new graph-backed skill.
 *
 * Route: /[workspaceSlug]/skills/graph/new
 */

'use client';

import { Suspense, useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useStore } from '@/stores';
import { useSkillGraphMutation } from '@/features/skills/hooks/use-skill-graph-queries';
import { useCreateSkillTemplate } from '@/services/api/skill-templates';

const GraphWorkflowCanvas = dynamic(
  () =>
    import('@/features/skills/components/graph-workflow-canvas').then(
      (mod) => mod.GraphWorkflowCanvas,
    ),
  { ssr: false },
);

const GraphNodePalette = dynamic(
  () =>
    import('@/features/skills/components/graph-node-palette').then(
      (mod) => mod.GraphNodePalette,
    ),
  { ssr: false },
);

const SKILL_CATEGORIES = [
  'code-review',
  'code-generation',
  'documentation',
  'testing',
  'debugging',
  'planning',
  'custom',
] as const;

export default function NewGraphPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceSlug = params?.workspaceSlug as string;
  const { workspaceStore } = useStore();
  const currentWorkspace = workspaceStore.getWorkspaceBySlug(workspaceSlug);
  const workspaceId = currentWorkspace?.id || workspaceSlug;

  const graphMutation = useSkillGraphMutation(workspaceId);
  const createTemplate = useCreateSkillTemplate(workspaceSlug);

  // Save dialog state
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [skillName, setSkillName] = useState('');
  const [skillCategory, setSkillCategory] = useState<string>('custom');
  const [pendingSaveData, setPendingSaveData] = useState<{
    nodes: unknown[];
    edges: unknown[];
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = useCallback(
    (data: { nodes: unknown[]; edges: unknown[] }) => {
      setPendingSaveData(data);
      setSaveDialogOpen(true);
    },
    [],
  );

  const handleConfirmSave = useCallback(async () => {
    if (!pendingSaveData || !skillName.trim()) return;
    setIsSaving(true);

    try {
      // Create skill template first
      const template = await createTemplate.mutateAsync({
        name: skillName.trim(),
        description: `Graph workflow (${skillCategory}): ${skillName.trim()}`,
        skill_content: `# ${skillName.trim()}\n\nGraph-based skill workflow.`,
        role_type: skillCategory,
      });

      // Then save graph data to template
      await graphMutation.mutateAsync({
        templateId: template.id,
        data: {
          graph_json: {
            nodes: pendingSaveData.nodes,
            edges: pendingSaveData.edges,
          },
          node_count: pendingSaveData.nodes.length,
          edge_count: pendingSaveData.edges.length,
        },
      });

      toast.success('Graph workflow created');
      setSaveDialogOpen(false);
      // Navigate to the edit page for the new graph
      router.push(`/${workspaceSlug}/skills`);
    } catch {
      toast.error('Failed to create graph workflow');
    } finally {
      setIsSaving(false);
    }
  }, [
    pendingSaveData,
    skillName,
    skillCategory,
    createTemplate,
    graphMutation,
    router,
    workspaceSlug,
  ]);

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b bg-background">
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={() => router.push(`/${workspaceSlug}/skills`)}
          aria-label="Back to skills"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-sm font-semibold">New Graph Workflow</h1>
        <div className="flex-1" />
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => handleSave({ nodes: [], edges: [] })}
        >
          <Save className="h-3.5 w-3.5" />
          Save
        </Button>
      </div>

      {/* Canvas with palette */}
      <div className="flex flex-1 min-h-0">
        <Suspense fallback={null}>
          <GraphNodePalette />
        </Suspense>
        <div className="flex-1 min-h-0">
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <GraphWorkflowCanvas onSave={handleSave} />
          </Suspense>
        </div>
      </div>

      {/* Save Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Graph Workflow</DialogTitle>
            <DialogDescription>
              Create a new skill template for this graph workflow.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="skill-name">Skill Name</Label>
              <Input
                id="skill-name"
                value={skillName}
                onChange={(e) => setSkillName(e.target.value)}
                placeholder="e.g. Code Review Workflow"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="skill-category">Category</Label>
              <Select value={skillCategory} onValueChange={setSkillCategory}>
                <SelectTrigger id="skill-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SKILL_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat
                        .split('-')
                        .map((w) => (w[0]?.toUpperCase() ?? '') + w.slice(1))
                        .join(' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSaveDialogOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmSave}
              disabled={!skillName.trim() || isSaving}
            >
              {isSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Create & Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
