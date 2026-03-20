---
phase: 4
slug: ai-governance
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-08
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.3+ with pytest-asyncio 0.24+ |
| **Config file** | `backend/pyproject.toml` (`[tool.pytest.ini_options]`) |
| **Quick run command** | `cd backend && uv run pytest tests/unit/ai/ tests/unit/routers/ -q` |
| **Full suite command** | `cd backend && uv run pytest --cov && cd frontend && pnpm test` |
| **Estimated runtime** | ~60 seconds (backend unit suite) |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && uv run pytest tests/unit/ai/ tests/unit/routers/ -q`
- **After every plan wave:** Run `cd backend && uv run pytest --cov && cd frontend && pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 0 | AIGOV-01 | unit | `pytest tests/unit/ai/infrastructure/test_approval_service.py -x` | ❌ Wave 0 | ⬜ pending |
| 4-01-02 | 01 | 0 | AIGOV-01 | unit | `pytest tests/unit/routers/test_ai_governance.py -x` | ❌ Wave 0 | ⬜ pending |
| 4-01-03 | 01 | 0 | AIGOV-05 | unit | `pytest tests/unit/ai/agents/test_pilotspace_agent.py::test_byok_enforcement -x` | ❌ Wave 0 | ⬜ pending |
| 4-01-04 | 01 | 0 | AIGOV-06 | unit | `pytest tests/unit/ai/infrastructure/test_cost_tracker.py -x` | ❌ Wave 0 | ⬜ pending |
| 4-01-05 | 01 | 0 | AIGOV-03 | unit | `pytest tests/unit/repositories/test_audit_log_repository.py -x` | ❌ Wave 0 | ⬜ pending |
| 4-01-06 | 01 | 0 | AIGOV-06 | unit | `pytest tests/unit/routers/test_ai_costs.py -x` | ❌ Wave 0 | ⬜ pending |
| 4-01-07 | 01 | 0 | AIGOV-04 | unit | `pytest tests/unit/routers/test_ai_governance.py::test_rollback -x` | ❌ Wave 0 | ⬜ pending |
| 4-01-08 | 01 | 0 | AIGOV-02 | unit | `pytest tests/unit/ai/sdk/test_approval_waiter.py -x` | ✅ exists | ⬜ pending |
| 4-02-01 | 02 | 1 | AIGOV-01 | unit | `pytest tests/unit/ai/infrastructure/test_approval_service.py -x` | ❌ Wave 0 | ⬜ pending |
| 4-02-02 | 02 | 1 | AIGOV-05 | unit | `pytest tests/unit/ai/agents/test_pilotspace_agent.py::test_byok_enforcement -x` | ❌ Wave 0 | ⬜ pending |
| 4-02-03 | 02 | 1 | AIGOV-06 | unit | `pytest tests/unit/ai/infrastructure/test_cost_tracker.py -x` | ❌ Wave 0 | ⬜ pending |
| 4-02-04 | 02 | 1 | AIGOV-03 | unit | `pytest tests/unit/repositories/test_audit_log_repository.py -x` | ❌ Wave 0 | ⬜ pending |
| 4-02-05 | 02 | 1 | AIGOV-04 | unit | `pytest tests/unit/routers/test_ai_governance.py::test_rollback -x` | ❌ Wave 0 | ⬜ pending |
| 4-03-01 | 03 | 1 | AIGOV-02 | unit | `pytest tests/unit/routers/test_ai_governance.py::test_approval_list -x` | ❌ Wave 0 | ⬜ pending |
| 4-03-02 | 03 | 1 | AIGOV-01 | manual | Browser smoke test: settings AI policy matrix renders | N/A | ⬜ pending |
| 4-03-03 | 03 | 2 | AIGOV-03 | unit | `pytest tests/unit/routers/test_audit.py -x` | ❌ Wave 0 | ⬜ pending |
| 4-03-04 | 03 | 2 | AIGOV-06 | unit | `pytest tests/unit/routers/test_ai_costs.py -x` | ❌ Wave 0 | ⬜ pending |
| 4-03-05 | 03 | 2 | AIGOV-07 | unit (vitest) | `cd frontend && pnpm test -- ExtractionReviewPanel` | ✅ exists (extend) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/ai/infrastructure/test_approval_service.py` — covers AIGOV-01 (policy lookup + role check)
- [ ] `tests/unit/routers/test_ai_governance.py` — covers AIGOV-01 policy CRUD, AIGOV-02 approval page, AIGOV-04 rollback, AIGOV-05 ai-status
- [ ] `tests/unit/repositories/test_audit_log_repository.py` — covers AIGOV-03 actor_type filter
- [ ] `tests/unit/routers/test_audit.py` — covers actor_type query param passthrough
- [ ] `tests/unit/ai/infrastructure/test_cost_tracker.py` — covers AIGOV-06 operation_type tracking
- [ ] `tests/unit/routers/test_ai_costs.py` — covers group_by=operation_type filter
- [ ] `tests/unit/ai/agents/test_pilotspace_agent.py` — covers AIGOV-05 BYOK enforcement (missing env key path)
- [ ] `tests/unit/infrastructure/models/test_workspace_ai_policy.py` — model + unique constraint

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| AI policy matrix UI renders correct toggles per role + action_type | AIGOV-01 | Complex UI interaction matrix; vitest can't fully simulate MobX observer + shadcn dropdown combos | Navigate to Settings > AI → verify each role column has correct auto/require/disable toggle per action type |
| Approval queue page shows pending requests with approve/reject buttons | AIGOV-02 | SSE-driven real-time updates need browser | Trigger AI action requiring approval; open /approvals page; verify card appears; approve; verify action executes |
| Rollback button on audit trail entry restores artifact | AIGOV-04 | Requires live DB state before/after | Create issue via AI; open audit trail; click rollback; verify issue fields restored to pre-AI snapshot |
| BYOK disabled state shows clear message across all AI features | AIGOV-05 | Multiple UI surfaces to check | Remove workspace API key; try ghost text, issue extraction, PR review; verify all show "AI not configured" message |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
