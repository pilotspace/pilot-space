---
phase: quick-260320-bmd
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  # Backend — provider constants, key validation, transcription endpoint, cache model, migration
  - backend/src/pilot_space/ai/providers/constants.py
  - backend/src/pilot_space/ai/infrastructure/key_storage.py
  - backend/src/pilot_space/api/v1/schemas/workspace.py
  - backend/src/pilot_space/api/v1/schemas/transcription.py
  - backend/src/pilot_space/api/v1/routers/transcription.py
  - backend/src/pilot_space/infrastructure/database/models/transcript_cache.py
  - backend/src/pilot_space/infrastructure/database/models/__init__.py
  - backend/alembic/versions/091_add_transcript_cache_table.py
  - backend/src/pilot_space/main.py
  # Frontend — voice hook, record button, settings UI, API client
  - frontend/src/features/ai/ChatView/hooks/useVoiceRecording.ts
  - frontend/src/features/ai/ChatView/ChatInput/RecordButton.tsx
  - frontend/src/features/ai/ChatView/ChatInput/ChatInput.tsx
  - frontend/src/services/api/transcription.ts
  - frontend/src/features/settings/pages/ai-settings-page.tsx
  - frontend/src/features/settings/components/provider-section.tsx
  - frontend/src/features/settings/components/provider-config-form.tsx
  - frontend/src/stores/ai/AISettingsStore.ts
  - frontend/src/services/api/ai.ts
autonomous: true
requirements: [VOICE-01, VOICE-02, VOICE-03]

must_haves:
  truths:
    - "Admin can configure ElevenLabs API key in workspace AI settings under Voice Services section"
    - "User can click mic button in ChatInput to start voice recording"
    - "Recording shows pulsing animation and click-to-stop UX"
    - "After stopping, audio is sent to backend which proxies to ElevenLabs STT and returns transcript"
    - "Transcript text is inserted into ChatInput textarea"
    - "Transcripts are cached in database to avoid reprocessing same audio"
  artifacts:
    - path: "backend/src/pilot_space/ai/providers/constants.py"
      provides: "ElevenLabs provider in PROVIDER_SERVICE_SLOTS and VALID_PROVIDER_SERVICES with stt service_type"
      contains: "elevenlabs"
    - path: "backend/src/pilot_space/api/v1/routers/transcription.py"
      provides: "POST /ai/transcribe endpoint that proxies audio to ElevenLabs STT"
      exports: ["router"]
    - path: "backend/src/pilot_space/infrastructure/database/models/transcript_cache.py"
      provides: "TranscriptCache SQLAlchemy model for cached transcriptions"
      contains: "class TranscriptCache"
    - path: "frontend/src/features/ai/ChatView/hooks/useVoiceRecording.ts"
      provides: "useVoiceRecording hook with MediaRecorder, recording state, transcript result"
      exports: ["useVoiceRecording"]
    - path: "frontend/src/features/ai/ChatView/ChatInput/RecordButton.tsx"
      provides: "Mic button with pulsing recording animation"
      exports: ["RecordButton"]
    - path: "frontend/src/services/api/transcription.ts"
      provides: "API client for transcription endpoint"
      exports: ["transcriptionApi"]
  key_links:
    - from: "frontend/src/features/ai/ChatView/ChatInput/RecordButton.tsx"
      to: "frontend/src/features/ai/ChatView/hooks/useVoiceRecording.ts"
      via: "useVoiceRecording hook"
      pattern: "useVoiceRecording"
    - from: "frontend/src/features/ai/ChatView/hooks/useVoiceRecording.ts"
      to: "frontend/src/services/api/transcription.ts"
      via: "transcriptionApi.transcribe()"
      pattern: "transcriptionApi"
    - from: "frontend/src/services/api/transcription.ts"
      to: "backend/src/pilot_space/api/v1/routers/transcription.py"
      via: "POST /api/v1/ai/transcribe"
      pattern: "ai/transcribe"
    - from: "backend/src/pilot_space/api/v1/routers/transcription.py"
      to: "backend/src/pilot_space/ai/infrastructure/key_storage.py"
      via: "SecureKeyStorage.get_api_key for elevenlabs:stt"
      pattern: "get_api_key.*elevenlabs"
    - from: "frontend/src/features/ai/ChatView/ChatInput/ChatInput.tsx"
      to: "frontend/src/features/ai/ChatView/ChatInput/RecordButton.tsx"
      via: "RecordButton component in inline toolbar"
      pattern: "RecordButton"
