/**
 * APIKeyForm - Form for managing workspace API keys.
 *
 * T179: API key inputs for Anthropic (required) and OpenAI (required for search).
 */

'use client';

import * as React from 'react';
import { observer } from 'mobx-react-lite';
import { Loader2, AlertCircle, Info, Key } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { APIKeyInput } from './api-key-input';
import { useStore } from '@/stores';
import { toast } from 'sonner';

export const APIKeyForm = observer(function APIKeyForm() {
  const { ai } = useStore();
  const { settings } = ai;

  const [anthropicKey, setAnthropicKey] = React.useState('');
  const [googleKey, setGoogleKey] = React.useState('');
  const [validationErrors, setValidationErrors] = React.useState<{
    anthropic?: string;
    google?: string;
  }>({});

  const validateKey = (provider: string, key: string): string | undefined => {
    if (!key) return undefined; // Empty is valid (means no change)

    if (key.length < 10) {
      return 'API key is too short';
    }

    if (provider === 'anthropic' && !key.startsWith('sk-ant-')) {
      return 'Anthropic API keys must start with "sk-ant-"';
    }

    if (provider === 'google' && !key.startsWith('AIza')) {
      return 'Google Gemini API keys must start with "AIza"';
    }

    return undefined;
  };

  const handleSave = async () => {
    // Client-side validation
    const errors: typeof validationErrors = {};
    const anthropicError = validateKey('anthropic', anthropicKey);
    const googleError = validateKey('google', googleKey);

    if (anthropicError) errors.anthropic = anthropicError;
    if (googleError) errors.google = googleError;

    setValidationErrors(errors);

    if (Object.keys(errors).length > 0) {
      return;
    }

    // Only send non-empty keys (unchanged keys remain empty)
    const apiKeys: Array<{
      provider: string;
      service_type: 'embedding' | 'llm';
      api_key: string;
    }> = [];
    if (anthropicKey)
      apiKeys.push({ provider: 'anthropic', service_type: 'llm', api_key: anthropicKey });
    if (googleKey)
      apiKeys.push({ provider: 'google', service_type: 'embedding', api_key: googleKey });

    if (apiKeys.length === 0) {
      toast.info('No changes to save');
      return;
    }

    try {
      await settings.saveSettings({ api_keys: apiKeys });

      // Clear input fields after successful save
      setAnthropicKey('');
      setGoogleKey('');
      setValidationErrors({});

      toast.success('API keys saved securely');
    } catch (error) {
      toast.error('Failed to save API keys', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    }
  };

  const hasChanges = anthropicKey.length > 0 || googleKey.length > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Key className="h-5 w-5 text-primary" />
          <CardTitle>API Keys</CardTitle>
        </div>
        <CardDescription>
          Configure your AI provider API keys. Keys are encrypted and stored securely in Supabase
          Vault.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Both Anthropic and Google Gemini API keys are required for full functionality. Anthropic
            powers code generation, and Google Gemini provides embeddings for semantic search.
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          <APIKeyInput
            label="Anthropic API Key"
            value={anthropicKey}
            onChange={setAnthropicKey}
            isSet={settings.anthropicKeySet}
            required
            error={
              validationErrors.anthropic ??
              (settings.validationErrors['anthropic'] as string | undefined)
            }
            disabled={settings.isSaving}
            provider="anthropic"
            placeholder={settings.anthropicKeySet ? '••••••••••••••••••••' : 'sk-ant-...'}
          />

          <Separator />

          <APIKeyInput
            label="Google Gemini API Key"
            value={googleKey}
            onChange={setGoogleKey}
            isSet={settings.embeddingConfigured}
            required
            error={
              validationErrors.google ?? (settings.validationErrors['google'] as string | undefined)
            }
            disabled={settings.isSaving}
            provider="google"
            placeholder={settings.embeddingConfigured ? '••••••••••••••••••••' : 'AIza...'}
          />
        </div>

        {settings.error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{settings.error}</AlertDescription>
          </Alert>
        )}

        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            {hasChanges ? 'You have unsaved changes' : 'No pending changes'}
          </p>
          <Button
            onClick={handleSave}
            disabled={settings.isSaving || !hasChanges}
            className="min-w-[120px]"
          >
            {settings.isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            {settings.isSaving ? 'Saving...' : 'Save Keys'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
});
