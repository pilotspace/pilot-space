# Integrations Module Documentation - Pilot Space

**For backend architecture context, see `/backend/CLAUDE.md`**

---

## Overview

The integrations module provides external service connectivity for Pilot Space, enabling GitHub integration for PR reviews, webhook handling, and commit/PR linking to issues. Built around a provider-based architecture supporting OAuth flows, webhook validation, and async event processing.

**Current Integration Status**:
- **GitHub**: Fully implemented (OAuth, webhooks, commit/PR linking, API client)
- **Slack**: Placeholder (structure ready, implementation deferred to Phase 2)

---

## Submodule Documentation

- **[github/CLAUDE.md](github/CLAUDE.md)** -- GitHubClient (14 async API methods, OAuth flow, error handling), GitHubWebhookHandler (HMAC-SHA256 verification, event types, idempotency), GitHubSyncService (pattern recognition, commit/PR linking, IntegrationLink storage), Integration Service Layer (ConnectGitHub, LinkCommit, ProcessWebhook, AutoTransition), API Endpoints (11 total), Webhook Setup (steps 1-5)

---

## Quick Reference

### Module Structure

```
backend/src/pilot_space/integrations/
+-- __init__.py                              # Module exports
+-- github/                                  # GitHub integration
|  +-- client.py                            # GitHubClient (OAuth, API operations)
|  +-- webhooks.py                          # GitHubWebhookHandler (signature verification)
|  +-- models.py                            # Data classes (GitHubUser, GitHubRepository, etc.)
|  +-- exceptions.py                        # GitHub-specific exceptions
|  +-- sync.py                              # GitHubSyncService (commit/PR linking)
|  +-- CLAUDE.md                            # Deep-dive documentation
|  +-- __init__.py                          # Exports
+-- slack/                                   # Slack integration (placeholder)
   +-- __init__.py
```

### Integration Flow

```
User (Connect GitHub) -> OAuth URL -> GitHub
  | (User approves)
OAuth Callback -> Code Exchange -> ConnectGitHubService
  +-- Exchange code for access token
  +-- Fetch user info
  +-- Encrypt and store token
  +-- Return integration record

Webhook Events -> /api/v1/webhooks/github
  +-- Verify HMAC-SHA256 signature
  +-- Parse event (GitHubWebhookHandler)
  +-- ProcessGitHubWebhookService
     +-- GitHubSyncService (link commits/PRs to issues)
```

---

## Security Considerations

| Consideration | Pattern | Details |
|---|---|---|
| Webhook Signatures | HMAC-SHA256 verify first | `body = await request.body()` -> verify -> parse |
| Token Encryption | Supabase Vault (AES-256-GCM) | encrypt on storage, decrypt on use |
| RLS in Links | Always filter by workspace_id | IntegrationLink queries include workspace_id |
| OAuth CSRF | State parameter tied to workspace | `state = f"{workspace_id}:{token}"` |

---

## Testing

All integrations require:
- Unit tests for signature verification, event parsing, issue reference extraction
- Integration tests for OAuth flow, webhook idempotency, RLS isolation
- Coverage >80% (run `pytest --cov=.`)

---

## Common Errors & Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| Webhook signature verification failed | Wrong secret, body modified | Verify signature BEFORE reading body |
| Integration not found | OAuth broken, workspace mismatch | Verify integration.workspace_id matches request |
| Rate limit exceeded | Too many GitHub API calls | Catch GitHubRateLimitError, retry after reset_at |
| Duplicate delivery | GitHub retry or double-processing | Use is_duplicate() + mark_processed() |

---

## Phase 2 & Future Work

### Planned Integrations
- **Slack**: Notifications, slash commands, approval workflows
- **Linear**: Issue sync
- **Jira**: Issue mapping
- **GitLab**: Alternative Git provider

### Planned Features
- PR review comments with AI analysis
- Auto-transitions when PRs merged (DD-003 approval workflow)
- Bidirectional sync (Pilot Space -> GitHub issues)
- Custom webhooks for user-defined integrations
- Rate limit pooling across workspaces

---

## Related Documentation

- **Backend architecture**: `/backend/CLAUDE.md`
- **Application services**: [application/CLAUDE.md](../application/CLAUDE.md) (CQRS-lite pattern)
- **RLS enforcement**: [infrastructure/auth/CLAUDE.md](../infrastructure/auth/CLAUDE.md) (workspace isolation)
- **API routers**: `/backend/src/pilot_space/api/v1/routers/integrations.py`, `webhooks.py`

---

## Generation Metadata

**Generated**: 2026-02-10 | **Scope**: GitHub OAuth, webhooks, commit/PR linking, API integration

**Patterns**: OAuth 2.0 code exchange, HMAC-SHA256 webhook verification, idempotent processing, issue reference extraction, token encryption, RLS enforcement, async/await, CQRS-lite service layer

**Deferred**: Slack integration, PR review comments, auto-transition on merge, bidirectional sync, distributed webhook deduplication
