---
phase: 8
slug: fix-sso-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest + pytest-asyncio (backend), Vitest (frontend) |
| **Config file** | backend/pyproject.toml, frontend/vitest.config.ts |
| **Quick run command** | `cd backend && uv run pytest tests/unit/routers/test_auth_sso.py tests/unit/services/test_sso_service.py -q` |
| **Full suite command** | `cd backend && uv run pytest tests/unit/ -q && cd ../frontend && pnpm test -- --run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && uv run pytest tests/unit/routers/test_auth_sso.py tests/unit/services/test_sso_service.py -q`
- **After every plan wave:** Run `cd backend && uv run pytest tests/unit/ -q && cd ../frontend && pnpm test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 0 | AUTH-01/02/03/04 | unit | `pytest tests/unit/routers/test_auth_sso.py -k "slug"` | ❌ W0 | ⬜ pending |
| 08-01-02 | 01 | 1 | AUTH-01 | unit | `pytest tests/unit/routers/test_auth_sso.py -k "saml_config"` | ✅ extend | ⬜ pending |
| 08-01-03 | 01 | 1 | AUTH-02 | unit | `pytest tests/unit/routers/test_auth_sso.py -k "oidc_slug"` | ❌ W0 | ⬜ pending |
| 08-01-04 | 01 | 1 | AUTH-04 | unit | `pytest tests/unit/routers/test_auth_sso.py -k "enforcement_slug"` | ❌ W0 | ⬜ pending |
| 08-01-05 | 01 | 2 | AUTH-03 | unit | `pytest tests/unit/services/test_sso_service.py -k "provision"` | ✅ extend | ⬜ pending |
| 08-01-06 | 01 | 2 | AUTH-01 | unit | `pytest tests/unit/routers/test_auth_sso.py -k "callback_redirect"` | ❌ W0 | ⬜ pending |
| 08-01-07 | 01 | 3 | AUTH-01/03 | unit | `cd frontend && pnpm test -- --run src/app/\(auth\)/saml-callback` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/tests/unit/routers/test_auth_sso.py` — extend with slug-based endpoint tests (configure_saml with slug, configure_oidc with slug, enforcement with slug, callback redirect)
- [ ] `backend/tests/unit/services/test_sso_service.py` — extend with `provision_saml_user` calling `generate_link` mock
- [ ] `frontend/src/app/(auth)/saml-callback/page.tsx` — new page (test file needed alongside)
- [ ] Verify `backend/src/pilot_space/config.py` has `frontend_url` field (or add it)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SAML browser redirect flow | AUTH-01/03 | Requires real Supabase admin API + IdP SAML response | Use `agent-browser` to initiate SAML login, confirm redirect to `/auth/saml-callback?token_hash=...`, confirm session created |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
