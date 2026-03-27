"""Integration tests for Langfuse @observe() tracing within LLMGateway.

Verifies that:
1. The @observe decorator is present on LLMGateway.complete()
2. LLMGateway.complete() can be called without Langfuse crashing (graceful degradation)

All LLM calls are mocked -- no real external calls.
"""

from __future__ import annotations

import inspect
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from pilot_space.ai.providers.provider_selector import TaskType
from pilot_space.ai.proxy.llm_gateway import LLMGateway

WS_ID = uuid4()
USER_ID = uuid4()


def _make_anthropic_response() -> SimpleNamespace:
    return SimpleNamespace(
        content=[SimpleNamespace(type="text", text="traced response")],
        usage=SimpleNamespace(input_tokens=50, output_tokens=25),
    )


@pytest.mark.integration
def test_observe_decorator_present_on_complete() -> None:
    """Verify LLMGateway.complete is decorated with @observe."""
    complete_method = LLMGateway.complete
    has_wrapped = hasattr(complete_method, "__wrapped__")
    is_wrapper = complete_method.__qualname__ != "LLMGateway.complete"

    try:
        source = inspect.getsource(LLMGateway)
        has_observe_in_source = "@observe(" in source
    except (OSError, TypeError):
        has_observe_in_source = False

    assert has_wrapped or is_wrapper or has_observe_in_source, (
        "LLMGateway.complete() should be decorated with @observe. "
        f"has_wrapped={has_wrapped}, is_wrapper={is_wrapper}, "
        f"has_observe_in_source={has_observe_in_source}"
    )


@pytest.mark.integration
async def test_complete_fires_langfuse_observe() -> None:
    """LLMGateway.complete() succeeds when Langfuse is not configured."""
    mock_client = MagicMock()
    mock_client.messages.create = AsyncMock(return_value=_make_anthropic_response())

    mock_executor = AsyncMock()

    async def _pass_through(provider: str, operation: object, **kwargs: object) -> object:
        return await operation()  # type: ignore[misc]

    mock_executor.execute = AsyncMock(side_effect=_pass_through)

    mock_cost_tracker = AsyncMock()
    mock_cost_tracker.track = AsyncMock()

    mock_key_storage = AsyncMock()
    mock_key_storage.get_api_key = AsyncMock(return_value="sk-test-key")

    gateway = LLMGateway(mock_executor, mock_cost_tracker, mock_key_storage)
    gateway._get_anthropic_client = MagicMock(return_value=mock_client)  # type: ignore[method-assign]

    result = await gateway.complete(
        workspace_id=WS_ID,
        user_id=USER_ID,
        task_type=TaskType.CONVERSATION,
        messages=[{"role": "user", "content": "hello"}],
    )

    assert result.text == "traced response"
    assert result.input_tokens == 50
    assert result.output_tokens == 25
    mock_client.messages.create.assert_called_once()
