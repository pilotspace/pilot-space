"""Unit tests for LLMGateway.

All Anthropic/OpenAI SDK calls are mocked -- no real API calls.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from pilot_space.ai.exceptions import AINotConfiguredError
from pilot_space.ai.proxy.llm_gateway import EmbeddingResponse, LLMGateway, LLMResponse
from pilot_space.ai.proxy.provider_config import (
    TASK_TYPE_MODEL_MAP,
    extract_model_name,
    extract_provider,
    resolve_model,
)
from pilot_space.ai.providers.provider_selector import TaskType


# -- Fixtures ------------------------------------------------------------------

def _make_anthropic_response(
    text: str = "test response",
    input_tokens: int = 100,
    output_tokens: int = 50,
) -> SimpleNamespace:
    """Create a mock Anthropic Message response."""
    return SimpleNamespace(
        content=[SimpleNamespace(type="text", text=text)],
        usage=SimpleNamespace(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
        ),
    )


def _make_openai_response(
    text: str = "test response",
    prompt_tokens: int = 100,
    completion_tokens: int = 50,
) -> SimpleNamespace:
    """Create a mock OpenAI ChatCompletion response."""
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=text))],
        usage=SimpleNamespace(
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
        ),
    )


def _make_embedding_response(
    embeddings: list[list[float]] | None = None,
    total_tokens: int = 10,
) -> SimpleNamespace:
    """Create a mock OpenAI Embedding response."""
    if embeddings is None:
        embeddings = [[0.1, 0.2, 0.3]]
    return SimpleNamespace(
        data=[SimpleNamespace(embedding=e) for e in embeddings],
        usage=SimpleNamespace(total_tokens=total_tokens),
    )


@pytest.fixture
def mock_executor() -> AsyncMock:
    """ResilientExecutor mock that passes through to the operation."""
    executor = AsyncMock()

    async def _pass_through(provider: str, operation: object, **kwargs: object) -> object:
        return await operation()  # type: ignore[misc]

    executor.execute = AsyncMock(side_effect=_pass_through)
    return executor


@pytest.fixture
def mock_cost_tracker() -> AsyncMock:
    """CostTracker mock."""
    tracker = AsyncMock()
    tracker.track = AsyncMock()
    return tracker


@pytest.fixture
def mock_key_storage() -> AsyncMock:
    """SecureKeyStorage mock that returns a test key."""
    storage = AsyncMock()
    storage.get_api_key = AsyncMock(return_value="sk-test-key")
    return storage


@pytest.fixture
def gateway(
    mock_executor: AsyncMock,
    mock_cost_tracker: AsyncMock,
    mock_key_storage: AsyncMock,
) -> LLMGateway:
    return LLMGateway(mock_executor, mock_cost_tracker, mock_key_storage)


# -- LLMGateway.complete (Anthropic) tests ------------------------------------

WS_ID = uuid4()
USER_ID = uuid4()


async def test_complete_calls_anthropic_messages_create(
    gateway: LLMGateway,
    mock_executor: AsyncMock,
) -> None:
    """LLMGateway.complete() calls AsyncAnthropic.messages.create for anthropic models."""
    mock_client = MagicMock()
    mock_client.messages.create = AsyncMock(return_value=_make_anthropic_response())
    gateway._anthropic_clients["test"] = mock_client  # noqa: SLF001
    # Patch _get_anthropic_client to return our mock
    gateway._get_anthropic_client = MagicMock(return_value=mock_client)  # type: ignore[method-assign]  # noqa: SLF001

    result = await gateway.complete(
        workspace_id=WS_ID,
        user_id=USER_ID,
        task_type=TaskType.PR_REVIEW,
        messages=[{"role": "user", "content": "review this"}],
    )

    assert isinstance(result, LLMResponse)
    assert result.text == "test response"
    mock_client.messages.create.assert_called_once()
    call_kwargs = mock_client.messages.create.call_args.kwargs
    assert call_kwargs["model"] == "claude-sonnet-4-20250514"


async def test_complete_wraps_in_executor(
    gateway: LLMGateway,
    mock_executor: AsyncMock,
) -> None:
    """LLMGateway.complete() wraps call in self._executor.execute()."""
    mock_client = MagicMock()
    mock_client.messages.create = AsyncMock(return_value=_make_anthropic_response())
    gateway._get_anthropic_client = MagicMock(return_value=mock_client)  # type: ignore[method-assign]  # noqa: SLF001

    await gateway.complete(
        workspace_id=WS_ID,
        user_id=USER_ID,
        task_type=TaskType.GHOST_TEXT,
        messages=[{"role": "user", "content": "hello"}],
    )

    mock_executor.execute.assert_called_once()
    call_kwargs = mock_executor.execute.call_args
    assert call_kwargs.kwargs["provider"] == "anthropic"


async def test_complete_tracks_cost(
    gateway: LLMGateway,
    mock_cost_tracker: AsyncMock,
) -> None:
    """LLMGateway.complete() calls track_llm_cost after successful completion."""
    mock_client = MagicMock()
    mock_client.messages.create = AsyncMock(return_value=_make_anthropic_response())
    gateway._get_anthropic_client = MagicMock(return_value=mock_client)  # type: ignore[method-assign]  # noqa: SLF001

    await gateway.complete(
        workspace_id=WS_ID,
        user_id=USER_ID,
        task_type=TaskType.CODE_GENERATION,
        messages=[{"role": "user", "content": "generate code"}],
    )

    mock_cost_tracker.track.assert_called_once()
    call_kwargs = mock_cost_tracker.track.call_args
    assert call_kwargs.kwargs["workspace_id"] == WS_ID
    assert call_kwargs.kwargs["user_id"] == USER_ID
    assert call_kwargs.kwargs["input_tokens"] == 100
    assert call_kwargs.kwargs["output_tokens"] == 50


async def test_complete_resolves_byok_key(
    gateway: LLMGateway,
    mock_key_storage: AsyncMock,
) -> None:
    """LLMGateway.complete() resolves BYOK key from SecureKeyStorage."""
    mock_client = MagicMock()
    mock_client.messages.create = AsyncMock(return_value=_make_anthropic_response())
    gateway._get_anthropic_client = MagicMock(return_value=mock_client)  # type: ignore[method-assign]  # noqa: SLF001

    await gateway.complete(
        workspace_id=WS_ID,
        user_id=USER_ID,
        task_type=TaskType.GHOST_TEXT,
        messages=[{"role": "user", "content": "hello"}],
    )

    mock_key_storage.get_api_key.assert_called_once_with(WS_ID, "anthropic", "llm")


async def test_complete_raises_when_no_key(
    gateway: LLMGateway,
    mock_key_storage: AsyncMock,
) -> None:
    """LLMGateway.complete() raises AINotConfiguredError when no API key found."""
    mock_key_storage.get_api_key = AsyncMock(return_value=None)

    with pytest.raises(AINotConfiguredError):
        await gateway.complete(
            workspace_id=WS_ID,
            user_id=USER_ID,
            task_type=TaskType.PR_REVIEW,
            messages=[{"role": "user", "content": "hello"}],
        )


async def test_complete_with_system_message(
    gateway: LLMGateway,
) -> None:
    """system param is passed as separate Anthropic system param."""
    mock_client = MagicMock()
    mock_client.messages.create = AsyncMock(return_value=_make_anthropic_response())
    gateway._get_anthropic_client = MagicMock(return_value=mock_client)  # type: ignore[method-assign]  # noqa: SLF001

    await gateway.complete(
        workspace_id=WS_ID,
        user_id=USER_ID,
        task_type=TaskType.CONVERSATION,
        messages=[{"role": "user", "content": "hello"}],
        system="You are helpful.",
    )

    call_kwargs = mock_client.messages.create.call_args.kwargs
    assert call_kwargs["system"] == "You are helpful."
    # User message should NOT include system message in the messages list
    assert all(m["role"] != "system" for m in call_kwargs["messages"])


async def test_complete_returns_correct_response(
    gateway: LLMGateway,
) -> None:
    """LLMGateway.complete() returns LLMResponse with correct data."""
    mock_client = MagicMock()
    mock_client.messages.create = AsyncMock(
        return_value=_make_anthropic_response("hello world", 200, 100)
    )
    gateway._get_anthropic_client = MagicMock(return_value=mock_client)  # type: ignore[method-assign]  # noqa: SLF001

    result = await gateway.complete(
        workspace_id=WS_ID,
        user_id=USER_ID,
        task_type=TaskType.DOC_GENERATION,
        messages=[{"role": "user", "content": "doc"}],
    )

    assert result.text == "hello world"
    assert result.input_tokens == 200
    assert result.output_tokens == 100
    assert result.model == "anthropic/claude-sonnet-4-20250514"


# -- LLMGateway.embed tests ---------------------------------------------------

async def test_embed_calls_openai_embeddings_create(
    gateway: LLMGateway,
) -> None:
    """LLMGateway.embed() calls AsyncOpenAI.embeddings.create."""
    mock_client = MagicMock()
    mock_client.embeddings.create = AsyncMock(
        return_value=_make_embedding_response([[0.1, 0.2]])
    )
    gateway._get_openai_client = MagicMock(return_value=mock_client)  # type: ignore[method-assign]  # noqa: SLF001

    result = await gateway.embed(
        workspace_id=WS_ID,
        user_id=USER_ID,
        texts=["hello world"],
    )

    assert isinstance(result, EmbeddingResponse)
    assert result.embeddings == [[0.1, 0.2]]
    mock_client.embeddings.create.assert_called_once()


# -- resolve_model tests ------------------------------------------------------

def test_resolve_model_default() -> None:
    """TaskType.GHOST_TEXT maps to haiku model."""
    result = resolve_model(TaskType.GHOST_TEXT)
    assert result == "anthropic/claude-3-5-haiku-20241022"


def test_resolve_model_override() -> None:
    """Override ignores task_type mapping."""
    result = resolve_model(TaskType.GHOST_TEXT, model_override="openai/gpt-4o")
    assert result == "openai/gpt-4o"


def test_resolve_model_all_task_types_mapped() -> None:
    """Every TaskType has a mapping."""
    for task_type in TaskType:
        assert task_type in TASK_TYPE_MODEL_MAP


# -- extract_provider tests ----------------------------------------------------

def test_extract_provider_anthropic() -> None:
    assert extract_provider("anthropic/claude-sonnet-4-20250514") == "anthropic"


def test_extract_provider_openai() -> None:
    assert extract_provider("openai/gpt-4o") == "openai"


def test_extract_provider_no_prefix() -> None:
    """No prefix defaults to anthropic (primary provider)."""
    assert extract_provider("claude-sonnet-4") == "anthropic"


# -- extract_model_name tests --------------------------------------------------

def test_extract_model_name_with_prefix() -> None:
    assert extract_model_name("anthropic/claude-sonnet-4-20250514") == "claude-sonnet-4-20250514"


def test_extract_model_name_no_prefix() -> None:
    assert extract_model_name("claude-sonnet-4") == "claude-sonnet-4"
