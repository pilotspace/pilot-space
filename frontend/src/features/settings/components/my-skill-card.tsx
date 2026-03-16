/**
 * MySkillCard — Displays a user's personalized skill.
 *
 * Expandable card: click to expand and view skill content, with inline
 * editing via SkillEditor. Compact header shows status, name, and actions.
 * Plain component (NOT observer) — receives all data via props.
 * Source: Phase 20, P20-10
 */

'use client';

import * as React from 'react';
import { ChevronDown, ChevronRight, Pencil, Power, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { UserSkill } from '@/services/api/user-skills';
import { SkillEditor } from './skill-editor';

interface MySkillCardProps {
  skill: UserSkill;
  onToggleActive: (skill: UserSkill) => void;
  onDelete: (skill: UserSkill) => void;
  onEdit: (skill: UserSkill, updates: { skill_content?: string; skill_name?: string }) => void;
}

export function MySkillCard({ skill, onToggleActive, onDelete, onEdit }: MySkillCardProps) {
  const [expanded, setExpanded] = React.useState(false);
  const [editing, setEditing] = React.useState(false);

  const displayName = skill.skill_name ?? skill.template_name ?? 'Custom Skill';

  const handleCardClick = () => {
    if (!editing) setExpanded((prev) => !prev);
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(true);
    setEditing(true);
  };

  const handleSave = (content: string) => {
    onEdit(skill, { skill_content: content });
    setEditing(false);
  };

  const handleCancelEdit = () => {
    setEditing(false);
  };

  return (
    <article
      className={`group relative rounded-xl border bg-card transition-all duration-200 hover:shadow-md hover:border-border/80 ${
        !skill.is_active ? 'opacity-50' : ''
      }`}
      data-testid="my-skill-card"
    >
      {/* Collapsed header row — always visible */}
      <div
        className="flex items-center gap-3 p-3 cursor-pointer select-none"
        onClick={handleCardClick}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleCardClick();
          }
        }}
      >
        {/* Chevron expand indicator */}
        <div className="shrink-0 text-muted-foreground">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </div>

        {/* Status dot */}
        <div
          className={`shrink-0 h-2 w-2 rounded-full ${
            skill.is_active ? 'bg-emerald-500' : 'bg-muted-foreground/40'
          }`}
          aria-label={skill.is_active ? 'Active' : 'Inactive'}
        />

        {/* Content */}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium truncate">{displayName}</h3>
          {skill.experience_description && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {skill.experience_description}
            </p>
          )}
        </div>

        {/* Actions — visible on hover */}
        <div
          className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleEditClick}
            aria-label="Edit skill content"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onToggleActive(skill)}
            aria-label={skill.is_active ? 'Deactivate skill' : 'Activate skill'}
          >
            <Power className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={() => onDelete(skill)}
            aria-label="Delete skill"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Expanded content area */}
      {expanded && (
        <div className="px-3 pb-3 border-t">
          {editing ? (
            <div className="pt-3">
              <SkillEditor
                initialContent={skill.skill_content}
                onSave={handleSave}
                onCancel={handleCancelEdit}
              />
            </div>
          ) : (
            <div className="pt-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Skill Content
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={handleEditClick}
                >
                  <Pencil className="h-3 w-3 mr-1" />
                  Edit
                </Button>
              </div>
              <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed max-h-[200px] overflow-y-auto">
                {skill.skill_content}
              </pre>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
