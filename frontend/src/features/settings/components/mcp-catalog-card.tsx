/**
 * MCPCatalogCard - Display a catalog MCP entry with Install button.
 *
 * Phase 35 Plan 02: Shows catalog entry info with type badges, Official badge,
 * Install button, Installed state, and Update Available badge.
 *
 * Plain component (NOT observer) — receives all data as props.
 */

'use client';

import { Server } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { McpCatalogEntry } from '@/services/api/mcp-catalog';

interface MCPCatalogCardProps {
  entry: McpCatalogEntry;
  isInstalled: boolean;
  hasUpdate: boolean;
  onInstall: (entry: McpCatalogEntry) => void;
}

export function MCPCatalogCard({ entry, isInstalled, hasUpdate, onInstall }: MCPCatalogCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          {/* Entry info */}
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Server className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium truncate">{entry.name}</p>
                {entry.is_official && (
                  <Badge
                    variant="outline"
                    className="border-blue-500/20 bg-blue-500/10 text-blue-500 text-[10px] px-1.5 py-0 h-5"
                  >
                    Official
                  </Badge>
                )}
                {isInstalled && (
                  <Badge
                    variant="outline"
                    className="border-emerald-500/20 bg-emerald-500/10 text-emerald-600 text-[10px] px-1.5 py-0 h-5"
                  >
                    Installed
                  </Badge>
                )}
                {hasUpdate && (
                  <Badge
                    variant="outline"
                    className="border-amber-500/20 bg-amber-500/10 text-amber-400 text-[10px] px-1.5 py-0 h-5"
                  >
                    Update Available
                  </Badge>
                )}
              </div>
              {entry.description && (
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                  {entry.description}
                </p>
              )}
              <div className="mt-1.5 flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {entry.transport_type.toUpperCase()}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {entry.auth_type === 'bearer' ? 'Bearer' : 'OAuth2'}
                </Badge>
              </div>
            </div>
          </div>

          {/* Install action */}
          <div className="flex shrink-0 items-center">
            <Button
              variant={isInstalled ? 'secondary' : 'default'}
              size="sm"
              className="h-8 text-xs"
              disabled={isInstalled}
              onClick={() => onInstall(entry)}
            >
              {isInstalled ? 'Installed' : 'Install'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
