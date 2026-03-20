---
phase: quick-260317-hms
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/src/pilot_space/ai/providers/provider_selector.py
  - backend/src/pilot_space/application/services/extraction/extract_issues_service.py
  - backend/src/pilot_space/application/services/intent/detection_service.py
  - backend/src/pilot_space/application/services/role_skill/generate_role_skill_service.py
  - backend/tests/unit/ai/test_provider_selector.py
  - backend/tests/unit/services/test_workspace_provider_resolution.py
autonomous: true
requirements: [PROV-MIGRATE-01]

must_haves:
  truths:
    - "All AI services (extraction, intent, skill generation) use the workspace-configured LLM provider, model, and base_url instead of hardcoded Anthropic defaults"
    - "When workspace has no LLM provider configured, services fall back to ProviderSelector static routing table (backward compatible)"
    - "ProviderSelector accepts an optional workspace_override that replaces the static model for a given TaskType while preserving circuit breaker and fallback logic"
    - "Services no longer duplicate workspace key+provider resolution logic; shared helper encapsulates the pattern"
  artifacts:
    - path: "backend/src/pilot_space/ai/providers/provider_selector.py"
      provides: "Workspace-aware ProviderSelector with workspace_override parameter"
      exports: ["ProviderSelector", "ProviderConfig", "TaskType", "Provider", "resolve_workspace_llm_config"]
    - path: "backend/src/pilot_space/application/services/extraction/extract_issues_service.py"
      provides: "ExtractIssuesService using workspace provider config"
      contains: "resolve_workspace_llm_config"
    - path: "backend/src/pilot_space/application/services/intent/detection_service.py"
      provides: "IntentDetectionService using workspace provider config"
      contains: "resolve_workspace_llm_config"
    - path: "backend/src/pilot_space/application/services/role_skill/generate_role_skill_service.py"
      provides: "GenerateRoleSkillService using shared resolution helper"
      contains: "resolve_workspace_llm_config"
    - path: "backend/tests/unit/ai/test_provider_selector.py"
      provides: "Tests for workspace_override parameter"
    - path: "backend/tests/unit/services/test_workspace_provider_resolution.py"
      provides: "Tests for resolve_workspace_llm_config helper and service integration"
  key_links:
    - from: "backend/src/pilot_space/application/services/extraction/extract_issues_service.py"
      to: "backend/src/pilot_space/ai/providers/provider_selector.py"
      via: "resolve_workspace_llm_config + select_with_config"
      pattern: "resolve_workspace_llm_config|select_with_config"
    - from: "backend/src/pilot_space/application/services/intent/detection_service.py"
      to: "backend/src/pilot_space/ai/providers/provider_selector.py"
      via: "resolve_workspace_llm_config + select_with_config"
      pattern: "resolve_workspace_llm_config|select_with_config"
    - from: "backend/src/pilot_space/application/services/role_skill/generate_role_skill_service.py"
      to: "backend/src/pilot_space/ai/providers/provider_selector.py"
      via: "resolve_workspace_llm_config replaces inline _resolve_llm_provider"
      pattern: "resolve_workspace_llm_config"
---

<objective>
Unify all AI services to use workspace-level LLM provider configuration instead of hardcoded Anthropic defaults.

Purpose: Currently, 3 services (`ExtractIssuesService`, `IntentDetectionService`, `GenerateRoleSkillService`) create inline `ProviderSelector()` instances with hardcoded model references and duplicate workspace key resolution logic. `PilotSpaceAgent` already resolves workspace config correctly. This plan extracts a shared workspace resolution helper and makes all services workspace-aware, so admins' provider choices (Anthropic, Ollama, etc.) are respected across ALL AI operations — not just the chat agent.

Output: Refactored backend services using workspace-configured providers with shared resolution logic, backward-compatible fallback to static routing table, and comprehensive tests.
</objective>

<execution_context>
@/Users/tindang/workspaces/tind-repo/pilot-space/.claude/get-shit-done/workflows/execute-plan.md
@/Users/tindang/workspaces/tind-repo/pilot-space/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@backend/src/pilot_space/ai/providers/provider_selector.py
@backend/src/pilot_space/application/services/extraction/extract_issues_service.py
@backend/src/pilot_space/application/services/intent/detection_service.py
@backend/src/pilot_space/application/services/role_skill/generate_role_skill_service.py
@backend/src/pilot_space/ai/agents/pilotspace_agent.py
@backend/src/pilot_space/ai/providers/constants.py
@backend/tests/unit/ai/test_provider_selector.py

