"""Proxy routing audit: all 5 LLM call paths route through the built-in proxy.

When ai_proxy_enabled=True, every LLM call path MUST:
1. Check ai_proxy_enabled setting
2. Override base_url (or ANTHROPIC_BASE_URL env) to ai_proxy_base_url
3. Skip local cost tracking (proxy handles centralized cost tracking)

This test file acts as a regression safety net. If anyone adds a new LLM call
path that bypasses the proxy, or removes the proxy routing from an existing
path, these tests fail.

Paths audited:
  1. PilotSpaceAgent          — ANTHROPIC_BASE_URL env override
  2. LLMGateway.complete()    — base_url override + proxy headers
  3. LLMGateway.embed()       — base_url override + proxy headers
  4. GhostTextService         — base_url override via client pool
  5. PRReviewSubagent         — build_sdk_env(base_url=...) + SDK env
  6. DocGeneratorSubagent     — build_sdk_env(base_url=...) + SDK env

See also: test_no_direct_calls.py (guards against direct SDK use in services/jobs)
"""

from __future__ import annotations

import re
from pathlib import Path

# ---------------------------------------------------------------------------
# Shared paths
# ---------------------------------------------------------------------------

BACKEND_SRC = Path(__file__).resolve().parents[3] / "src" / "pilot_space"
AI_DIR = BACKEND_SRC / "ai"

# Canonical source files for each LLM call path
_PILOTSPACE_AGENT = AI_DIR / "agents" / "pilotspace_agent.py"
_LLM_GATEWAY = AI_DIR / "proxy" / "llm_gateway.py"
_GHOST_TEXT = AI_DIR / "services" / "ghost_text.py"
_PR_REVIEW = AI_DIR / "agents" / "subagents" / "pr_review_subagent.py"
_DOC_GENERATOR = AI_DIR / "agents" / "subagents" / "doc_generator_subagent.py"

_ALL_PATHS: dict[str, Path] = {
    "PilotSpaceAgent": _PILOTSPACE_AGENT,
    "LLMGateway": _LLM_GATEWAY,
    "GhostTextService": _GHOST_TEXT,
    "PRReviewSubagent": _PR_REVIEW,
    "DocGeneratorSubagent": _DOC_GENERATOR,
}


# ===================================================================
# Category 1: Source code audit — every LLM path checks ai_proxy_enabled
# ===================================================================


class TestProxyEnabledChecks:
    """Each LLM call path must contain the ai_proxy_enabled guard."""

    def test_llm_gateway_complete_has_proxy_check(self) -> None:
        """LLMGateway.complete() must check ai_proxy_enabled."""
        source = _LLM_GATEWAY.read_text(encoding="utf-8")
        assert "ai_proxy_enabled" in source, (
            "LLMGateway missing ai_proxy_enabled check"
        )
        assert "ai_proxy_base_url" in source, (
            "LLMGateway missing ai_proxy_base_url usage"
        )

    def test_llm_gateway_embed_has_proxy_check(self) -> None:
        """LLMGateway.embed() must check ai_proxy_enabled."""
        source = _LLM_GATEWAY.read_text(encoding="utf-8")
        # The embed method must have its own proxy routing block
        # Find the embed method and verify it has its own ai_proxy_enabled check
        embed_match = re.search(
            r"async def embed\b.*?(?=\n    async def |\nclass |\Z)",
            source,
            re.DOTALL,
        )
        assert embed_match is not None, "LLMGateway.embed() method not found"
        embed_source = embed_match.group()
        assert "ai_proxy_enabled" in embed_source, (
            "LLMGateway.embed() missing its own ai_proxy_enabled check"
        )
        assert "ai_proxy_base_url" in embed_source, (
            "LLMGateway.embed() missing ai_proxy_base_url usage"
        )

    def test_ghost_text_has_proxy_check(self) -> None:
        """GhostTextService.generate_completion() must check ai_proxy_enabled."""
        source = _GHOST_TEXT.read_text(encoding="utf-8")
        assert "ai_proxy_enabled" in source, (
            "GhostTextService missing ai_proxy_enabled check"
        )
        assert "ai_proxy_base_url" in source, (
            "GhostTextService missing ai_proxy_base_url usage"
        )

    def test_pr_review_subagent_has_proxy_check(self) -> None:
        """PRReviewSubagent must check ai_proxy_enabled."""
        source = _PR_REVIEW.read_text(encoding="utf-8")
        assert "ai_proxy_enabled" in source, (
            "PRReviewSubagent missing ai_proxy_enabled check"
        )
        assert "ai_proxy_base_url" in source, (
            "PRReviewSubagent missing ai_proxy_base_url usage"
        )

    def test_doc_generator_subagent_has_proxy_check(self) -> None:
        """DocGeneratorSubagent must check ai_proxy_enabled."""
        source = _DOC_GENERATOR.read_text(encoding="utf-8")
        assert "ai_proxy_enabled" in source, (
            "DocGeneratorSubagent missing ai_proxy_enabled check"
        )
        assert "ai_proxy_base_url" in source, (
            "DocGeneratorSubagent missing ai_proxy_base_url usage"
        )

    def test_pilotspace_agent_has_proxy_check(self) -> None:
        """PilotSpaceAgent must check ai_proxy_enabled."""
        source = _PILOTSPACE_AGENT.read_text(encoding="utf-8")
        assert "ai_proxy_enabled" in source, (
            "PilotSpaceAgent missing ai_proxy_enabled check"
        )
        assert "ANTHROPIC_BASE_URL" in source, (
            "PilotSpaceAgent missing ANTHROPIC_BASE_URL env override"
        )

    def test_all_paths_route_through_proxy(self) -> None:
        """Composite check: ALL 5 LLM call path files have proxy routing."""
        missing: list[str] = []
        for name, path in _ALL_PATHS.items():
            source = path.read_text(encoding="utf-8")
            if "ai_proxy_enabled" not in source:
                missing.append(name)
        assert not missing, (
            f"{len(missing)} LLM call path(s) missing ai_proxy_enabled: "
            + ", ".join(missing)
        )


