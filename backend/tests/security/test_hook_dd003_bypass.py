"""Security tests: DD-003 defense-in-depth for workspace hook rules.

Phase 83 -- verify that the HookRuleService enforces:
1. Pattern validation (200-char limit, regex compilation check).
2. 50-rule-per-workspace limit.
3. Allow rules CAN be created for CRITICAL tools (guard is at evaluation,
   not creation -- admins should see what they configured).

These are unit-level tests -- no database required. The repository is
mocked to isolate service-layer logic.
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from pilot_space.application.services.hooks.exceptions import (
    HookRuleLimitError,
    InvalidHookPatternError,
)
from pilot_space.application.services.hooks.hook_rule_service import HookRuleService


def _make_service() -> HookRuleService:
    """Create a HookRuleService with mocked Redis (no real connections)."""
    redis_mock = MagicMock()
    redis_mock.is_connected = False  # Disable Redis for unit tests
    return HookRuleService(redis_client=redis_mock)


def _mock_hook_config(
    *,
    workspace_id: uuid.UUID | None = None,
    name: str = "test-rule",
    tool_pattern: str = "delete_*",
    action: str = "deny",
) -> MagicMock:
    """Build a mock WorkspaceHookConfig."""
    mock = MagicMock()
    mock.workspace_id = workspace_id or uuid.uuid4()
    mock.name = name
    mock.tool_pattern = tool_pattern
    mock.action = action
    mock.id = uuid.uuid4()
    mock.event_type = "PreToolUse"
    mock.priority = 100
    mock.is_enabled = True
    return mock


class TestHookDD003Guard:
    """DD-003 defense-in-depth: hook rules cannot bypass CRITICAL approval."""

    @pytest.mark.asyncio
    async def test_create_allow_rule_for_critical_tool_succeeds(self) -> None:
        """Admin CAN create an allow rule for a critical tool.

        The DD-003 guard is at evaluation time (Plan 02), not creation
        time. This lets admins see their configuration while maintaining
        the security invariant at runtime.
        """
        service = _make_service()
        workspace_id = uuid.uuid4()
        actor_id = uuid.uuid4()

        mock_repo = AsyncMock()
        mock_repo.count_for_workspace.return_value = 0
        mock_hook = _mock_hook_config(
            workspace_id=workspace_id,
            name="allow-critical",
            tool_pattern="delete_issue",
            action="allow",
        )
        mock_repo.create.return_value = mock_hook

        with patch.object(service, "_repo", return_value=mock_repo):
            result = await service.create(
                workspace_id=workspace_id,
                name="allow-critical",
                tool_pattern="delete_issue",
                action="allow",
                actor_user_id=actor_id,
            )

        assert result.action == "allow"
        assert result.tool_pattern == "delete_issue"
        mock_repo.create.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_allow_all_rule_succeeds(self) -> None:
        """Admin CAN create a wildcard allow-all rule.

        Evaluator (Plan 02) overrides to require_approval for CRITICAL tools.
        """
        service = _make_service()
        workspace_id = uuid.uuid4()
        actor_id = uuid.uuid4()

        mock_repo = AsyncMock()
        mock_repo.count_for_workspace.return_value = 0
        mock_hook = _mock_hook_config(
            workspace_id=workspace_id,
            name="allow-all",
            tool_pattern="*",
            action="allow",
        )
        mock_repo.create.return_value = mock_hook

        with patch.object(service, "_repo", return_value=mock_repo):
            result = await service.create(
                workspace_id=workspace_id,
                name="allow-all",
                tool_pattern="*",
                action="allow",
                actor_user_id=actor_id,
            )

        assert result.action == "allow"
        assert result.tool_pattern == "*"


class TestHookPatternValidation:
    """Pattern validation: ReDoS mitigation and regex compilation."""

    @pytest.mark.asyncio
    async def test_service_validates_invalid_regex_pattern(self) -> None:
        """Invalid regex patterns are rejected at creation."""
        service = _make_service()
        workspace_id = uuid.uuid4()
        actor_id = uuid.uuid4()

        mock_repo = AsyncMock()
        mock_repo.count_for_workspace.return_value = 0

        with (
            patch.object(service, "_repo", return_value=mock_repo),
            pytest.raises(InvalidHookPatternError, match="Invalid regex"),
        ):
            await service.create(
                workspace_id=workspace_id,
                name="bad-regex",
                tool_pattern="/(invalid[/",
                action="deny",
                actor_user_id=actor_id,
            )

    @pytest.mark.asyncio
    async def test_service_rejects_pattern_over_200_chars(self) -> None:
        """Patterns longer than 200 chars are rejected (ReDoS mitigation)."""
        service = _make_service()
        workspace_id = uuid.uuid4()
        actor_id = uuid.uuid4()

        long_pattern = "a" * 201

        mock_repo = AsyncMock()
        mock_repo.count_for_workspace.return_value = 0

        with (
            patch.object(service, "_repo", return_value=mock_repo),
            pytest.raises(InvalidHookPatternError, match="200 character limit"),
        ):
            await service.create(
                workspace_id=workspace_id,
                name="long-pattern",
                tool_pattern=long_pattern,
                action="deny",
                actor_user_id=actor_id,
            )

    @pytest.mark.asyncio
    async def test_service_rejects_empty_pattern(self) -> None:
        """Empty patterns are rejected."""
        service = _make_service()
        workspace_id = uuid.uuid4()
        actor_id = uuid.uuid4()

        mock_repo = AsyncMock()
        mock_repo.count_for_workspace.return_value = 0

        with (
            patch.object(service, "_repo", return_value=mock_repo),
            pytest.raises(InvalidHookPatternError, match="must not be empty"),
        ):
            await service.create(
                workspace_id=workspace_id,
                name="empty-pattern",
                tool_pattern="   ",
                action="deny",
                actor_user_id=actor_id,
            )

    @pytest.mark.asyncio
    async def test_valid_glob_pattern_accepted(self) -> None:
        """Standard glob patterns are accepted."""
        service = _make_service()
        workspace_id = uuid.uuid4()
        actor_id = uuid.uuid4()

        mock_repo = AsyncMock()
        mock_repo.count_for_workspace.return_value = 0
        mock_hook = _mock_hook_config(
            workspace_id=workspace_id,
            tool_pattern="delete_*",
        )
        mock_repo.create.return_value = mock_hook

        with patch.object(service, "_repo", return_value=mock_repo):
            result = await service.create(
                workspace_id=workspace_id,
                name="glob-rule",
                tool_pattern="delete_*",
                action="deny",
                actor_user_id=actor_id,
            )

        assert result is not None

    @pytest.mark.asyncio
    async def test_valid_regex_pattern_accepted(self) -> None:
        """Valid regex patterns (wrapped in /) are accepted."""
        service = _make_service()
        workspace_id = uuid.uuid4()
        actor_id = uuid.uuid4()

        mock_repo = AsyncMock()
        mock_repo.count_for_workspace.return_value = 0
        mock_hook = _mock_hook_config(
            workspace_id=workspace_id,
            tool_pattern="/^(delete|remove)_.*/",
        )
        mock_repo.create.return_value = mock_hook

        with patch.object(service, "_repo", return_value=mock_repo):
            result = await service.create(
                workspace_id=workspace_id,
                name="regex-rule",
                tool_pattern="/^(delete|remove)_.*/",
                action="require_approval",
                actor_user_id=actor_id,
            )

        assert result is not None

    @pytest.mark.asyncio
    async def test_pattern_exactly_200_chars_accepted(self) -> None:
        """Pattern at exactly the 200-char boundary is accepted."""
        service = _make_service()
        workspace_id = uuid.uuid4()
        actor_id = uuid.uuid4()

        pattern_200 = "a" * 200

        mock_repo = AsyncMock()
        mock_repo.count_for_workspace.return_value = 0
        mock_hook = _mock_hook_config(
            workspace_id=workspace_id,
            tool_pattern=pattern_200,
        )
        mock_repo.create.return_value = mock_hook

        with patch.object(service, "_repo", return_value=mock_repo):
            result = await service.create(
                workspace_id=workspace_id,
                name="boundary-rule",
                tool_pattern=pattern_200,
                action="deny",
                actor_user_id=actor_id,
            )

        assert result is not None


class TestHookRuleLimits:
    """Rule count limits: max 50 per workspace."""

    @pytest.mark.asyncio
    async def test_service_enforces_max_50_rules(self) -> None:
        """Cannot create more than 50 rules per workspace."""
        service = _make_service()
        workspace_id = uuid.uuid4()
        actor_id = uuid.uuid4()

        mock_repo = AsyncMock()
        mock_repo.count_for_workspace.return_value = 50  # At limit

        with (
            patch.object(service, "_repo", return_value=mock_repo),
            pytest.raises(HookRuleLimitError, match="maximum of 50"),
        ):
            await service.create(
                workspace_id=workspace_id,
                name="one-too-many",
                tool_pattern="some_tool",
                action="deny",
                actor_user_id=actor_id,
            )

    @pytest.mark.asyncio
    async def test_service_allows_at_49_rules(self) -> None:
        """Can create a rule when workspace has 49 (under limit)."""
        service = _make_service()
        workspace_id = uuid.uuid4()
        actor_id = uuid.uuid4()

        mock_repo = AsyncMock()
        mock_repo.count_for_workspace.return_value = 49
        mock_hook = _mock_hook_config(workspace_id=workspace_id)
        mock_repo.create.return_value = mock_hook

        with patch.object(service, "_repo", return_value=mock_repo):
            result = await service.create(
                workspace_id=workspace_id,
                name="rule-49",
                tool_pattern="some_tool",
                action="deny",
                actor_user_id=actor_id,
            )

        assert result is not None
        mock_repo.create.assert_called_once()