<interfaces>
<!-- Key types and contracts the executor needs -->

From backend/src/pilot_space/ai/providers/provider_selector.py:
```python
class Provider(Enum):
    ANTHROPIC = "anthropic"
    OPENAI = "openai"
    GOOGLE = "google"

class TaskType(Enum):
    # 18 task types covering code-intensive, standard, latency-sensitive, embeddings
    PR_REVIEW = "pr_review"
    ISSUE_EXTRACTION = "issue_extraction"
    TEMPLATE_FILLING = "template_filling"
    GHOST_TEXT = "ghost_text"
    EMBEDDINGS = "embeddings"
    # ... (see full enum in source)

@dataclass(frozen=True, slots=True, kw_only=True)
class ProviderConfig:
    provider: str
    model: str
    reason: str
    fallback_provider: str | None = None
    fallback_model: str | None = None

class ProviderSelector:
    ANTHROPIC_OPUS: Final[str] = "claude-opus-4-5"
    ANTHROPIC_SONNET: Final[str] = "claude-sonnet-4"
    ANTHROPIC_HAIKU: Final[str] = "claude-3-5-haiku-20241022"
    # select(task_type, user_override?) -> (provider, model)
    # select_with_config(task_type, user_override?) -> ProviderConfig
```

From backend/src/pilot_space/ai/infrastructure/key_storage.py (TYPE_CHECKING):
```python
class SecureKeyStorage:
    async def get_key_info(workspace_id, provider, service_type) -> KeyInfo | None
    async def get_api_key(workspace_id, provider, service_type) -> str | None
    async def get_all_key_infos(workspace_id) -> list[KeyInfo]
```

From backend/src/pilot_space/ai/agents/pilotspace_agent.py (existing pattern):
```python
@dataclass(frozen=True, slots=True)
class _ProviderConfig:
    api_key: str
    base_url: str | None = None
    model_name: str | None = None
    provider: str = "anthropic"
```
The `_resolve_workspace_provider` method in PilotSpaceAgent reads `workspace.settings.default_llm_provider`,
then fetches from SecureKeyStorage. This is the CORRECT pattern to replicate.

From GenerateRoleSkillService._resolve_llm_provider (existing inline resolution):
```python
async def _resolve_llm_provider(workspace_id) -> tuple[str, str, str | None, str | None] | None:
    # Returns (provider, api_key, base_url, model_name) or None
    # Reads workspace.settings.default_llm_provider -> SecureKeyStorage
    # Falls back to any configured LLM -> app-level ANTHROPIC_API_KEY
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extract shared workspace LLM resolution helper and make ProviderSelector workspace-aware</name>
  <files>
    backend/src/pilot_space/ai/providers/provider_selector.py
    backend/tests/unit/ai/test_provider_selector.py
    backend/tests/unit/services/test_workspace_provider_resolution.py
  </files>
  <behavior>
    - Test: resolve_workspace_llm_config returns (provider, api_key, base_url, model_name) when workspace has LLM config in SecureKeyStorage
    - Test: resolve_workspace_llm_config returns None when workspace has no config (no key_info found)
    - Test: resolve_workspace_llm_config falls back to any configured LLM provider when default_llm_provider has no key
    - Test: resolve_workspace_llm_config falls back to app-level ANTHROPIC_API_KEY as last resort
    - Test: resolve_workspace_llm_config returns None when no config found anywhere
    - Test: ProviderSelector.select_with_config with workspace_override replaces the static model but preserves circuit breaker logic
    - Test: ProviderSelector.select_with_config without workspace_override returns static routing table defaults (backward compat)
    - Test: workspace_override with base_url is included in returned ProviderConfig
  </behavior>
  <action>
1. Add `resolve_workspace_llm_config` async function to `provider_selector.py` that extracts the duplicated pattern from `GenerateRoleSkillService._resolve_llm_provider`, `ExtractIssuesService._resolve_api_key`, and `IntentDetectionService._resolve_api_key`. Signature:

```python
@dataclass(frozen=True, slots=True)
class WorkspaceLLMConfig:
    provider: str
    api_key: str
    base_url: str | None = None
    model_name: str | None = None

