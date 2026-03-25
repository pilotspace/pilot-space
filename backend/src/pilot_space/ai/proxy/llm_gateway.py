"""Unified LLM entry point using LiteLLM with resilience and cost tracking.

LLMGateway is the single entry point for all LLM completions in Pilot Space.
It routes through LiteLLM (library mode), wraps calls with ResilientExecutor,
auto-tracks costs via CostTracker, and emits Langfuse traces.

Replaces 8+ scattered direct AsyncAnthropic() instantiations.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any
from uuid import UUID

import litellm

from pilot_space.ai.exceptions import AINotConfiguredError
from pilot_space.ai.proxy.cost_hooks import track_llm_cost
from pilot_space.ai.proxy.provider_config import extract_provider, resolve_litellm_model
from pilot_space.ai.proxy.tracing import observe  # pyright: ignore[reportAttributeAccessIssue]
from pilot_space.infrastructure.logging import get_logger

if TYPE_CHECKING:
    from pilot_space.ai.infrastructure.cost_tracker import CostTracker
    from pilot_space.ai.infrastructure.key_storage import SecureKeyStorage
    from pilot_space.ai.infrastructure.resilience import ResilientExecutor
    from pilot_space.ai.providers.provider_selector import TaskType

logger = get_logger(__name__)


@dataclass(frozen=True, slots=True)
class LLMResponse:
    """Provider-agnostic LLM completion response."""

    text: str
    input_tokens: int
    output_tokens: int
    model: str
    raw: Any


@dataclass(frozen=True, slots=True)
class EmbeddingResponse:
    """Provider-agnostic embedding response."""

    embeddings: list[list[float]]
    model: str
    input_tokens: int


class LLMGateway:
    """Unified gateway for LLM completions and embeddings.

    Wraps LiteLLM with:
    - BYOK key resolution from SecureKeyStorage
    - ResilientExecutor for retry + circuit breaking
    - Automatic cost tracking via CostTracker
    - Langfuse @observe tracing

    Usage:
        gateway = LLMGateway(executor, cost_tracker, key_storage)
        response = await gateway.complete(
            workspace_id=ws_id,
            user_id=user_id,
            task_type=TaskType.PR_REVIEW,
            messages=[{"role": "user", "content": "Review this code"}],
        )
    """

    def __init__(
        self,
        executor: ResilientExecutor,
        cost_tracker: CostTracker,
        key_storage: SecureKeyStorage,
    ) -> None:
        """Initialize LLMGateway.

        Args:
            executor: ResilientExecutor for retry and circuit breaking.
            cost_tracker: CostTracker for persistent cost recording.
            key_storage: SecureKeyStorage for BYOK key resolution.
        """
        self._executor = executor
        self._cost_tracker = cost_tracker
        self._key_storage = key_storage

    @observe(name="llm_gateway.complete")  # type: ignore[misc]
    async def complete(
        self,
        *,
        workspace_id: UUID,
        user_id: UUID,
        task_type: TaskType,
        messages: list[dict[str, str]],
        model: str | None = None,
        max_tokens: int = 1024,
        temperature: float = 0.7,
        system: str | None = None,
        agent_name: str = "llm_gateway",
    ) -> LLMResponse:
        """Execute an LLM completion via LiteLLM.

        Args:
            workspace_id: Workspace UUID for BYOK key lookup.
            user_id: User UUID who initiated the call.
            task_type: AI task type for model routing.
            messages: Chat messages in OpenAI format.
            model: Optional model override (LiteLLM format).
            max_tokens: Maximum tokens to generate.
            temperature: Sampling temperature.
            system: Optional system message to prepend.
            agent_name: Agent/service name for cost tracking.

        Returns:
            LLMResponse with completion text and usage data.

        Raises:
            AINotConfiguredError: If no BYOK API key is configured.
        """
        resolved_model = resolve_litellm_model(task_type, model)
        provider = extract_provider(resolved_model)

        # Resolve BYOK key
        api_key = await self._key_storage.get_api_key(workspace_id, provider, "llm")
        if api_key is None:
            raise AINotConfiguredError(workspace_id=workspace_id)

        # Prepend system message if provided
        final_messages = list(messages)
        if system is not None:
            final_messages = [{"role": "system", "content": system}, *final_messages]

        # Wrap LiteLLM call in ResilientExecutor
        response = await self._executor.execute(
            provider=provider,
            operation=lambda: litellm.acompletion(
                model=resolved_model,
                messages=final_messages,
                api_key=api_key,
                max_tokens=max_tokens,
                temperature=temperature,
            ),
        )

        # Track cost (fire-and-forget, never crashes)
        await track_llm_cost(
            self._cost_tracker,
            workspace_id=workspace_id,
            user_id=user_id,
            model=resolved_model,
            agent_name=agent_name,
            response=response,
        )

        # LiteLLM ModelResponse has dynamic attributes; use getattr for type safety
        choices = getattr(response, "choices", [])
        usage = getattr(response, "usage", None)
        text = ""
        if choices:
            text = getattr(choices[0].message, "content", "") or ""

        return LLMResponse(
            text=text,
            input_tokens=getattr(usage, "prompt_tokens", 0) or 0 if usage else 0,
            output_tokens=getattr(usage, "completion_tokens", 0) or 0 if usage else 0,
            model=resolved_model,
            raw=response,
        )

    async def embed(
        self,
        *,
        workspace_id: UUID,
        user_id: UUID,
        texts: list[str],
        model: str = "openai/text-embedding-3-large",
        agent_name: str = "llm_gateway",
    ) -> EmbeddingResponse:
        """Generate embeddings via LiteLLM.

        Args:
            workspace_id: Workspace UUID for BYOK key lookup.
            user_id: User UUID who initiated the call.
            texts: List of texts to embed.
            model: LiteLLM model string (default: openai/text-embedding-3-large).
            agent_name: Agent/service name for cost tracking.

        Returns:
            EmbeddingResponse with embedding vectors.

        Raises:
            AINotConfiguredError: If no BYOK API key is configured.
        """
        provider = extract_provider(model)

        api_key = await self._key_storage.get_api_key(workspace_id, provider, "llm")
        if api_key is None:
            raise AINotConfiguredError(workspace_id=workspace_id)

        response = await self._executor.execute(
            provider=provider,
            operation=lambda: litellm.aembedding(
                model=model,
                input=texts,
                api_key=api_key,
            ),
        )

        # Extract embeddings from response (LiteLLM EmbeddingResponse)
        data = getattr(response, "data", [])
        embeddings = [item["embedding"] for item in data]
        usage = getattr(response, "usage", None)
        input_tokens = getattr(usage, "prompt_tokens", 0) or 0 if usage else 0

        return EmbeddingResponse(
            embeddings=embeddings,
            model=model,
            input_tokens=input_tokens,
        )


__all__ = ["EmbeddingResponse", "LLMGateway", "LLMResponse"]
