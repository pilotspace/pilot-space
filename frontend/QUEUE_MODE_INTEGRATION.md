# Queue Mode Integration - Frontend Implementation

## Overview

Updated the frontend to seamlessly support both queue-based (AI_QUEUE_MODE=true) and direct (AI_QUEUE_MODE=false) chat streaming modes.

## Changes Made

### 1. PilotSpaceStore.ts

**Enhanced `sendMessage()` method:**
- Detects response type by Content-Type header
- **Queue mode (application/json)**: Extracts `job_id`, `session_id`, `stream_url` from JSON response, then connects to GET `/api/v1/ai/chat/stream/{job_id}`
- **Direct mode (text/event-stream)**: Consumes SSE stream directly from POST response
- Stores `session_id` from response for multi-turn conversations

**New private methods:**
- `connectToStream(streamUrl, jobId)`: Connects to queue stream endpoint using SSEClient with GET method
- `consumeSSEStream(response)`: Parses SSE events directly from fetch Response body
- `parseSSEBuffer(buffer)`: Parses SSE protocol (event:/data: lines) into typed events
- `getAuthHeaders()`: Retrieves Supabase auth token for authenticated requests

**SSE Event Handling:**
All 8 SSE event types are handled identically in both modes:
- `message_start`: Extracts and stores session_id
- `text_delta`: Accumulates streaming text
- `tool_use`: Records tool invocations
- `tool_result`: Updates tool execution status
- `task_progress`: Updates long-running task state
- `approval_request`: Adds approval to pending queue (DD-003)
- `message_stop`: Finalizes message with usage/cost metadata
- `error`: Sets error state and resets streaming

### 2. sse-client.ts

**Enhanced SSEClientOptions:**
- Added `method?: 'GET' | 'POST'` parameter
- Defaults to POST if body provided, GET otherwise

**Updated `connect()` method:**
- Respects explicit method parameter
- Only includes Content-Type header for POST requests
- Omits body for GET requests

### 3. useConversationReconnect.ts

**Fixed import error:**
- Removed unused `react-router-dom` import

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ PilotSpaceStore.sendMessage(message, metadata)              │
└────────────────────────────┬────────────────────────────────┘
                             │
                    POST /api/v1/ai/chat
                             │
                ┌────────────┴────────────┐
                │                         │
         Content-Type?            Content-Type?
         application/json      text/event-stream
                │                         │
         ┌──────▼────────┐        ┌──────▼────────┐
         │  Queue Mode   │        │  Direct Mode  │
         │               │        │               │
         │ Extract:      │        │ Consume SSE   │
         │ - job_id      │        │ stream from   │
         │ - session_id  │        │ POST response │
         │ - stream_url  │        │               │
         └──────┬────────┘        └──────┬────────┘
                │                         │
      GET /chat/stream/{job_id}          │
      (SSEClient with method='GET')      │
                │                         │
                └────────────┬────────────┘
                             │
                    handleSSEEvent(event)
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
    message_start       text_delta          tool_use
    (store session)     (accumulate)        (track)
         │                   │                   │
         └───────────────────┴───────────────────┘
                             │
                    Update MobX state
```

## Backend Contract

### Queue Mode Response (AI_QUEUE_MODE=true)
```typescript
POST /api/v1/ai/chat
Response: 200 OK (application/json)
{
  "job_id": "uuid",
  "session_id": "uuid",
  "stream_url": "/api/v1/ai/chat/stream/{job_id}"
}

GET /api/v1/ai/chat/stream/{job_id}
Response: 200 OK (text/event-stream)
// SSE events streamed via Redis pub/sub
```

### Direct Mode Response (AI_QUEUE_MODE=false)
```typescript
POST /api/v1/ai/chat
Response: 200 OK (text/event-stream)
// SSE events streamed directly from agent
```

## SSE Event Format

All events follow the same structure in both modes:

```
event: message_start
data: {"type":"message_start","data":{"messageId":"uuid","sessionId":"uuid"}}

event: text_delta
data: {"type":"text_delta","data":{"delta":"Hello ","messageId":"uuid"}}

event: tool_use
data: {"type":"tool_use","data":{"toolCallId":"uuid","toolName":"read_file","toolInput":{...}}}

event: tool_result
data: {"type":"tool_result","data":{"toolCallId":"uuid","status":"completed","output":{...}}}

event: message_stop
data: {"type":"message_stop","data":{"messageId":"uuid","usage":{...},"costUsd":0.001}}
```

## Multi-Turn Conversation Flow

1. **First message**: `session_id: null` → Backend creates new session
2. **Backend response**: `message_start` event contains `sessionId`
3. **Frontend**: Stores `sessionId` in `PilotSpaceStore.sessionId`
4. **Subsequent messages**: Include `session_id` in request body
5. **Backend**: Loads conversation history from session

## Testing

### Queue Mode Testing
```bash
# Backend: Enable queue mode
export AI_QUEUE_MODE=true
uvicorn pilot_space.main:app --reload

# Frontend: Test chat
# Should see:
# 1. POST /chat returns JSON with job_id
# 2. GET /chat/stream/{job_id} streams events
# 3. Session ID preserved across turns
```

### Direct Mode Testing
```bash
# Backend: Disable queue mode
export AI_QUEUE_MODE=false
uvicorn pilot_space.main:app --reload

# Frontend: Test chat
# Should see:
# 1. POST /chat returns SSE stream immediately
# 2. Session ID preserved across turns
```

## Compatibility

- **Backward Compatible**: Existing deployments with AI_QUEUE_MODE=false work unchanged
- **Forward Compatible**: New deployments with AI_QUEUE_MODE=true automatically detected
- **No Configuration Required**: Frontend detects mode based on response Content-Type

## Quality Gates

- ✅ TypeScript strict mode passes
- ✅ ESLint passes (new code)
- ✅ Authentication headers included in all requests
- ✅ Session ID management for multi-turn conversations
- ✅ Error handling for both modes
- ✅ SSE event parsing robust to malformed data

## Future Enhancements

1. **Reconnection Support**: Use `useConversationReconnect` hook for automatic reconnection
2. **Offline Mode**: Store partial responses in localStorage
3. **Event Replay**: Fetch missed events with `?after_event={index}`
4. **Approval UI**: Integrate approval_request events with UI components
5. **Metrics**: Track queue mode vs direct mode usage
