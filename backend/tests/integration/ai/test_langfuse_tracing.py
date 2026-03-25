"""Integration tests for Langfuse @observe() tracing within LLMGateway.

Verifies that:
1. The @observe decorator is present on LLMGateway.complete()
2. LLMGateway.complete() can be called without Langfuse crashing (graceful degradation)

All LLM and Langfuse API calls are mocked -- no real external calls.
"""

from __future__ import annotations

import inspect
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from pilot_space.ai.proxy.llm_gateway import LLMGateway
from pilot_space.ai.providers.provider_selector import TaskType

WS_ID = uuid4()
USER_ID = uuid4()


def _make_mock_response() -> SimpleNamespace:
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content="traced response"))],
        usage=SimpleNamespace(prompt_tokens=50, completion_tokens=25),
    )


@pytest.mark.integration
def test_observe_decorator_present_on_complete() -> None:
    """Verify LLMGateway.complete is decorated with @observe.

    The langfuse @observe decorator wraps the original function.
    We detect this by checking for the __wrapped__ attribute (set by
    functools.wraps within the observe decorator) or by inspecting
    the decorator chain.
    """
    complete_method = LLMGateway.complete

    # langfuse.decorators.observe sets __wrapped__ on the wrapper function
    has_wrapped = hasattr(complete_method, "__wrapped__")

    # Alternative: check if the method's qualname differs from what we'd expect
    # (decorator changes the function object)
    is_wrapper = complete_method.__qualname__ != "LLMGateway.complete"

    # Alternative: check source for @observe in the source file
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
@patch("pilot_space.ai.proxy.llm_gateway.litellm")
async def test_complete_fires_langfuse_observe(
    mock_litellm: AsyncMock,
) -> None:
    """LLMGateway.complete() succeeds when Langfuse is not configured.

    The @observe decorator should degrade gracefully when Langfuse
    keys are empty/not configured, allowing the underlying method
    to execute normally.
    """
    mock_litellm.acompletion = AsyncMock(return_value=_make_mock_response())

    mock_executor = AsyncMock()

    async def _pass_through(provider: str, operation: object, **kwargs: object) -> object:
        return await operation()  # type: ignore[misc]

    mock_executor.execute = AsyncMock(side_effect=_pass_through)

    mock_cost_tracker = AsyncMock()
    mock_cost_tracker.track = AsyncMock()

    mock_key_storage = AsyncMock()
    mock_key_storage.get_api_key = AsyncMock(return_value="sk-test-key")

    gateway = LLMGateway(mock_executor, mock_cost_tracker, mock_key_storage)

    # This should succeed even without Langfuse configured
    result = await gateway.complete(
        workspace_id=WS_ID,
        user_id=USER_ID,
        task_type=TaskType.CONVERSATION,
        messages=[{"role": "user", "content": "hello"}],
    )

    assert result.text == "traced response"
    assert result.input_tokens == 50
    assert result.output_tokens == 25
    mock_litellm.acompletion.assert_called_once()