# ===================================================================
# Category 2: No-bypass audit — no unguarded direct SDK client creation
# ===================================================================

# Files that legitimately create SDK clients without ai_proxy_enabled guard:
# - proxy/app.py: IS the proxy itself (creates clients to forward requests)
# - infrastructure/anthropic_client_pool.py: pool factory (callers set base_url)
# - infrastructure/key_storage.py: key validation only, not LLM calls
# - ocr/claude_vision_adapter.py: OCR adapter, not in main LLM path
# - ocr/gpt4o_vision_adapter.py: OCR adapter, not in main LLM path
# - providers/model_listing.py: model list fetching, not LLM calls
# - api/v1/routers/ai_proxy.py: backward-compat shim for the proxy

_ALLOWED_UNGUARDED_FILES = frozenset(
    {
        "proxy/app.py",
        "infrastructure/anthropic_client_pool.py",
        "infrastructure/key_storage.py",
        "ocr/claude_vision_adapter.py",
        "ocr/gpt4o_vision_adapter.py",
        "providers/model_listing.py",
    }
)

_ANTHROPIC_PATTERN = re.compile(r"AsyncAnthropic\(")
_OPENAI_PATTERN = re.compile(r"AsyncOpenAI\(")


class TestNoBypassAudit:
    """Verify no AI file creates SDK clients without proxy guard."""

    def test_no_unguarded_direct_anthropic_clients(self) -> None:
        """Every file creating AsyncAnthropic must have ai_proxy_enabled guard."""
        unguarded: list[str] = []
        for py_file in AI_DIR.rglob("*.py"):
            if py_file.name.startswith("test_"):
                continue
            source = py_file.read_text(encoding="utf-8")
            if not _ANTHROPIC_PATTERN.search(source):
                continue
            if "ai_proxy_enabled" in source:
                continue
            rel = str(py_file.relative_to(AI_DIR))
            if rel in _ALLOWED_UNGUARDED_FILES:
                continue
            unguarded.append(rel)
        assert not unguarded, (
            f"Files with unguarded AsyncAnthropic() (no ai_proxy_enabled): "
            f"{', '.join(sorted(unguarded))}"
        )

    def test_no_unguarded_direct_openai_clients(self) -> None:
        """Every file creating AsyncOpenAI must have ai_proxy_enabled guard."""
        unguarded: list[str] = []
        for py_file in AI_DIR.rglob("*.py"):
            if py_file.name.startswith("test_"):
                continue
            source = py_file.read_text(encoding="utf-8")
            if not _OPENAI_PATTERN.search(source):
                continue
            if "ai_proxy_enabled" in source:
                continue
            rel = str(py_file.relative_to(AI_DIR))
            if rel in _ALLOWED_UNGUARDED_FILES:
                continue
            unguarded.append(rel)
        assert not unguarded, (
            f"Files with unguarded AsyncOpenAI() (no ai_proxy_enabled): "
            f"{', '.join(sorted(unguarded))}"
        )

    def test_allowed_files_still_exist(self) -> None:
        """Sanity check: allowed exclusion files actually exist.

        If a file is renamed or removed, the exclusion list should be updated
        to avoid silently missing new bypass paths.
        """
        missing: list[str] = []
        for rel_path in _ALLOWED_UNGUARDED_FILES:
            full = AI_DIR / rel_path
            if not full.exists():
                missing.append(rel_path)
        assert not missing, (
            f"Allowed exclusion file(s) no longer exist — update "
            f"_ALLOWED_UNGUARDED_FILES: {', '.join(sorted(missing))}"
        )


