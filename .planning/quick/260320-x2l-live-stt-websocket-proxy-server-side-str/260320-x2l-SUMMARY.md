---
phase: quick
plan: 260320-x2l
subsystem: ai-voice
tags: [websocket, speech-to-text, elevenlabs, audioworklet, byok, live-streaming]
dependency_graph:
  requires:
    - existing batch transcription endpoint (transcription.py)
    - SecureKeyStorage (key_storage.py)
    - JWT auth infrastructure (dependencies/auth.py)
  provides:
    - /api/v1/ai/transcribe/stream WS endpoint
    - useLiveTranscription React hook
    - pcm-processor.js AudioWorklet
  affects:
    - RecordButton (adds partial transcript display)
    - useVoiceRecording (adds live mode)
tech_stack:
  added:
    - websockets (Python WS client for ElevenLabs outbound connection)
    - AudioWorklet API (browser PCM capture at 16kHz)
  patterns:
    - Server-side WS proxy (browser -> FastAPI -> ElevenLabs)
    - AudioWorklet + MessagePort for PCM streaming
    - Query-param JWT auth for WS (browsers can't set WS headers)
    - Chunked ArrayBuffer -> base64 conversion (8KB chunks, no stack overflow)
key_files:
  created:
    - backend/src/pilot_space/api/v1/routers/transcription_ws.py
    - backend/tests/api/v1/test_transcription_ws.py
    - backend/tests/api/v1/__init__.py
    - frontend/public/worklets/pcm-processor.js
    - frontend/src/features/ai/ChatView/hooks/useLiveTranscription.ts
  modified:
    - backend/src/pilot_space/main.py
    - frontend/src/features/ai/ChatView/hooks/useVoiceRecording.ts
    - frontend/src/features/ai/ChatView/ChatInput/RecordButton.tsx
decisions:
  - "Query-param JWT auth for WS: browsers cannot set custom WS headers, so token passed as ?token=<jwt>"
  - "accept() before validate in FastAPI WS: WS protocol requires upgrade acceptance before sending close codes"
  - "AudioWorklet over ScriptProcessorNode: ScriptProcessorNode deprecated, AudioWorklet runs in audio thread"
  - "1-second PCM chunks (32000 bytes): balances latency vs. WS message overhead"
  - "8KB chunked base64 encoding: prevents call stack overflow for large ArrayBuffers"
  - "Live mode default in useVoiceRecording: streaming STT is better UX; batch kept for compatibility"
  - "ws://localhost:8000 in dev: Next.js rewrites do not proxy WS connections"
  - "stopStreaming sends commit then keeps WS open: ElevenLabs needs time to finalize transcript"
metrics:
  duration: "147 minutes"
  completed: "2026-03-21"
  tasks_completed: 2
  files_created: 5
  files_modified: 3
---

# Quick Task 260320-x2l: Live STT WebSocket Proxy Summary

**One-liner:** Live speech-to-text via FastAPI WebSocket proxy to ElevenLabs Scribe v2 Realtime with AudioWorklet PCM capture and partial transcript streaming.

## What Was Built

### Task 1: Backend WebSocket Proxy + AudioWorklet

**`backend/src/pilot_space/api/v1/routers/transcription_ws.py`**

FastAPI WebSocket endpoint at `/api/v1/ai/transcribe/stream`:

- Auth flow: Accept connection -> validate JWT query param -> check workspace membership -> retrieve BYOK ElevenLabs key
- Close codes: 4001 (unauthorized), 4003 (not member), 4022 (no API key)
- Proxy architecture: two async tasks (`_browser_to_elevenlabs`, `_elevenlabs_to_browser`) run concurrently using `asyncio.wait(FIRST_COMPLETED)`
- Browser receives `{ type: "partial", text }` and `{ type: "committed", text }` messages
- Error events sent as `{ type: "error", message }` before WS close
- Uses `contextlib.suppress` per ruff SIM105 convention for cleanup

**`frontend/public/worklets/pcm-processor.js`**

AudioWorklet processor that:
- Downsamples AudioContext sample rate to 16kHz (ratio = sampleRate / 16000)
- Converts float32 [-1,1] samples to int16 PCM
- Accumulates a 1-second buffer (32000 bytes = 16000 samples * 2 bytes)
- Posts each complete buffer to main thread as transferable ArrayBuffer

**`backend/tests/api/v1/test_transcription_ws.py`**

3 synchronous WS tests using Starlette TestClient:
1. Missing token -> close code 4001
2. Invalid JWT -> close code 4001 (patches `_get_jwt_provider`)
3. Expired JWT -> close code 4001

### Task 2: Frontend Live Transcription Hook + RecordButton

**`frontend/src/features/ai/ChatView/hooks/useLiveTranscription.ts`**

React hook with:
- `startStreaming()`: gets auth token, opens WS, requests mic, loads AudioWorklet, connects pipeline
- `stopStreaming()`: sends commit message, cleans up audio (WS stays open for committed_transcript)
- `cancelStreaming()`: closes everything without committing
- `getWsBaseUrl()`: dev -> `ws://localhost:8000`, prod -> derives from `window.location`
- Chunked base64 encoding (8KB chunks) to handle 32KB buffers safely

**`useVoiceRecording.ts` modifications**

- Added `mode?: 'live' | 'batch'` option (default: `'live'`)
- Added `onPartialTranscript?: (text: string) => void` callback
- Live mode: routes start/stop/cancel to `useLiveTranscription`
- Batch mode: existing MediaRecorder + POST flow unchanged
- Shared `startDurationTimer` / `stopDurationTimer` helpers for both modes

**`RecordButton.tsx` modifications**

- Passes `mode: 'live'` and `onPartialTranscript` to `useVoiceRecording`
- `partialText` state updated on each partial event, cleared on committed
- Recording pill shows partial transcript (`max-w-[200px] truncate`) between amplitude bars and elapsed time

## Commits

| Hash | Description |
|------|-------------|
| `f354ce62` | feat(260320-x2l): backend WebSocket proxy + AudioWorklet for live STT |
| `3bccd4ce` | feat(260320-x2l): frontend live transcription hook + RecordButton integration |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed pre-commit hook failures on test file**
- **Found during:** Task 1 commit
- **Issue:** `detect-secrets` flagged fake JWT string; ruff SIM117 wanted combined `with` statements
- **Fix:** Added `# pragma: allowlist secret` on the same line as the string; ruff auto-fixed SIM117 patterns
- **Files modified:** `tests/api/v1/test_transcription_ws.py`

**2. [Rule 1 - Bug] Fixed ruff SIM105 lint errors in transcription_ws.py**
- **Found during:** Task 1 implementation
- **Issue:** `try/except/pass` blocks need to use `contextlib.suppress()`
- **Fix:** Replaced with `with suppress(...)` throughout
- **Files modified:** `backend/src/pilot_space/api/v1/routers/transcription_ws.py`

**3. [Rule 1 - Bug] Pyright private usage warning on `_get_jwt_provider`**
- **Found during:** Task 1 type check
- **Issue:** pyright reports `reportPrivateUsage` for cross-module private function import
- **Fix:** Added `# pyright: ignore[reportPrivateUsage]` inline comment (same pattern needed in WebSocket context where FastAPI Depends() cannot be used)
- **Files modified:** `backend/src/pilot_space/api/v1/routers/transcription_ws.py`

**4. [Observation] Test pattern changed from expected**
- **Found during:** Task 1 testing
- **Issue:** Plan assumed WS auth rejection would raise an exception on `connect()`. In reality, FastAPI's WebSocket API calls `accept()` before validating (required by WS protocol), so the connection succeeds but is immediately closed.
- **Fix:** Tests use `ws.receive_text()` inside the open connection to trigger `WebSocketDisconnect` with the close code.

## Self-Check

### Files Exist

- `backend/src/pilot_space/api/v1/routers/transcription_ws.py` - FOUND
- `backend/tests/api/v1/test_transcription_ws.py` - FOUND
- `frontend/public/worklets/pcm-processor.js` - FOUND
- `frontend/src/features/ai/ChatView/hooks/useLiveTranscription.ts` - FOUND

### Commits Exist

- `f354ce62` - FOUND (backend WS proxy + AudioWorklet)
- `3bccd4ce` - FOUND (frontend hook + RecordButton)

### Tests Pass

- `pytest tests/api/v1/test_transcription_ws.py` - 3 passed
- `pnpm type-check` - 0 errors

## Self-Check: PASSED