async def resolve_workspace_llm_config(
    session: AsyncSession,
    workspace_id: UUID | None,
) -> WorkspaceLLMConfig | None:
```

Resolution priority (matching existing `_resolve_llm_provider` in GenerateRoleSkillService):
  a) Read `workspace.settings.default_llm_provider` from DB
  b) Fetch key_info from SecureKeyStorage for that provider + "llm"
  c) If not found, try any LLM provider via `get_all_key_infos`
  d) If nothing in workspace, try app-level `ANTHROPIC_API_KEY`
  e) Return None if nothing found

2. Add `workspace_override` parameter to `ProviderSelector.select_with_config`:

```python
def select_with_config(
    self,
    task_type: TaskType,
    user_override: tuple[str, str] | None = None,
    workspace_override: WorkspaceLLMConfig | None = None,
) -> ProviderConfig:
```

When `workspace_override` is provided and `workspace_override.model_name` is set, use that model instead of the static routing table model. When `workspace_override.model_name` is None, fall back to static table. The `provider` and `base_url` from workspace_override should be reflected in the returned ProviderConfig. Circuit breaker health checks still apply.

3. Extend `ProviderConfig` with an optional `base_url: str | None = None` field so callers can pass workspace base_url through the config chain.

4. Update existing tests in `test_provider_selector.py` to accommodate the new `base_url` field on ProviderConfig (should be backward compatible since it defaults to None).

5. Create `test_workspace_provider_resolution.py` with tests for `resolve_workspace_llm_config` using mocked AsyncSession and SecureKeyStorage.

6. Export `WorkspaceLLMConfig` and `resolve_workspace_llm_config` from `provider_selector.py` and `__init__.py`.

IMPORTANT: Do NOT change `ProviderSelector.select()` signature — only `select_with_config()` gets the new parameter. `select()` delegates to `select_with_config()` and continues to return just `(provider, model)`.
  </action>
  <verify>
    <automated>cd /Users/tindang/workspaces/tind-repo/pilot-space/backend && uv run pytest tests/unit/ai/test_provider_selector.py tests/unit/services/test_workspace_provider_resolution.py -x -q</automated>
  </verify>
  <done>
    - resolve_workspace_llm_config function exists and encapsulates workspace LLM resolution with 4-step fallback
    - ProviderSelector.select_with_config accepts workspace_override parameter
    - ProviderConfig has base_url field
    - All existing ProviderSelector tests pass (backward compatible)
    - New tests cover workspace resolution and workspace_override behavior
  </done>
</task>

<task type="auto">
  <name>Task 2: Migrate 3 services to use shared workspace resolution and workspace-aware ProviderSelector</name>
  <files>
    backend/src/pilot_space/application/services/extraction/extract_issues_service.py
    backend/src/pilot_space/application/services/intent/detection_service.py
    backend/src/pilot_space/application/services/role_skill/generate_role_skill_service.py
  </files>
  <action>
Refactor each service to use `resolve_workspace_llm_config` and pass workspace config through `ProviderSelector.select_with_config`:

**ExtractIssuesService (`extract_issues_service.py`):**
1. Delete `_resolve_api_key` method (replaced by shared helper)
2. In `_call_llm`, replace:
   ```python
   api_key = await self._resolve_api_key(payload.workspace_id)
   selector = ProviderSelector()
   config = selector.select_with_config(TaskType.ISSUE_EXTRACTION)
   model = config.model
   # ...
   client = AsyncAnthropic(api_key=api_key)
   ```
   With:
   ```python
   from pilot_space.ai.providers.provider_selector import resolve_workspace_llm_config, WorkspaceLLMConfig
   ws_config = await resolve_workspace_llm_config(self._session, payload.workspace_id)
   if ws_config is None:
       logger.info("No LLM provider configured for issue extraction")
       return [], "noop"
   selector = ProviderSelector()
   config = selector.select_with_config(TaskType.ISSUE_EXTRACTION, workspace_override=ws_config)
   model = config.model
   # ...
   client = AsyncAnthropic(api_key=ws_config.api_key, base_url=ws_config.base_url or None)
   ```
   Also set `timeout_sec = 90.0 if ws_config.provider == "ollama" else 60.0` (matching GenerateRoleSkillService pattern for cloud-proxied Ollama models).

**IntentDetectionService (`detection_service.py`):**
1. Delete `_resolve_api_key` method
2. In `_call_llm`, replace the same pattern as ExtractIssuesService above. Use `TaskType.ISSUE_EXTRACTION` (already used). Pass `ws_config.base_url` to `AsyncAnthropic`. Set Ollama timeout = 90s.

**GenerateRoleSkillService (`generate_role_skill_service.py`):**
1. Delete `_resolve_llm_provider` method (it's now the shared `resolve_workspace_llm_config`)
2. In `_try_generate_via_ai`, replace:
   ```python
   provider_info = await self._resolve_llm_provider(workspace_id)
   if provider_info is None: return None
   provider, api_key, base_url, model_name = provider_info
   # ...
   if model_name:
       model = model_name
   else:
       selector = ProviderSelector()
       config = selector.select_with_config(TaskType.TEMPLATE_FILLING)
       model = config.model
   ```
   With:
   ```python
   ws_config = await resolve_workspace_llm_config(self._session, workspace_id)
   if ws_config is None:
       logger.info("No LLM provider configured, using template fallback")
       return None
   selector = ProviderSelector()
   config = selector.select_with_config(TaskType.TEMPLATE_FILLING, workspace_override=ws_config)
   model = config.model
   api_key = ws_config.api_key
   base_url = ws_config.base_url
   provider = ws_config.provider
   ```

For all 3 services: keep `from anthropic import AsyncAnthropic` as the client — all supported LLM providers (Anthropic, Ollama, Kimi/GLM) use the Anthropic API format. The `base_url` parameter handles routing to non-Anthropic servers.
  </action>
  <verify>
    <automated>cd /Users/tindang/workspaces/tind-repo/pilot-space/backend && uv run pytest tests/unit/ -x -q --timeout=30 2>&1 | tail -20</automated>
  </verify>
  <done>
    - ExtractIssuesService no longer has _resolve_api_key; uses resolve_workspace_llm_config + workspace_override
    - IntentDetectionService no longer has _resolve_api_key; uses resolve_workspace_llm_config + workspace_override
    - GenerateRoleSkillService no longer has _resolve_llm_provider; uses resolve_workspace_llm_config + workspace_override
    - All 3 services pass workspace base_url to AsyncAnthropic client
    - All 3 services respect workspace model_name when configured
    - All existing unit tests pass
  </done>
</task>

<task type="auto">
  <name>Task 3: Run quality gates and verify no regressions</name>
  <files>
    backend/src/pilot_space/ai/providers/__init__.py
  </files>
  <action>
1. Update `backend/src/pilot_space/ai/providers/__init__.py` to export `WorkspaceLLMConfig` and `resolve_workspace_llm_config` from the `provider_selector` module.

2. Run backend quality gates: `make quality-gates-backend` (pyright + ruff + pytest --cov). Fix any type errors, lint issues, or test failures.

3. Verify the `__all__` export list in `provider_selector.py` includes the new symbols.

4. If ruff or pyright surface issues (unused imports from deleted methods, missing type annotations), fix them.
  </action>
  <verify>
    <automated>cd /Users/tindang/workspaces/tind-repo/pilot-space && make quality-gates-backend 2>&1 | tail -30</automated>
  </verify>
  <done>
    - pyright passes with no new errors
    - ruff check passes with no warnings
    - pytest passes with coverage >= 80%
    - All new exports available from pilot_space.ai.providers
  </done>
</task>

</tasks>

<verification>
1. `cd backend && uv run pytest tests/unit/ai/test_provider_selector.py -x -q` — all provider selector tests pass including new workspace_override tests
2. `cd backend && uv run pytest tests/unit/services/test_workspace_provider_resolution.py -x -q` — shared resolution helper tests pass
3. `cd backend && uv run pytest tests/unit/ -x -q` — no regressions across all unit tests
4. `cd backend && uv run pyright` — no type errors
5. `cd backend && uv run ruff check` — no lint warnings
6. Grep confirms no remaining inline `ProviderSelector()` in the 3 service files that bypasses workspace config:
   `grep -n "ProviderSelector()" backend/src/pilot_space/application/services/extraction/extract_issues_service.py backend/src/pilot_space/application/services/intent/detection_service.py backend/src/pilot_space/application/services/role_skill/generate_role_skill_service.py` should show usage only with workspace_override parameter
</verification>

<success_criteria>
- All 3 services (ExtractIssuesService, IntentDetectionService, GenerateRoleSkillService) use workspace-configured provider, model, base_url, and API key
- No duplicated workspace key resolution logic across services
- Backward compatible: services fall back to static routing table when no workspace config exists
- All quality gates pass (pyright + ruff + pytest >= 80% coverage)
- ProviderSelector API is backward compatible (existing callers without workspace_override unchanged)
</success_criteria>

<output>
After completion, create `.planning/quick/260317-hms-migrate-provider-settings-to-workspace-l/260317-hms-SUMMARY.md`
</output>
