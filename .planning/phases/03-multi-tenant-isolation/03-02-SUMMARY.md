---
phase: 03-multi-tenant-isolation
plan: 02
subsystem: backend-encryption
tags: [byok, encryption, fernet, workspace, api, rls, migration]
requirements: [TENANT-02]

dependency_graph:
  requires:
    - 03-01  # RLS enum fix (UPPERCASE roles required for correct permission checks)
  provides:
    - workspace-byok-encryption  # WorkspaceEncryptionKey model + helpers + API
  affects:
    - 03-05  # Settings UI for encryption will use these endpoints

tech_stack:
  added:
    - cryptography.fernet (already installed, now used for workspace-level encryption)
  patterns:
    - Envelope encryption: workspace key encrypted by master Fernet key before DB storage
    - Opt-in encryption: get_workspace_content_key() returns None for plaintext mode
    - Custom RLS: service_role bypass only, no user-facing SELECT on encryption key table

key_files:
  created:
    - backend/alembic/versions/067_workspace_encryption_and_quota.py
    - backend/src/pilot_space/infrastructure/database/models/workspace_encryption_key.py
    - backend/src/pilot_space/infrastructure/workspace_encryption.py
    - backend/src/pilot_space/api/v1/routers/workspace_encryption.py
    - backend/src/pilot_space/infrastructure/database/repositories/workspace_encryption_repository.py
    - backend/tests/unit/test_workspace_encryption.py (replaced xfail stubs)
    - backend/tests/routers/test_workspace_encryption.py (replaced xfail stubs)
  modified:
    - backend/src/pilot_space/infrastructure/database/models/workspace.py (added encryption_key relationship)
    - backend/src/pilot_space/infrastructure/database/models/__init__.py (added WorkspaceEncryptionKey export)
    - backend/src/pilot_space/api/v1/routers/__init__.py (added workspace_encryption_router)
    - backend/src/pilot_space/main.py (registered workspace_encryption_router)

decisions:
  - Encryption is opt-in: workspaces without configured key remain in plaintext mode — get_workspace_content_key() returns None; callers check before encrypting
  - No user SELECT policy on workspace_encryption_keys: encrypted key must never reach frontend; service_role-only via RLS
  - key_hint = last 8 chars of raw key: non-sensitive identifier for UI to show which key is active
  - PUT /key validates format before auth check: cheap operation, fail-fast before DB round-trip
  - Repository pattern (not DI-injected): follows sessions/SCIM pattern for new Phase 3 services

metrics:
  duration_minutes: 20
  completed_date: "2026-03-08"
  tasks_completed: 2
  files_created: 7
  files_modified: 4
---

# Phase 03 Plan 02: Workspace BYOK Encryption Summary

Implemented workspace-level bring-your-own-key encryption using Fernet envelope encryption. Workspaces can optionally configure a 32-byte URL-safe base64 Fernet key; content fields (notes.body, issues.description) can then be encrypted at the storage layer.

## What Was Built

**Migration 067** (`067_workspace_encryption_and_quota.py`):
- `workspace_encryption_keys` table with custom RLS: service_role bypass only, NO user-facing SELECT policy (encrypted key never reaches client)
- Four quota columns added to `workspaces`: `rate_limit_standard_rpm`, `rate_limit_ai_rpm`, `storage_quota_mb`, `storage_used_bytes`

**WorkspaceEncryptionKey model** (`models/workspace_encryption_key.py`):
- One record per workspace (UNIQUE on workspace_id)
- `encrypted_workspace_key`: master-key-wrapped Fernet key
- `key_hint`: last 8 chars of raw key for UI identification
- `key_version`: increments on each rotation

**Encryption helpers** (`infrastructure/workspace_encryption.py`):
- `validate_workspace_key(raw_key)` — raises ValueError for non-Fernet keys
- `store_workspace_key(raw_key)` — encrypts with master Fernet key for DB storage
- `retrieve_workspace_key(ciphertext)` — decrypts from DB
- `encrypt_content(plaintext, workspace_key)` / `decrypt_content(ciphertext, workspace_key)` — field-level encryption
- `get_workspace_content_key(session, workspace_id)` — returns None if no key configured (opt-in plaintext mode)

