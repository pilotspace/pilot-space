---
phase: quick-260320-mi8
plan: 01
subsystem: frontend/ai-chat
tags: [voice-input, ux-polish, audio-playback, bug-fix]
dependency_graph:
  requires: [quick-260320-hx7]
  provides: [voice-recording-ux-polish, audio-playback-pill, voice-message-history]
  affects: [ChatInput, RecordButton, UserMessage, useVoiceRecording]
tech_stack:
  added: [Web Audio API (AnalyserNode + AudioContext), HTML5 Audio element]
  patterns: [requestAnimationFrame amplitude loop, signed URL audio playback]
key_files:
  created:
    - frontend/src/features/ai/ChatView/ChatInput/AudioPlaybackPill.tsx
  modified:
    - frontend/src/features/ai/ChatView/hooks/useVoiceRecording.ts
    - frontend/src/features/ai/ChatView/ChatInput/RecordButton.tsx
    - frontend/src/features/ai/ChatView/ChatInput/ChatInput.tsx
    - frontend/src/features/ai/ChatView/ChatView.tsx
    - frontend/src/features/ai/ChatView/MessageList/UserMessage.tsx
    - frontend/src/stores/ai/types/conversation.ts
decisions:
  - "AudioPlaybackPill placed in ChatInput/  alongside RecordButton (co-location) rather than shared components/ — it's a chat input concern"
  - "amplitudeLevel uses requestAnimationFrame (not setInterval) for smooth 60fps updates matching browser repaint cycle"
  - "onTranscript callback extended to (text, audioUrl) rather than wrapping in object — minimal API surface change"
  - "errorResetTimerRef stored to clear on unmount — prevents React state update on unmounted component warning"
metrics:
  duration: "~33 minutes"
  completed: "2026-03-20T09:26:45Z"
  tasks_completed: 2
  tasks_skipped: 1
  files_created: 1
  files_modified: 6
---

# Phase quick-260320-mi8 Plan 01: Voice Input Review & Playback Enhancement Summary

**One-liner:** Voice recording UX polished with inline timer + amplitude bars + cancel X, plus a new AudioPlaybackPill component for pre-send and in-message audio playback with signed URL handling.

## Tasks Completed

| # | Task | Commit | Status |
|---|------|--------|--------|
| 1 | Fix useVoiceRecording hook bugs + add amplitude UX enhancements to RecordButton | 090cc096 | Done |
| 2 | Create AudioPlaybackPill, wire audio URL through ChatInput → message metadata → UserMessage | 5005ec84 | Done |
| 3 | Verify complete voice recording and playback flow | — | Skipped (checkpoint:human-verify — user will test manually) |

## What Was Built

### Task 1: useVoiceRecording hook fixes + RecordButton UX

**Bug fixes:**

1. **Error auto-reset timeout leak** — The `setTimeout` inside `setErrorWithAutoReset` was never cleaned up on unmount. Added `errorResetTimerRef` to store the timer ID, clear it in `cleanupMedia`, and reset it on each new invocation.

2. **audioUrl stale state** — `startRecording()` now calls `setAudioUrl(null)` so a previous recording's URL never bleeds into a new session.

3. **onTranscript callback signature** — Extended from `(text: string) => void` to `(text: string, audioUrl: string | null) => void` so the audio URL flows to the parent without a separate state channel.

**Amplitude visualization:**

Added real-time amplitude measurement using Web Audio API:
- `AudioContext` + `AnalyserNode` (fftSize=256) connected to the `MediaStream` source
- `requestAnimationFrame` loop computes RMS amplitude from byte time-domain data, normalized to 0–1 and scaled 3x for typical speech range
- `amplitudeLevel: number` added to `UseVoiceRecordingResult`
- All Web Audio resources cleaned up (`cancelAnimationFrame` + `AudioContext.close()`) in `cleanupMedia` and `stopAmplitudeAnalysis`

**RecordButton recording pill:**

During recording state, the button area expands into a flex pill:
- `[X cancel] [4 amplitude bars] [M:SS timer] [stop square]`
- Pill background: `bg-red-50 dark:bg-red-950/30` with `border border-red-200/60`
- Amplitude bars: 4 thin divs (3px wide) with staggered transition delays (0/30/60/90ms), heights driven by `amplitudeLevel * baseHeight * 100 + 20%` floor
- Duration shown inline in `text-xs font-mono tabular-nums text-red-500`
- Cancel X button: `aria-label="Cancel recording"`, triggers `cancelRecording()`

### Task 2: AudioPlaybackPill + wiring

**AudioPlaybackPill component** (`frontend/src/features/ai/ChatView/ChatInput/AudioPlaybackPill.tsx`):

Compact inline audio player as a rounded-full pill:
- **Play/Pause**: `<audio>` element with ref, toggles `audio.play()` / `audio.pause()`, shows `Play` / `Pause` lucide icons
- **Progress bar**: `h-0.5 w-16` track with `bg-primary` fill div animated via CSS `transition-[width]`
- **Duration**: `formatTime(currentTime) / formatTime(totalDuration)` in `text-[10px] font-mono tabular-nums`
- **Dismiss X**: Optional `onRemove` prop renders an X button at end of pill (for ChatInput pre-send use); absent in UserMessage historical view
- **Error state**: If audio element fires `onerror` or `play()` rejects (signed URL expired), shows "Audio unavailable" text + calls `toast.error('Audio link expired — re-record to play again')`
- **Accessibility**: `aria-label="Play recorded audio"` / `"Pause recorded audio"` on button, `preload="metadata"` on audio

**ChatInput.tsx wiring:**
- Added `pendingAudioUrl: string | null` state
- `RecordButton.onTranscript` updated to `(text, audioUrl)` — sets `setPendingAudioUrl(audioUrl)`
- `AudioPlaybackPill` rendered between `ContextIndicator` and textarea when `pendingAudioUrl` is set
- `onSubmit` prop extended: `(attachmentIds: string[], voiceAudioUrl?: string | null) => void`
- On submit: passes `pendingAudioUrl` to `onSubmit`, resets state to `null`

**ChatView.tsx wiring:**
- `handleSubmit` signature updated to `(attachmentIds, voiceAudioUrl?)`
- Passes `{ voiceAudioUrl }` as metadata to `store.sendMessage` when `voiceAudioUrl` is truthy

**MessageMetadata / UserMessage:**
- Added `voiceAudioUrl?: string | null` to `MessageMetadata` in `conversation.ts`
- `UserMessage` imports and renders `AudioPlaybackPill` when `message.metadata?.voiceAudioUrl` is set (no `onRemove` in history context)

## Deviations from Plan

None — plan executed exactly as written. All type checks and lint passed with 0 errors.

## Quality Gates

- `pnpm type-check`: Passed (0 errors)
- `pnpm lint`: Passed (0 errors, 19 pre-existing warnings in unrelated files)

## Self-Check: PASSED

All created files exist on disk. Both task commits verified in git log.
