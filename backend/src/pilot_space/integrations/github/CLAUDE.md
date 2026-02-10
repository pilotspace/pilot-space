# GitHub Integration - Pilot Space

**For integrations overview, see [integrations/CLAUDE.md](../CLAUDE.md)**

---

## Overview

The GitHub integration provides OAuth connectivity, webhook handling, and commit/PR linking to issues. It supports the full lifecycle: user connects GitHub account, sets up webhooks on repositories, and Pilot Space automatically links commits and PRs to issues while enabling AI-powered PR reviews.

---

## GitHubClient - API Operations

**Location**: `/backend/src/pilot_space/integrations/github/client.py`

Async HTTP client for GitHub REST API v3 with OAuth support and rate limiting.

### OAuth Flow

```python
# Step 1: Generate authorization URL (CSRF-protected with state)
authorize_url = GitHubClient.get_authorize_url(
    client_id="your-client-id",
    redirect_uri="https://app.example.com/auth/github/callback",
    state="workspace-uuid:random-token",
)

# Step 2: Exchange code for token, fetch user, store encrypted token
service = ConnectGitHubService(session, integration_repo)
result = await service.execute(
    ConnectGitHubPayload(
        workspace_id=workspace_id,
        code="code-from-callback",
        user_id=current_user_id,
        client_id=settings.github_client_id,
        client_secret=settings.github_client_secret,
        redirect_uri=settings.github_callback_url,
    )
)
```

### API Methods (14 async methods)

| Category | Methods | Returns |
|----------|---------|---------|
| **User** | `get_current_user()` | GitHubUser |
| **Repositories** | `get_repos()`, `get_repo(owner, repo)` | list[GitHubRepository] |
| **Commits** | `get_commits(owner, repo, since)`, `get_commit(owner, repo, sha)` | list[GitHubCommit] |
| **Pull Requests** | `get_pull_requests(owner, repo)`, `get_pull_request(owner, repo, number)` | list[GitHubPullRequest] |
| **Comments** | `post_comment()`, `post_review_comment()`, `get_pull_request_files()` | dict |
| **Webhooks** | `create_webhook()`, `delete_webhook()` | dict or None |
| **Rate Limit** | `get_rate_limit()` | RateLimitInfo |

### Error Handling

```python
GitHubAPIError              # Base exception
+-- GitHubAuthError         # OAuth or token issues
+-- GitHubRateLimitError    # Rate limit exceeded (includes reset_at)

try:
    repos = await client.get_repos()
except GitHubRateLimitError as e:
    # Backoff and retry after e.reset_at
except GitHubAuthError as e:
    # Re-authenticate
except GitHubAPIError as e:
    # Handle error (status code available via e.status_code)
```

---

## GitHubWebhookHandler - Webhook Processing

**Location**: `/backend/src/pilot_space/integrations/github/webhooks.py`

Parse and validate GitHub webhook events with HMAC-SHA256 signature verification.

### Signature Verification

**CRITICAL**: Signature verification must happen BEFORE processing payload.

1. GitHub sends POST to webhook URL with `X-Hub-Signature-256` header
2. Signature is `sha256=<hex-digest>` of request body
3. We verify by recomputing HMAC with shared secret

```python
handler = GitHubWebhookHandler(webhook_secret="your-secret-key")

try:
    handler.verify_signature(
        payload=request_body_bytes,
        signature="sha256=abc123...",  # From X-Hub-Signature-256 header
    )
except WebhookVerificationError:
    return 401  # Signature invalid - reject webhook
```

### Router Integration

```python
@router.post("/webhooks/github")
async def receive_github_webhook(
    request: Request,
    x_github_event: str = Header(..., alias="X-GitHub-Event"),
    x_github_delivery: str = Header(..., alias="X-GitHub-Delivery"),
    x_hub_signature_256: str = Header(..., alias="X-Hub-Signature-256"),
) -> WebhookProcessResult:
    settings = get_settings()
    body = await request.body()  # Raw bytes for signature verification

    handler = GitHubWebhookHandler(
        webhook_secret=settings.github_webhook_secret.get_secret_value()
    )

    # Verify signature FIRST
    try:
        handler.verify_signature(body, x_hub_signature_256)
    except WebhookVerificationError as e:
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    # Parse payload
    payload = await request.json()
    webhook = handler.parse_event(x_github_event, x_github_delivery, payload)

    # Check for duplicate
    if handler.is_duplicate(x_github_delivery):
        return WebhookProcessResult(processed=False, error="Duplicate delivery")

    # Enqueue for processing
    msg_id = await handler.enqueue_for_processing(
        workspace_id=workspace_id,
        integration_id=integration_id,
        webhook=webhook,
    )

    handler.mark_processed(x_github_delivery)
    return WebhookProcessResult(processed=True, event_type=webhook.event_type.value)
```