**API endpoints** (`routers/workspace_encryption.py`):
- `GET /{slug}/encryption/` — status (enabled, key_hint, key_version, last_rotated), requires ADMIN+OWNER
- `PUT /{slug}/encryption/key` — store/rotate key (OWNER only), 422 on invalid Fernet format
- `POST /{slug}/encryption/verify` — verify key matches stored, 422 on mismatch, 404 if no key
- `POST /{slug}/encryption/generate-key` — generate valid Fernet key (not stored)

## Test Coverage

- 4 unit tests (helpers round-trip, validation, None-on-no-key) + 1 remaining xfail (key rotation — future plan)
- 11 router tests covering all endpoints: success paths, 422 validation, 403 permission, 404 not-found, key non-exposure

## Decisions Made

- **Opt-in encryption**: `get_workspace_content_key()` returns `None` for unconfigured workspaces; callers check before encrypting/decrypting. Zero migration of existing data required.
- **No user SELECT on `workspace_encryption_keys`**: RLS intentionally omits any user-facing SELECT policy. The encrypted key must never reach the client even via API introspection.
- **key_hint = last 8 chars**: Non-sensitive; helps UI show which key is currently active without storing plaintext.
- **Format validation before auth check in PUT /key**: Validates Fernet format before workspace resolution and permission check — cheap fail-fast reduces unnecessary DB queries.
- **Repository instantiated directly**: Follows SCIM/sessions pattern (not DI-injected) for new Phase 3 services to avoid container wiring complexity.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Auto-add] Added `workspace.encryption_key` relationship**
- **Found during:** Task 1 model creation
- **Issue:** `WorkspaceEncryptionKey.workspace` relationship `back_populates="encryption_key"` required the inverse relationship on `Workspace`
- **Fix:** Added `encryption_key: Mapped[WorkspaceEncryptionKey | None]` uselist=False relationship to `workspace.py`
- **Files modified:** `backend/src/pilot_space/infrastructure/database/models/workspace.py`
- **Commit:** ddc800ac

**2. [Rule 1 - Bug] Fixed pytest PT011 (too-broad raises)**
- **Found during:** Task 1 pre-commit hook
- **Issue:** `pytest.raises(ValueError)` without `match` parameter flagged by ruff PT011
- **Fix:** Added `match="32-byte"` to the empty-string test case in `test_workspace_encryption.py`
- **Files modified:** `backend/tests/unit/test_workspace_encryption.py`
- **Commit:** ddc800ac

**3. [Rule 2 - Auto-add] Used mock session instead of `db_session` for `get_workspace_content_key` unit test**
- **Found during:** Task 1 test validation
- **Issue:** `db_session` fixture uses SQLite which fails on JSONB-typed columns in other models; `Base.metadata.create_all` blows up
- **Fix:** Replaced `db_session` fixture with `AsyncMock` session that returns `scalar_one_or_none() = None`; tests the None-path without DB
- **Files modified:** `backend/tests/unit/test_workspace_encryption.py`
- **Commit:** ddc800ac

**4. [Rule 1 - Bug] Fixed router mounting strategy**
- **Found during:** Task 2 router registration
- **Issue:** Plan suggested `prefix="/api/v1/workspaces/{workspace_slug}/encryption"` but FastAPI doesn't support path params in `include_router` prefix
- **Fix:** Mounted with `prefix=f"{API_V1_PREFIX}/workspaces"` and defined full paths in router (`/{workspace_slug}/encryption/`, `/{workspace_slug}/encryption/key`, etc.)
- **Files modified:** `backend/src/pilot_space/main.py`, `backend/src/pilot_space/api/v1/routers/workspace_encryption.py`
- **Commit:** ea95a8de

## Self-Check

Verifying claimed files exist:

All 7 created files confirmed present on disk.
Both task commits confirmed in git log (ddc800ac, ea95a8de).

## Self-Check: PASSED
