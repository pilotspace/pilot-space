"""Post-call cost tracking hook for LLMGateway.

Extracts token usage from LiteLLM ModelResponse and delegates to
CostTracker for persistent cost recording. Failures are logged
but never propagated to the caller.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any
from uuid import UUID

from pilot_space.ai.proxy.provider_config import extract_provider
from pilot_space.infrastructure.logging import get_logger

if TYPE_CHECKING:
    from pilot_space.ai.infrastructure.cost_tracker import CostTracker

logger = get_logger(__name__)


async def track_llm_cost(
    cost_tracker: CostTracker,
    *,
    workspace_id: UUID,
    user_id: UUID,
    model: str,
    agent_name: str,
    response: Any,
) -> None:
    """Track cost for an LLM completion call.

    Extracts usage from a LiteLLM ModelResponse and persists via CostTracker.
    Wraps in try/except so cost tracking failures never crash the caller.

    Args:
        cost_tracker: CostTracker instance for DB persistence.
        workspace_id: Workspace UUID for billing.
        user_id: User UUID who initiated the call.
        model: LiteLLM model string (e.g., "anthropic/claude-sonnet-4-20250514").
        agent_name: Name of the agent/service making the call.
        response: LiteLLM ModelResponse with usage data.
    """
    try:
        usage = getattr(response, "usage", None)
        input_tokens = getattr(usage, "prompt_tokens", 0) or 0 if usage else 0
        output_tokens = getattr(usage, "completion_tokens", 0) or 0 if usage else 0

        provider = extract_provider(model)
        # Strip provider prefix for CostTracker (it expects bare model name)
        bare_model = model.split("/", 1)[-1] if "/" in model else model

        await cost_tracker.track(
            workspace_id=workspace_id,
            user_id=user_id,
            agent_name=agent_name,
            provider=provider,
            model=bare_model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
        )
    except Exception:
        logger.warning(
            "track_llm_cost_failed",
            model=model,
            agent_name=agent_name,
            exc_info=True,
        )


__all__ = ["track_llm_cost"]
