/**
 * CreateTemplateModal — Admin dialog for creating workspace skill templates.
 *
 * Form: name, description, skill content, icon (optional), role type (optional).
 * Source: Phase 20, P20-09
 */

'use client';

import * as React from 'react';
import { Layers } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCreateSkillTemplate } from '@/services/api/skill-templates';

interface CreateTemplateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceSlug: string;
}

export function CreateTemplateModal({
  open,
  onOpenChange,
  workspaceSlug,
}: CreateTemplateModalProps) {
  const createTemplate = useCreateSkillTemplate(workspaceSlug);

  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [skillContent, setSkillContent] = React.useState('');
  const [icon, setIcon] = React.useState('');

  const resetForm = React.useCallback(() => {
    setName('');
    setDescription('');
    setSkillContent('');
    setIcon('');
  }, []);

  const handleClose = React.useCallback(() => {
    onOpenChange(false);
    setTimeout(resetForm, 200);
  }, [onOpenChange, resetForm]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !description.trim() || !skillContent.trim()) return;

    createTemplate.mutate(
      {
        name: name.trim(),
        description: description.trim(),
        skill_content: skillContent.trim(),
        icon: icon.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success('Skill template created');
          handleClose();
        },
        onError: () => {
          toast.error('Failed to create template');
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            Create Skill Template
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="tpl-name">Name</Label>
            <Input
              id="tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Senior Backend Developer"
              maxLength={200}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tpl-description">Description</Label>
            <Input
              id="tpl-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this skill template"
              maxLength={500}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tpl-content">Skill Content</Label>
            <Textarea
              id="tpl-content"
              value={skillContent}
              onChange={(e) => setSkillContent(e.target.value)}
              placeholder="Write the skill instructions that will be used to personalize AI assistance..."
              rows={8}
              className="resize-none font-mono text-sm"
              required
            />
            <p className="text-xs text-muted-foreground">
              {skillContent.trim().split(/\s+/).filter(Boolean).length} words
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tpl-icon">Icon (optional)</Label>
            <Input
              id="tpl-icon"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="e.g. an emoji like 🔧 or 🎯"
              maxLength={10}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={createTemplate.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                !name.trim() ||
                !description.trim() ||
                !skillContent.trim() ||
                createTemplate.isPending
              }
            >
              {createTemplate.isPending ? 'Creating...' : 'Create Template'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
