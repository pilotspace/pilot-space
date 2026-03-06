"""Unified EmbeddingService — single source of truth for 768-dim text embeddings.

Consolidates 6 scattered embedding call sites into one service with a
provider cascade: OpenAI text-embedding-3-large → Ollama nomic-embed-text-v2-moe.

Feature 016: Knowledge Graph — Memory Engine
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import TYPE_CHECKING

from pilot_space.infrastructure.database.repositories._graph_helpers import GRAPH_EMBEDDING_DIMS
from pilot_space.infrastructure.logging import get_logger

if TYPE_CHECKING:
    from openai import AsyncOpenAI  # type: ignore[import-untyped]

logger = get_logger(__name__)

_OPENAI_MODEL = "text-embedding-3-large"
_OLLAMA_MODEL = "nomic-embed-text-v2-moe"
_OPENAI_TIMEOUT_S = 10.0
_OPENAI_WAIT_FOR_S = 15.0
_OLLAMA_TIMEOUT_S = 30


@dataclass(frozen=True, slots=True)
class EmbeddingConfig:
    """Configuration for EmbeddingService.

    Attributes:
        openai_api_key: OpenAI API key. None → skip OpenAI, try Ollama.
        ollama_base_url: Ollama API base URL.
        dimensions: Embedding vector size (authoritative constant: 768).
    """

    openai_api_key: str | None = None
    ollama_base_url: str = "http://localhost:11434"
    dimensions: int = GRAPH_EMBEDDING_DIMS


class EmbeddingService:
    """Provider-cascading embedding service (OpenAI → Ollama).

    Returns 768-dim float list or None when all providers fail.
    Never raises — failures are logged as warnings.

    Example:
        cfg = EmbeddingConfig(openai_api_key="sk-...")
        svc = EmbeddingService(cfg)
        vector = await svc.embed("rate limiting design")
    """

    def __init__(self, config: EmbeddingConfig) -> None:
        self._config = config
        self._openai_client: AsyncOpenAI | None = None
        if config.openai_api_key:
            from openai import AsyncOpenAI as _AsyncOpenAI  # type: ignore[import-untyped]

            self._openai_client = _AsyncOpenAI(
                api_key=config.openai_api_key,
                timeout=_OPENAI_TIMEOUT_S,
            )

    async def embed(self, text: str) -> list[float] | None:
        """Embed text using OpenAI then Ollama as fallback.

        Args:
            text: Text to embed. Returns None for empty/whitespace-only input.

        Returns:
            768-dim float list or None on failure.
        """
        if not text or not text.strip():
            return None

        if self._openai_client is not None:
            result = await self._embed_openai(text)
            if result is not None:
                return result

        return await self._embed_ollama(text)

    async def _embed_openai(self, text: str) -> list[float] | None:
        """Embed via OpenAI text-embedding-3-large (768-dim, truncated).

        Uses a 10s client timeout + 15s asyncio.wait_for guard.
        """
        assert self._openai_client is not None
        try:
            response = await asyncio.wait_for(
                self._openai_client.embeddings.create(
                    model=_OPENAI_MODEL,
                    input=text,
                    dimensions=self._config.dimensions,
                ),
                timeout=_OPENAI_WAIT_FOR_S,
            )
            return list(response.data[0].embedding)
        except TimeoutError:
            logger.warning("EmbeddingService: OpenAI embedding timed out — trying Ollama")
            return None
        except Exception:
            logger.warning(
                "EmbeddingService: OpenAI embedding failed — trying Ollama", exc_info=True
            )
            return None

    async def _embed_ollama(self, text: str) -> list[float] | None:
        """Embed via Ollama nomic-embed-text-v2-moe (768-dim, local).

        Runs sync urllib call in a thread to avoid blocking the event loop.
        """
        try:
            return await asyncio.to_thread(
                _ollama_embed_sync,
                text,
                self._config.ollama_base_url,
                _OLLAMA_MODEL,
                _OLLAMA_TIMEOUT_S,
            )
        except Exception:
            logger.warning("EmbeddingService: Ollama embedding failed", exc_info=True)
            return None


def _ollama_embed_sync(
    text: str,
    base_url: str,
    model: str,
    timeout: int,
) -> list[float] | None:
    """Synchronous Ollama embed — run inside asyncio.to_thread."""
    import json
    import urllib.request

    payload = json.dumps({"model": model, "input": text}).encode()
    req = urllib.request.Request(
        f"{base_url}/api/embed",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = json.loads(resp.read())
    embeddings = body.get("embeddings")
    return list(embeddings[0]) if embeddings else None


__all__ = ["EmbeddingConfig", "EmbeddingService"]