---

<objective>
Add voice-to-text transcription to Pilot Space using ElevenLabs Speech-to-Text API.

Purpose: Enable users to dictate messages into AI Chat via a mic button, with audio transcribed through ElevenLabs STT. BYOK pattern — workspace admins configure their ElevenLabs API key in settings. Transcripts are cached to avoid reprocessing.

Output: Working mic button in ChatInput toolbar, ElevenLabs provider in settings, backend transcription proxy endpoint with caching.
</objective>

<execution_context>
@/Users/tindang/.claude/get-shit-done/workflows/execute-plan.md
@/Users/tindang/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@backend/src/pilot_space/ai/providers/constants.py
@backend/src/pilot_space/ai/infrastructure/key_storage.py
@backend/src/pilot_space/api/v1/routers/workspace_ai_settings.py
@backend/src/pilot_space/api/v1/schemas/workspace.py
@backend/src/pilot_space/infrastructure/database/models/workspace_api_key.py
@frontend/src/features/ai/ChatView/ChatInput/ChatInput.tsx
@frontend/src/features/ai/ChatView/hooks/useAttachments.ts
@frontend/src/features/settings/pages/ai-settings-page.tsx
@frontend/src/features/settings/components/provider-section.tsx
@frontend/src/features/settings/components/provider-config-form.tsx
@frontend/src/stores/ai/AISettingsStore.ts
@frontend/src/services/api/ai.ts
@frontend/src/types/attachments.ts

<interfaces>
<!-- Key types and contracts the executor needs. Extracted from codebase. -->

From backend/src/pilot_space/ai/providers/constants.py:
```python
PROVIDER_SERVICE_SLOTS: list[tuple[str, str, bool]] = [
    ("google", "embedding", False),
    ("ollama", "embedding", True),
    ("anthropic", "llm", False),
    ("ollama", "llm", True),
]
VALID_PROVIDER_SERVICES: dict[str, set[str]] = {
    "google": {"embedding"},
    "anthropic": {"llm"},
    "ollama": {"embedding", "llm"},
}
VALID_PROVIDERS: frozenset[str] = frozenset(VALID_PROVIDER_SERVICES.keys())
```

From backend/src/pilot_space/api/v1/schemas/workspace.py (APIKeyUpdate):
```python
provider: str = Field(pattern="^(google|anthropic|ollama)$")
service_type: str = Field(pattern="^(embedding|llm)$")
```

From backend/src/pilot_space/ai/infrastructure/key_storage.py:
```python
async def validate_api_key(self, provider: str, api_key: str | None, base_url: str | None = None) -> tuple[bool, str | None]
async def store_api_key(self, workspace_id, provider, service_type, api_key, base_url=None, model_name=None)
async def get_api_key(self, workspace_id, provider, service_type) -> str | None
```

From frontend/src/services/api/ai.ts:
```typescript
export interface WorkspaceAISettingsProvider {
  provider: string;
  serviceType: 'embedding' | 'llm';
  isConfigured: boolean;
  isValid: boolean | null;
  lastValidatedAt: string | null;
  baseUrl?: string | null;
  modelName?: string | null;
}
```

From frontend/src/features/settings/components/provider-section.tsx:
```typescript
export interface ProviderSectionProps {
  serviceType: 'embedding' | 'llm';
  icon: React.ElementType;
  title: string;
  description: string;
  onSaved: () => void;
}
```

From frontend ChatInput toolbar pattern (ChatInput.tsx):
```tsx
{/* Inline toolbar buttons */}
<div className="absolute bottom-1.5 right-2 flex items-center gap-0.5">
  <AttachmentButton ... />
  <TokenBudgetRing ... />
  <SkillMenu ... />
  <AgentMenu ... />
  <SectionMenu ... />
  <SessionResumeMenu ... />
</div>
```

