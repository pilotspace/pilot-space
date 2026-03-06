"""Unit tests for EmbeddingService.

Tests provider cascade: OpenAI → Ollama, failure isolation, and edge cases.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from pilot_space.application.services.embedding_service import (
    EmbeddingConfig,
    EmbeddingService,
)


@pytest.fixture
def openai_config() -> EmbeddingConfig:
    return EmbeddingConfig(openai_api_key="sk-test-key")  # pragma: allowlist secret


@pytest.fixture
def no_key_config() -> EmbeddingConfig:
    return EmbeddingConfig()


@pytest.fixture
def ollama_only_config() -> EmbeddingConfig:
    return EmbeddingConfig(ollama_base_url="http://localhost:11434")


@pytest.mark.asyncio
async def test_openai_success_no_ollama_called(openai_config: EmbeddingConfig) -> None:
    """OpenAI success → return immediately, Ollama NOT called."""
    vector = [0.1] * 768
    ollama_mock = AsyncMock(return_value=None)

    with (
        patch.object(EmbeddingService, "_embed_openai", new=AsyncMock(return_value=vector)),
        patch.object(EmbeddingService, "_embed_ollama", ollama_mock),
    ):
        svc = EmbeddingService(openai_config)
        result = await svc.embed("hello world")

    assert result == vector
    ollama_mock.assert_not_called()


@pytest.mark.asyncio
async def test_openai_failure_falls_back_to_ollama(openai_config: EmbeddingConfig) -> None:
    """OpenAI raises → Ollama called as fallback."""
    vector = [0.2] * 768

    with (
        patch.object(EmbeddingService, "_embed_openai", new=AsyncMock(return_value=None)),
        patch.object(EmbeddingService, "_embed_ollama", new=AsyncMock(return_value=vector)),
    ):
        svc = EmbeddingService(openai_config)
        result = await svc.embed("hello world")

    assert result == vector


@pytest.mark.asyncio
async def test_both_fail_returns_none(openai_config: EmbeddingConfig) -> None:
    """Both OpenAI and Ollama fail → returns None."""
    with (
        patch.object(EmbeddingService, "_embed_openai", new=AsyncMock(return_value=None)),
        patch.object(EmbeddingService, "_embed_ollama", new=AsyncMock(return_value=None)),
    ):
        svc = EmbeddingService(openai_config)
        result = await svc.embed("hello world")

    assert result is None


@pytest.mark.asyncio
async def test_empty_text_returns_none(openai_config: EmbeddingConfig) -> None:
    """Empty string → None without calling any provider."""
    with patch("pilot_space.application.services.embedding_service.asyncio.wait_for") as mock_wait:
        svc = EmbeddingService(openai_config)
        result = await svc.embed("")

    assert result is None
    mock_wait.assert_not_called()


@pytest.mark.asyncio
async def test_whitespace_only_text_returns_none(openai_config: EmbeddingConfig) -> None:
    """Whitespace-only string → None."""
    svc = EmbeddingService(openai_config)
    result = await svc.embed("   \n\t  ")
    assert result is None


@pytest.mark.asyncio
async def test_no_api_key_skips_openai_goes_to_ollama(no_key_config: EmbeddingConfig) -> None:
    """No OpenAI key → skips OpenAI, tries Ollama directly."""
    vector = [0.3] * 768

    with (
        patch("pilot_space.application.services.embedding_service.asyncio.wait_for") as mock_wait,
        patch(
            "pilot_space.application.services.embedding_service.asyncio.to_thread",
            new=AsyncMock(return_value=vector),
        ),
    ):
        svc = EmbeddingService(no_key_config)
        result = await svc.embed("test text")

    assert result == vector
    mock_wait.assert_not_called()


@pytest.mark.asyncio
async def test_no_key_ollama_also_fails_returns_none(no_key_config: EmbeddingConfig) -> None:
    """No key, Ollama fails → returns None."""
    with patch(
        "pilot_space.application.services.embedding_service.asyncio.to_thread",
        side_effect=Exception("Ollama down"),
    ):
        svc = EmbeddingService(no_key_config)
        result = await svc.embed("test text")

    assert result is None


@pytest.mark.asyncio
async def test_768_dim_output(openai_config: EmbeddingConfig) -> None:
    """Validates that returned vector has 768 dimensions."""
    vector = [float(i) / 768 for i in range(768)]

    with patch.object(EmbeddingService, "_embed_openai", new=AsyncMock(return_value=vector)):
        svc = EmbeddingService(openai_config)
        result = await svc.embed("test")

    assert result is not None
    assert len(result) == 768


@pytest.mark.asyncio
async def test_timeout_falls_back_to_ollama(openai_config: EmbeddingConfig) -> None:
    """TimeoutError from OpenAI → Ollama fallback."""
    vector = [0.4] * 768

    with (
        patch.object(EmbeddingService, "_embed_openai", new=AsyncMock(return_value=None)),
        patch.object(EmbeddingService, "_embed_ollama", new=AsyncMock(return_value=vector)),
    ):
        svc = EmbeddingService(openai_config)
        result = await svc.embed("test query")

    assert result == vector