### Supported Event Types

```python
class GitHubEventType(str, Enum):
    PUSH = "push"                           # Branch push
    PULL_REQUEST = "pull_request"           # PR opened/closed/merged
    PULL_REQUEST_REVIEW = "pull_request_review"  # Code review
    ISSUE_COMMENT = "issue_comment"         # Comment on issue/PR

class GitHubPRAction(str, Enum):
    OPENED = "opened"
    CLOSED = "closed"
    REOPENED = "reopened"
    MERGED = "merged"                       # Virtual (closed + merged)
    SYNCHRONIZE = "synchronize"            # New commits pushed
```

### Payload Parsing

- `parse_push_event(payload)` -> ParsedPushEvent with branch, commits, repository
- `parse_pr_event(payload)` -> ParsedPREvent with action, number, title, branches, author

### Idempotency

Webhooks can be delivered multiple times. GitHub includes delivery ID in `X-GitHub-Delivery` header.

```python
if handler.is_duplicate(delivery_id):
    return  # Already processed

# Process webhook...
handler.mark_processed(delivery_id)
```

Deduplication is in-memory with bounded size (max 10,000 entries, LRU eviction). For distributed systems, use database-level deduplication.

---

## GitHubSyncService - Commit/PR Linking

**Location**: `/backend/src/pilot_space/integrations/github/sync.py`

Link commits and PRs to issues via issue reference extraction from commit messages.

### Pattern Recognition

```python
# Issue reference pattern
ISSUE_REF_PATTERN = r"([A-Z]{2,10})-(\d+)"

# Closing prefixes
FIX_PREFIXES = ("fix", "fixes", "fixed", "close", "closes", "closed", "resolve", "resolves")

# Examples matched:
# "Fix PROJ-123"  -> IssueReference(identifier="PROJ-123", is_closing=True)
# "PILOT-42 desc" -> IssueReference(identifier="PILOT-42", is_closing=False)
# "Fixes ABC-456" -> IssueReference(identifier="ABC-456", is_closing=True)
```

- Case-insensitive matching
- Deduplication of references within a single commit

### Service Methods

| Method | Purpose |
|--------|---------|
| `sync_commit(workspace_id, integration_id, commit, repository)` | Link single commit to matched issues |
| `sync_pull_request(workspace_id, integration_id, pr, repository)` | Link PR to matched issues |
| `sync_push_event(workspace_id, integration_id, push)` | Batch process all commits in push |
| `sync_pr_event(workspace_id, integration_id, pr)` | Process PR event from webhook |

### IntegrationLink Storage

IntegrationLink records store:

| Field | Purpose |
|-------|---------|
| `workspace_id` | Workspace scope (RLS) |
| `integration_id` | Parent integration |
| `issue_id` | Linked issue |
| `link_type` | COMMIT or PULL_REQUEST |
| `external_id` | SHA (commit) or number (PR) |
| `external_url` | GitHub URL |
| `title` | Commit message or PR title |
| `author_name` | Committer/PR author |
| `author_avatar_url` | Author avatar |
| `link_metadata` | JSONB: sha, message, repository, timestamp, additions, deletions, files_changed, is_closing |

---

## Integration Service Layer

**Location**: `/backend/src/pilot_space/application/services/integration/`

Application services follow CQRS-lite pattern for high-level integration operations.

### ConnectGitHubService

Connects GitHub account via OAuth. Returns integration record with encrypted token.

**Flow**: Exchange code -> Fetch user -> Encrypt token -> Store integration -> Return result

**Result**: `integration.id`, `github_login`, `github_name`, `github_avatar_url`

**Errors**: `GitHubConnectionError` (OAuth/user fetch), other exceptions (500)

### LinkCommitService

Manually links commits/PRs to issues. Validates integration, checks duplicates, records activity.

**Methods**:
- `link_commit(workspace_id, issue_id, integration_id, repository, commit_sha)`
- `link_pull_request(workspace_id, issue_id, integration_id, repository, pr_number)`

**Result**: `link.id`, `created` (bool), `commit_message`, `author_name`

### ProcessGitHubWebhookService

Processes webhook events (push, PR). Extracts commits/PRs, finds issue refs, creates links.

**Result**: `processed` (bool), `event_type`, `links_created`, `issues_affected`

**Handles**: Push events (commits), PR events (creation/merge), PR review (Phase 2)

### AutoTransitionService

Auto-transitions issues based on webhook events:

| Webhook Event | Issue Transition |
|---------------|------------------|
| PR opened | -> In Review |
| PR merged | -> Done |
| Commit pushed | -> In Progress |

