/**
 * PluginDetailSheet - Slide-over sheet showing plugin details with 3 tabs.
 *
 * Phase 19 Plan 04: Overview | SKILL.md | References tabs.
 */

'use client';

import { Package } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { InstalledPlugin } from '@/stores/ai/PluginsStore';

interface PluginDetailSheetProps {
  plugin: InstalledPlugin | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PluginDetailSheet({ plugin, open, onOpenChange }: PluginDetailSheetProps) {
  if (!plugin) return null;

  const shortSha = plugin.installed_sha.slice(0, 8);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Package className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <SheetTitle>{plugin.display_name}</SheetTitle>
              <SheetDescription>{plugin.skill_name}</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="px-4 pb-4">
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="overview" className="flex-1">
                Overview
              </TabsTrigger>
              <TabsTrigger value="skill-md" className="flex-1">
                SKILL.md
              </TabsTrigger>
              <TabsTrigger value="references" className="flex-1">
                References
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4 space-y-4">
              {plugin.description && (
                <div>
                  <h3 className="text-sm font-medium text-foreground">Description</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{plugin.description}</p>
                </div>
              )}
              <div>
                <h3 className="text-sm font-medium text-foreground">Repository</h3>
                <p className="mt-1 text-sm text-muted-foreground break-all">{plugin.repo_url}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-foreground">Installed SHA</h3>
                <code className="mt-1 inline-block rounded bg-muted px-2 py-0.5 text-xs font-mono">
                  {shortSha}
                </code>
              </div>
              <div>
                <h3 className="text-sm font-medium text-foreground">Status</h3>
                <div className="mt-1 flex items-center gap-2">
                  {plugin.has_update ? (
                    <Badge className="border-orange-200 bg-orange-100 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-400">
                      Update Available
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Installed</Badge>
                  )}
                  {plugin.is_active ? (
                    <Badge variant="outline">Active</Badge>
                  ) : (
                    <Badge variant="outline">Inactive</Badge>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="skill-md" className="mt-4">
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-sm text-muted-foreground italic">
                  SKILL.md content is not yet available for preview. It will be fetched from the
                  repository on demand in a future update.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="references" className="mt-4">
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-sm text-muted-foreground italic">
                  Reference files will be listed here once the plugin registry exposes them via the
                  API.
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
