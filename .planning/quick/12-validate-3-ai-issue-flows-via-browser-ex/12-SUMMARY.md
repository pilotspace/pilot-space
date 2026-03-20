# Quick Task 12: Validate 3 AI Issue Flows via Browser

**Date:** 2026-03-15
**Status:** Complete (with findings)
**Commit:** 4e47d6d4 (LLMProvider enum fix)

## Validation Results

### Flow A: Note-to-Issue Extraction (SSE Pipeline)

| Step | Result | Notes |
|------|--------|-------|
| SSE endpoint reachable | PASS | `/api/v1/notes/{id}/extract-issues` returns SSE stream |
| TipTap JSON content accepted | PASS | Note content parsed correctly |
| LLM provider resolution | FAIL | Hardcoded to Anthropic SDK — ignores workspace-configured providers |
| Extraction with Ollama | BLOCKED | `_call_llm()` imports `anthropic.AsyncAnthropic` directly (line 321) |
| NoteIssueLink creation | FIXED (quick-11) | Now creates `EXTRACTED` links after issue creation |

**Root cause of "noop" response:** `IssueExtractionService._resolve_api_key()` only looks for `"anthropic"` provider. The service is tightly coupled to Anthropic SDK and doesn't use the workspace-configured OpenAI-compatible provider.

**Fix needed:** Refactor `_call_llm()` to use provider-agnostic client (OpenAI SDK with `base_url` override) when workspace has a non-Anthropic provider configured.

### Flow B: PilotSpace Agent Chat (Conversational)

| Step | Result | Notes |
|------|--------|-------|
| Agent panel renders | PASS | Shows on note detail and issue detail pages |
| Message input works | PASS | Typed and sent messages |
| Agent responds | PARTIAL | Responds with reasoning steps but `sdk_error` when no Anthropic key |
| Issue creation via MCP tools | BLOCKED | Agent requires Anthropic API key for its core LLM |

**Root cause:** PilotSpaceAgent uses Claude Agent SDK which requires an Anthropic API key. Without it, the agent cannot process any requests.

### Flow C: CLI `pilot implement`

| Step | Result | Notes |
|------|--------|-------|
| CLI installed | PASS | `pilot --help` shows commands |
| `pilot implement --help` | PASS | Shows 6-step workflow |
| `pilot implement PS-1` | BLOCKED | Requires `pilot login` first (no credentials configured) |
| CLAUDE.md template exists | PASS | Jinja2 template at `cli/src/pilot_cli/templates/` |

**To test:** Run `pilot login` with API credentials, then `pilot implement PS-1`.

### Additional Fix: LLMProvider Enum Case Mismatch

**Discovered during testing:** `POST /api/v1/ai/configurations` returned 500 because SQLAlchemy sent uppercase enum names (`OPENAI`) to PostgreSQL which stores lowercase values (`openai`).

**Fix:** Added `values_callable=lambda e: [member.value for member in e]` to the `Enum()` column definition.

**Commit:** `4e47d6d4`

## Summary

| Flow | UI Works | AI Works | End-to-End |
|------|----------|----------|------------|
| A: SSE Extraction | PASS | BLOCKED (Anthropic-only) | FAIL |
| B: Agent Chat | PASS | BLOCKED (no API key) | FAIL |
| C: CLI Implement | PASS | N/A (needs login) | NOT TESTED |

**Key blocker:** All AI flows require an Anthropic API key. The system is BYOK (Bring Your Own Key) but the extraction service is hardcoded to Anthropic SDK instead of being provider-agnostic. To validate end-to-end, either:
1. Set `ANTHROPIC_API_KEY` in backend `.env`, or
2. Refactor extraction service to support OpenAI-compatible providers (Ollama)
