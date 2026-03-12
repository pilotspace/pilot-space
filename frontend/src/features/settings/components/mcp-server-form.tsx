/**
 * MCPServerForm - Register a new remote MCP server.
 *
 * Phase 14 Plan 04: Form with display name, URL, auth type selector, and
 * conditional auth fields (Bearer token or OAuth2 config).
 *
 * Plain component — all store interaction flows through the onRegister callback.
 */

'use client';

import * as React from 'react';
import { Loader2, AlertCircle, PlusCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import type { MCPServerRegisterRequest } from '@/stores/ai/MCPServersStore';

interface MCPServerFormProps {
  workspaceId: string;
  onRegister: (data: MCPServerRegisterRequest) => Promise<void>;
  onSuccess: () => void;
}

type AuthType = 'bearer' | 'oauth2';

const DEFAULT_STATE = {
  displayName: '',
  url: '',
  authType: 'bearer' as AuthType,
  bearerToken: '',
  oauthClientId: '',
  oauthAuthUrl: '',
  oauthTokenUrl: '',
  oauthScopes: '',
};

export function MCPServerForm({ onRegister, onSuccess }: MCPServerFormProps) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState(DEFAULT_STATE);

  const setField = (field: keyof typeof DEFAULT_STATE, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const canSubmit =
    form.displayName.trim().length > 0 &&
    form.displayName.trim().length <= 128 &&
    form.url.trim().length > 0 &&
    (form.authType === 'bearer'
      ? form.bearerToken.trim().length > 0
      : form.oauthClientId.trim().length > 0 &&
        form.oauthAuthUrl.trim().length > 0 &&
        form.oauthTokenUrl.trim().length > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const data: MCPServerRegisterRequest = {
        display_name: form.displayName.trim(),
        url: form.url.trim(),
        auth_type: form.authType,
        ...(form.authType === 'bearer'
          ? { auth_token: form.bearerToken.trim() }
          : {
              oauth_client_id: form.oauthClientId.trim(),
              oauth_auth_url: form.oauthAuthUrl.trim(),
              oauth_token_url: form.oauthTokenUrl.trim(),
              oauth_scopes: form.oauthScopes.trim() || undefined,
            }),
      };

      await onRegister(data);
      toast.success('MCP server registered');
      setForm(DEFAULT_STATE);
      setIsExpanded(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register server');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setIsExpanded((v) => !v)}
        role="button"
        aria-expanded={isExpanded}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsExpanded((v) => !v);
          }
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PlusCircle className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Register New MCP Server</CardTitle>
          </div>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        {!isExpanded && (
          <CardDescription>
            Connect a remote MCP server to extend the AI agent with custom tools.
          </CardDescription>
        )}
      </CardHeader>

      {isExpanded && (
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Display Name */}
            <div className="space-y-2">
              <Label htmlFor="mcp-display-name">Display Name</Label>
              <Input
                id="mcp-display-name"
                type="text"
                value={form.displayName}
                onChange={(e) => setField('displayName', e.target.value)}
                placeholder="My MCP Server"
                maxLength={128}
                disabled={isSubmitting}
                required
              />
            </div>

            {/* URL */}
            <div className="space-y-2">
              <Label htmlFor="mcp-url">Server URL</Label>
              <Input
                id="mcp-url"
                type="url"
                value={form.url}
                onChange={(e) => setField('url', e.target.value)}
                placeholder="https://mcp.example.com/sse"
                disabled={isSubmitting}
                required
              />
            </div>

            {/* Auth Type */}
            <div className="space-y-2">
              <Label>Authentication Type</Label>
              <div className="flex gap-4">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="mcp-auth-type"
                    value="bearer"
                    checked={form.authType === 'bearer'}
                    onChange={() => setField('authType', 'bearer')}
                    disabled={isSubmitting}
                    className="accent-primary"
                  />
                  <span className="text-sm">Bearer Token</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="mcp-auth-type"
                    value="oauth2"
                    checked={form.authType === 'oauth2'}
                    onChange={() => setField('authType', 'oauth2')}
                    disabled={isSubmitting}
                    className="accent-primary"
                  />
                  <span className="text-sm">OAuth 2.0</span>
                </label>
              </div>
            </div>

            {/* Bearer Token (conditional) */}
            {form.authType === 'bearer' && (
              <div className="space-y-2">
                <Label htmlFor="mcp-bearer-token">Bearer Token</Label>
                <Input
                  id="mcp-bearer-token"
                  type="password"
                  value={form.bearerToken}
                  onChange={(e) => setField('bearerToken', e.target.value)}
                  placeholder="Token will be encrypted server-side"
                  disabled={isSubmitting}
                  required
                />
              </div>
            )}

            {/* OAuth2 fields (conditional) */}
            {form.authType === 'oauth2' && (
              <div className="space-y-3 rounded-md border border-border p-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  OAuth 2.0 Configuration
                </p>

                <div className="space-y-2">
                  <Label htmlFor="mcp-oauth-client-id">Client ID</Label>
                  <Input
                    id="mcp-oauth-client-id"
                    type="text"
                    value={form.oauthClientId}
                    onChange={(e) => setField('oauthClientId', e.target.value)}
                    placeholder="your-client-id"
                    disabled={isSubmitting}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mcp-oauth-auth-url">Authorization URL</Label>
                  <Input
                    id="mcp-oauth-auth-url"
                    type="url"
                    value={form.oauthAuthUrl}
                    onChange={(e) => setField('oauthAuthUrl', e.target.value)}
                    placeholder="https://provider.com/oauth/authorize"
                    disabled={isSubmitting}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mcp-oauth-token-url">Token URL</Label>
                  <Input
                    id="mcp-oauth-token-url"
                    type="url"
                    value={form.oauthTokenUrl}
                    onChange={(e) => setField('oauthTokenUrl', e.target.value)}
                    placeholder="https://provider.com/oauth/token"
                    disabled={isSubmitting}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mcp-oauth-scopes">Scopes (optional)</Label>
                  <Input
                    id="mcp-oauth-scopes"
                    type="text"
                    value={form.oauthScopes}
                    onChange={(e) => setField('oauthScopes', e.target.value)}
                    placeholder="read write"
                    disabled={isSubmitting}
                  />
                </div>
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setForm(DEFAULT_STATE);
                  setIsExpanded(false);
                  setError(null);
                }}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmit || isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {isSubmitting ? 'Registering...' : 'Register Server'}
              </Button>
            </div>
          </form>
        </CardContent>
      )}
    </Card>
  );
}