Router mounting pattern (main.py):
```python
app.include_router(workspace_ai_settings_router, prefix=f"{API_V1_PREFIX}/workspaces")
```

Current alembic head: 090_add_tags_and_usage_to_skills
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Backend — ElevenLabs provider, transcription endpoint, and transcript cache</name>
  <files>
    backend/src/pilot_space/ai/providers/constants.py
    backend/src/pilot_space/ai/infrastructure/key_storage.py
    backend/src/pilot_space/api/v1/schemas/workspace.py
    backend/src/pilot_space/api/v1/schemas/transcription.py
    backend/src/pilot_space/api/v1/routers/transcription.py
    backend/src/pilot_space/infrastructure/database/models/transcript_cache.py
    backend/src/pilot_space/infrastructure/database/models/__init__.py
    backend/alembic/versions/091_add_transcript_cache_table.py
    backend/src/pilot_space/main.py
  </files>
  <action>
    **1. Add ElevenLabs to provider constants** (`constants.py`):
    - Add `("elevenlabs", "stt", False)` to `PROVIDER_SERVICE_SLOTS`
    - Add `"elevenlabs": {"stt"}` to `VALID_PROVIDER_SERVICES`
    - `VALID_PROVIDERS` auto-derives from `VALID_PROVIDER_SERVICES.keys()` — no change needed

    **2. Add ElevenLabs validation** (`key_storage.py`):
    - Add `elif provider == "elevenlabs":` branch in `validate_api_key()` method
    - Validation: make a lightweight GET request to `https://api.elevenlabs.io/v1/models` with header `xi-api-key: {api_key}`
    - If 200 response, key is valid. If 401/403, key is invalid
    - Use `httpx.AsyncClient(timeout=5.0)` (same pattern as Ollama validation)

    **3. Update workspace schemas** (`schemas/workspace.py`):
    - Update `APIKeyUpdate.provider` field pattern from `"^(google|anthropic|ollama)$"` to `"^(google|anthropic|ollama|elevenlabs)$"`
    - Update `APIKeyUpdate.service_type` field pattern from `"^(embedding|llm)$"` to `"^(embedding|llm|stt)$"`
    - The `check_provider_service_combo` validator already dynamically checks against `VALID_PROVIDER_SERVICES` so it will automatically work

    **4. Create transcription schemas** (`schemas/transcription.py`):
    ```python
    class TranscribeRequest(BaseSchema):
        """Metadata for transcription — audio file sent as multipart."""
        language: str | None = Field(default=None, description="ISO 639-1 language code hint")

    class TranscribeResponse(BaseSchema):
        transcript_id: UUID
        text: str
        language_code: str | None
        duration_seconds: float | None
        cached: bool = Field(default=False, description="True if result was served from cache")
    ```

    **5. Create TranscriptCache model** (`models/transcript_cache.py`):
    ```python
    class TranscriptCache(Base, TimestampMixin, WorkspaceScopedMixin):
        __tablename__ = "transcript_cache"
        id: Mapped[uuid.UUID] (primary_key, gen_random_uuid)
        audio_hash: Mapped[str] (String(64), SHA-256 of audio bytes, indexed)
        text: Mapped[str] (Text, the transcription)
        language_code: Mapped[str | None] (String(10))
        duration_seconds: Mapped[float | None]
        provider: Mapped[str] (String(50), default "elevenlabs")
        metadata_json: Mapped[dict | None] (JSON, for extra info like model used)
    ```
    - Add unique constraint on (workspace_id, audio_hash)
    - Register in `models/__init__.py`

    **6. Create alembic migration** (`091_add_transcript_cache_table.py`):
    - Revision down_revision = head of 090
    - Create `transcript_cache` table with all columns from model
    - Index on `audio_hash` for cache lookups

    **7. Create transcription router** (`routers/transcription.py`):
    - `POST /ai/transcribe` — accepts multipart form: `file` (UploadFile, audio/*) + optional `language` form field
    - Auth: `CurrentUser` + `DbSession` (same pattern as other routers)
    - Workspace context: require `X-Workspace-Id` header (UUID)
    - Flow:
      1. Read uploaded file bytes, compute SHA-256 hash
      2. Check `transcript_cache` for existing entry with matching (workspace_id, audio_hash)
      3. If cache hit: return cached transcript with `cached=True`
      4. If cache miss: retrieve ElevenLabs API key via `SecureKeyStorage.get_api_key(workspace_id, "elevenlabs", "stt")`
      5. If no key configured: return 422 with "ElevenLabs API key not configured"
      6. POST audio to `https://api.elevenlabs.io/v1/speech-to-text` with:
         - Header: `xi-api-key: {api_key}`
         - Multipart body: `file` field with audio bytes, `model_id` = `"scribe_v1"` (ElevenLabs STT model)
         - Optional: `language_code` if provided
      7. Parse response JSON for `text`, `language_code`, `audio_duration`
      8. Store in `transcript_cache` (workspace_id, audio_hash, text, language_code, duration)
      9. Return TranscribeResponse
    - Validate file size: max 25MB
    - Validate MIME type: allow `audio/webm`, `audio/ogg`, `audio/wav`, `audio/mp4`, `audio/mpeg`

    **8. Mount router** (`main.py`):
    - Import `from pilot_space.api.v1.routers.transcription import router as transcription_router`
    - Add `app.include_router(transcription_router, prefix=f"{API_V1_PREFIX}/ai")` near other AI routers
    - Register `pilot_space.api.v1.routers.transcription` in container.py `wiring_config.modules` if using `@inject` (likely not needed since we use lazy imports like workspace_ai_settings router)
  </action>
  <verify>
    <automated>cd backend && uv run python -c "from pilot_space.ai.providers.constants import VALID_PROVIDERS, VALID_PROVIDER_SERVICES; assert 'elevenlabs' in VALID_PROVIDERS; assert 'stt' in VALID_PROVIDER_SERVICES['elevenlabs']; print('OK')" && uv run python -c "from pilot_space.api.v1.routers.transcription import router; print('Router OK')" && uv run python -c "from pilot_space.infrastructure.database.models.transcript_cache import TranscriptCache; print('Model OK')" && uv run ruff check src/pilot_space/api/v1/routers/transcription.py src/pilot_space/api/v1/schemas/transcription.py src/pilot_space/ai/providers/constants.py src/pilot_space/infrastructure/database/models/transcript_cache.py && uv run pyright src/pilot_space/api/v1/routers/transcription.py src/pilot_space/api/v1/schemas/transcription.py</automated>
  </verify>
  <done>
    - ElevenLabs appears in VALID_PROVIDERS with stt service type
    - validate_api_key handles "elevenlabs" provider via GET /v1/models
    - APIKeyUpdate schema accepts elevenlabs provider and stt service_type
    - POST /ai/transcribe endpoint accepts audio upload, proxies to ElevenLabs STT, returns transcript
    - TranscriptCache model persists transcriptions with SHA-256 deduplication
    - Migration 091 creates transcript_cache table
    - Router mounted in main.py
    - ruff + pyright pass on all new files
  </done>
</task>

<task type="auto">
  <name>Task 2: Frontend — Voice recording hook, transcription API, record button, and settings UI</name>
  <files>
    frontend/src/services/api/transcription.ts
    frontend/src/features/ai/ChatView/hooks/useVoiceRecording.ts
    frontend/src/features/ai/ChatView/ChatInput/RecordButton.tsx
    frontend/src/features/ai/ChatView/ChatInput/ChatInput.tsx
    frontend/src/features/settings/pages/ai-settings-page.tsx
    frontend/src/features/settings/components/provider-section.tsx
    frontend/src/features/settings/components/provider-config-form.tsx
    frontend/src/stores/ai/AISettingsStore.ts
    frontend/src/services/api/ai.ts
  </files>
  <action>
    **1. Create transcription API client** (`services/api/transcription.ts`):
    ```typescript
    import { apiClient } from './client';

    export interface TranscribeResponse {
      transcriptId: string;
      text: string;
      languageCode: string | null;
      durationSeconds: number | null;
      cached: boolean;
    }

    export const transcriptionApi = {
      transcribe: async (audioBlob: Blob, workspaceId: string, language?: string): Promise<TranscribeResponse> => {
        const formData = new FormData();
        formData.append('file', audioBlob, 'recording.webm');
        if (language) formData.append('language', language);
        return apiClient.post<TranscribeResponse>('/ai/transcribe', formData, {
          headers: { 'X-Workspace-Id': workspaceId, 'Content-Type': 'multipart/form-data' },
        });
      },
    };
    ```

    **2. Create useVoiceRecording hook** (`hooks/useVoiceRecording.ts`):
    - State: `status: 'idle' | 'recording' | 'transcribing' | 'error'`, `transcript: string | null`, `error: string | null`, `durationMs: number`
    - `startRecording()`:
      1. Request `navigator.mediaDevices.getUserMedia({ audio: true })`
      2. Create `MediaRecorder` with `mimeType: 'audio/webm;codecs=opus'` (fallback to `audio/webm` if opus not supported, then `audio/ogg;codecs=opus`, then default)
      3. Collect chunks via `ondataavailable`
      4. Set status to `'recording'`, start a duration timer (setInterval every 100ms)
      5. Handle permission denied with toast error
    - `stopRecording()`:
      1. Call `mediaRecorder.stop()` — triggers `onstop`
      2. In `onstop`: create Blob from chunks, set status to `'transcribing'`
      3. Call `transcriptionApi.transcribe(blob, workspaceId)`
      4. On success: set `transcript` to response.text, status to `'idle'`
      5. On error: set status to `'error'`, error message
      6. Stop all media tracks, clear duration timer
    - `cancelRecording()`: stop without transcribing, discard chunks
    - Return: `{ status, transcript, error, durationMs, startRecording, stopRecording, cancelRecording }`
    - Clean up: stop media tracks and clear timers on unmount via useEffect cleanup
    - Accept `workspaceId: string` and `onTranscript: (text: string) => void` callback in options

    **3. Create RecordButton component** (`ChatInput/RecordButton.tsx`):
    - Import `Mic`, `Square` (stop icon) from `lucide-react`
    - Props: `workspaceId: string`, `onTranscript: (text: string) => void`, `disabled: boolean`
    - Uses `useVoiceRecording` hook internally
    - Idle state: ghost mic button (same styling as other toolbar buttons: `h-6 w-6 text-muted-foreground/60 hover:text-foreground`)
    - Recording state: button turns red with pulsing animation ring. Show `Square` icon (stop). Display elapsed time as small badge (e.g., "0:05")
    - Transcribing state: show `Loader2` with `animate-spin` (same pattern as ProviderConfigForm save button)
    - Error state: brief toast via sonner, reset to idle
    - Pulsing animation CSS: use Tailwind `animate-pulse` on an outer ring `div` with `bg-red-500/20 rounded-full` behind the button
    - When `onTranscript` fires, caller (ChatInput) appends text to textarea value
    - Use `Tooltip` from shadcn/ui to show "Voice input" on hover (idle), "Stop recording" (recording), "Transcribing..." (transcribing)

    **4. Integrate RecordButton into ChatInput** (`ChatInput.tsx`):
    - Import `RecordButton` from `./RecordButton`
    - Add `RecordButton` in the inline toolbar div, positioned BEFORE `AttachmentButton` (leftmost position so it's easily accessible)
    - Pass `workspaceId={workspaceId ?? ''}` and `disabled={isDisabled || isStreaming}`
    - `onTranscript` callback: append transcript text to current value via `onChange(value + (value ? ' ' : '') + text)`, then focus textarea
    - No new props needed on ChatInput — it already has `workspaceId`

    **5. Update AI Settings UI for Voice Services section** (`ai-settings-page.tsx`):
    - Add new `ProviderSection` between LLM section and Feature Toggles:
      ```tsx
      <Separator />
      {/* Voice Services Section */}
      <ProviderSection
        serviceType="stt"
        icon={Mic}
        title="Voice Services"
        description="Used for voice-to-text transcription in AI Chat. Configure your ElevenLabs API key."
        onSaved={handleProviderSaved}
      />
      ```
    - Import `Mic` from `lucide-react`

    **6. Update ProviderSection and ProviderConfigForm to support stt service type**:
    - `provider-section.tsx`: Update `ProviderSectionProps.serviceType` type from `'embedding' | 'llm'` to `'embedding' | 'llm' | 'stt'`
    - Add `PROVIDER_DISPLAY_NAMES` entry: `elevenlabs: 'ElevenLabs'`
    - `provider-config-form.tsx`:
      - Update `ProviderConfigFormProps.serviceType` type to include `'stt'`
      - Add `PROVIDER_CONFIG` entry for elevenlabs:
        ```typescript
        elevenlabs: {
          name: 'ElevenLabs',
          fields: ['api_key'],
          // No base_url or model_name needed — ElevenLabs uses fixed endpoint
        },
        ```
      - Update `handleSave` — the `entry.service_type` type needs to accept `'stt'`

    **7. Update AISettingsStore** (`AISettingsStore.ts`):
    - Update `getProvidersByService` parameter type to `'embedding' | 'llm' | 'stt'`
    - Update `getDefaultProvider` to handle `'stt'` case: return `this.settings?.defaultSttProvider ?? 'elevenlabs'`
    - Add computed `sttConfigured`: checks if any provider with serviceType 'stt' is configured
    - Add `validateKey` case for elevenlabs: `case 'elevenlabs': return key.length >= 20;` (ElevenLabs keys are typically 32 hex chars)

    **8. Update AI API types** (`services/api/ai.ts`):
    - Update `WorkspaceAISettingsProvider.serviceType` from `'embedding' | 'llm'` to `'embedding' | 'llm' | 'stt'`
    - Update `updateWorkspaceSettings` `service_type` parameter type to match
    - Add `defaultSttProvider?: string` to `WorkspaceAISettings` interface
  </action>
  <verify>
    <automated>cd frontend && pnpm type-check && pnpm lint --max-warnings=0 2>/dev/null || pnpm lint</automated>
  </verify>
  <done>
    - transcriptionApi.transcribe sends audio blob to POST /ai/transcribe and returns transcript
    - useVoiceRecording hook manages MediaRecorder lifecycle, recording state, and transcription flow
    - RecordButton renders in ChatInput toolbar with mic icon, pulsing red animation during recording, spinner during transcription
    - Clicking mic starts recording, clicking again stops and transcribes, transcript inserted into textarea
    - AI Settings page shows "Voice Services" section with ElevenLabs provider config (API key field)
    - ProviderSection and ProviderConfigForm accept 'stt' service type
    - AISettingsStore handles stt provider queries
    - TypeScript compiles without errors, ESLint passes
  </done>
</task>

</tasks>

<verification>
1. Backend: `cd backend && uv run ruff check && uv run pyright src/pilot_space/api/v1/routers/transcription.py src/pilot_space/api/v1/schemas/transcription.py src/pilot_space/ai/providers/constants.py`
2. Frontend: `cd frontend && pnpm type-check && pnpm lint`
3. Provider registration: Python import check confirms elevenlabs in VALID_PROVIDERS with stt service
4. Manual smoke test: Open AI Settings, see Voice Services section, enter ElevenLabs API key, save. Open AI Chat, click mic button, speak, see transcript appear in textarea.
</verification>

<success_criteria>
- ElevenLabs provider registered in backend constants with "stt" service type
- Backend POST /ai/transcribe endpoint proxies audio to ElevenLabs STT API with transcript caching
- Frontend RecordButton in ChatInput toolbar with recording animation and transcript insertion
- AI Settings page has Voice Services section for ElevenLabs API key configuration
- All type checks and linters pass (ruff, pyright, tsc, eslint)
</success_criteria>

<output>
After completion, create `.planning/quick/260320-bmd-voice-input-with-elevenlabs-api-voice-to/260320-bmd-SUMMARY.md`
</output>