---

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/integrations/github/authorize?workspace_id=X` | Get OAuth URL with CSRF state |
| POST | `/integrations/github/callback` | Exchange code for token, create integration |
| GET | `/integrations?workspace_id=X` | List workspace integrations |
| GET | `/integrations/{id}` | Get integration details |
| DELETE | `/integrations/{id}` | Disconnect integration |
| GET | `/integrations/github/{id}/repos` | List repositories |
| POST | `/integrations/github/{id}/repos/{owner}/{repo}/webhook` | Setup webhook |
| GET | `/integrations/issues/{id}/links` | Get issue links (commits/PRs) |
| POST | `/integrations/issues/{id}/links/commit` | Manually link commit |
| POST | `/integrations/issues/{id}/links/pull-request` | Manually link PR |
| POST | `/webhooks/github` | Receive webhook (push, PR, review) |

---

## Webhook Setup (Step-by-Step)

### Step 1: Configure OAuth App

1. GitHub Settings -> Developer Settings -> OAuth Apps
2. Create new OAuth Application
3. Set Authorization callback URL: `https://app.example.com/auth/github/callback`
4. Note the Client ID and Client Secret

### Step 2: Set Environment Variables

```bash
GITHUB_CLIENT_ID=your-client-id
GITHUB_CLIENT_SECRET=your-client-secret
GITHUB_CALLBACK_URL=https://app.example.com/auth/github/callback
GITHUB_WEBHOOK_SECRET=random-secret-key-min-32-chars
```

### Step 3: User Connects GitHub

1. User clicks "Connect GitHub" button
2. Frontend gets OAuth URL: `GET /api/v1/integrations/github/authorize?workspace_id=<workspace>`
3. User redirected to GitHub login -> approves permissions
4. GitHub redirects to callback with code
5. Frontend sends: `POST /api/v1/integrations/github/callback` with code
6. Backend exchanges code for access token, encrypts and stores

### Step 4: Setup Webhook in Repository

1. User selects repository from list: `GET /api/v1/integrations/github/<integration_id>/repos`
2. User clicks "Setup Webhook"
3. Backend creates webhook: `POST /api/v1/integrations/github/<id>/repos/<owner>/<repo>/webhook`
4. GitHub sends events to `https://app.example.com/api/v1/webhooks/github`

### Step 5: Event Processing

1. GitHub sends POST to webhook URL with signature header
2. Backend verifies `X-Hub-Signature-256` header
3. Parses event type from `X-GitHub-Event`
4. Enqueues for async processing (or processes synchronously)
5. Returns 200 OK immediately

---

## Security Considerations

| Consideration | Pattern | Details |
|---|---|---|
| Webhook Signatures | HMAC-SHA256 verify first | `body = await request.body()` then `verify_signature(body, signature)` then parse |
| Token Encryption | Supabase Vault (AES-256-GCM) | `encrypt_api_key()` on storage, decrypt on use |
| RLS in Links | Always filter by workspace_id | IntegrationLink queries include workspace_id AND condition |
| OAuth CSRF | State parameter tied to workspace | Generate: `state = f"{workspace_id}:{token}"`, validate after callback |

---

## Common Errors & Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| Webhook signature verification failed | Wrong secret, body modified, not from GitHub | Verify signature BEFORE reading body |
| Integration not found | OAuth broken, deleted, workspace mismatch | Verify `integration.workspace_id` matches request context |
| Rate limit exceeded | Too many GitHub API calls | Catch `GitHubRateLimitError`, retry after `reset_at` |
| Duplicate delivery | GitHub retry or double-processing | Use `is_duplicate()` + `mark_processed()` |

---

## Key Files

| File | Purpose |
|------|---------|
| `client.py` | GitHubClient (OAuth, 14 API methods, rate limiting) |
| `webhooks.py` | GitHubWebhookHandler (signature verification, event parsing) |
| `sync.py` | GitHubSyncService (issue reference extraction, link creation) |
| `models.py` | Data classes (GitHubUser, GitHubRepository, GitHubCommit, etc.) |
| `exceptions.py` | Exception hierarchy (GitHubAPIError, AuthError, RateLimitError) |

---

## Related Documentation

- **Integrations overview**: [integrations/CLAUDE.md](../CLAUDE.md) (security, testing, phase 2 plans)
- **Application services**: [application/services/CLAUDE.md](../../application/services/CLAUDE.md) (CQRS-lite pattern)
- **Auth & Encryption**: [infrastructure/auth/CLAUDE.md](../../infrastructure/auth/CLAUDE.md) (Supabase Vault, token encryption)
- **AI PR Review**: [ai/agents/CLAUDE.md](../../ai/agents/CLAUDE.md) (PRReviewSubagent uses GitHubClient)
- **Webhook router**: `/backend/src/pilot_space/api/v1/routers/webhooks.py`
- **Integration router**: `/backend/src/pilot_space/api/v1/routers/integrations.py`
