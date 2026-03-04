## Summary

<!-- 1-3 bullet points describing what changed and why -->

-
-

## Type of Change

- [ ] `feat` — new feature
- [ ] `fix` — bug fix
- [ ] `refactor` — code restructure, no behavior change
- [ ] `perf` — performance improvement
- [ ] `test` — test-only changes
- [ ] `chore` — tooling, config, dependencies
- [ ] `docs` — documentation only

## Related Issues / Specs

<!-- e.g. Closes #42, refs US-17 -->

## Quality Gates

- [ ] `uv run ruff check && uv run pyright && uv run pytest --cov=.` — all pass (backend)
- [ ] `pnpm lint && pnpm type-check && pnpm test` — all pass (frontend)
- [ ] New code has unit tests; coverage stays > 80%
- [ ] No file exceeds 700 lines

## Security Checklist

- [ ] RLS policies use `current_setting('app.current_user_id', true)::uuid` (not `auth.uid()`)
- [ ] Every endpoint calls `set_rls_context()` before the first DB query
- [ ] No cross-workspace data leak (ownership check on every resource)
- [ ] No N+1 queries (explicit `selectinload` / `joinedload` where needed)
- [ ] Destructive actions go through `ApprovalWorkflow` (DD-003)

## Schema / Migration

- [ ] No breaking schema changes (additive only), or migration + backfill provided
- [ ] Alembic migration chain is correct (`down_revision` points to previous head)
- [ ] API contract aligned: BE `BaseSchema` camelCase aliases match FE TypeScript interfaces

## Notes for Reviewers

<!-- Anything that needs extra attention, known trade-offs, or follow-up tasks -->