# ===================================================================
# Category 3: Cost tracking double-count guard
# ===================================================================


class TestCostTrackingGuards:
    """Verify that proxied paths skip local cost tracking to prevent
    double counting (proxy handles centralized cost tracking).
    """

    def test_llm_gateway_skips_cost_when_proxied(self) -> None:
        """LLMGateway must guard cost tracking with _is_proxied."""
        source = _LLM_GATEWAY.read_text(encoding="utf-8")
        assert "_is_proxied" in source, (
            "LLMGateway must track _is_proxied state for cost guard"
        )
        assert "if not _is_proxied" in source, (
            "LLMGateway must skip cost tracking when proxied: "
            "'if not _is_proxied' guard missing"
        )

    def test_ghost_text_skips_cost_when_proxied(self) -> None:
        """GhostTextService must guard cost tracking with _is_proxied."""
        source = _GHOST_TEXT.read_text(encoding="utf-8")
        assert "_is_proxied" in source, (
            "GhostTextService must track _is_proxied state for cost guard"
        )
        assert "if not _is_proxied" in source, (
            "GhostTextService must skip cost tracking when proxied: "
            "'if not _is_proxied' guard missing"
        )

    def test_llm_gateway_complete_has_separate_proxied_flag(self) -> None:
        """LLMGateway.complete() must set _is_proxied = True when proxy is on."""
        source = _LLM_GATEWAY.read_text(encoding="utf-8")
        # Find the complete method and verify it sets _is_proxied
        complete_match = re.search(
            r"async def complete\b.*?(?=\n    async def |\nclass |\Z)",
            source,
            re.DOTALL,
        )
        assert complete_match is not None, "LLMGateway.complete() method not found"
        complete_source = complete_match.group()
        assert "_is_proxied = True" in complete_source, (
            "LLMGateway.complete() must set _is_proxied = True when proxy enabled"
        )

    def test_llm_gateway_embed_has_separate_proxied_flag(self) -> None:
        """LLMGateway.embed() must set _is_proxied = True when proxy is on."""
        source = _LLM_GATEWAY.read_text(encoding="utf-8")
        embed_match = re.search(
            r"async def embed\b.*?(?=\n    async def |\nclass |\Z)",
            source,
            re.DOTALL,
        )
        assert embed_match is not None, "LLMGateway.embed() method not found"
        embed_source = embed_match.group()
        assert "_is_proxied = True" in embed_source, (
            "LLMGateway.embed() must set _is_proxied = True when proxy enabled"
        )


# ===================================================================
# Category 4: Workspace context headers (proxy needs them for cost attribution)
# ===================================================================


class TestProxyContextHeaders:
    """Verify that proxied paths pass workspace/user context to the proxy."""

    def test_llm_gateway_passes_workspace_headers(self) -> None:
        """LLMGateway must pass X-Workspace-Id when proxied."""
        source = _LLM_GATEWAY.read_text(encoding="utf-8")
        assert "X-Workspace-Id" in source, (
            "LLMGateway must pass X-Workspace-Id header to proxy"
        )
        assert "X-User-Id" in source, (
            "LLMGateway must pass X-User-Id header to proxy"
        )

    def test_pilotspace_agent_passes_workspace_headers(self) -> None:
        """PilotSpaceAgent must pass workspace context via env when proxied."""
        source = _PILOTSPACE_AGENT.read_text(encoding="utf-8")
        assert "X_WORKSPACE_ID" in source or "X-Workspace-Id" in source, (
            "PilotSpaceAgent must pass workspace ID to proxy"
        )

    def test_subagents_pass_workspace_headers(self) -> None:
        """Subagents must pass workspace/user context via SDK env when proxied."""
        for name, path in [
            ("PRReviewSubagent", _PR_REVIEW),
            ("DocGeneratorSubagent", _DOC_GENERATOR),
        ]:
            source = path.read_text(encoding="utf-8")
            assert "X_WORKSPACE_ID" in source, (
                f"{name} must pass X_WORKSPACE_ID in SDK env when proxied"
            )
            assert "X_USER_ID" in source, (
                f"{name} must pass X_USER_ID in SDK env when proxied"
            )
