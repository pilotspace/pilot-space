"""Post-call cost tracking hook for LLMGateway.

Accepts pre-extracted token counts and delegates to CostTracker for
persistent cost recording. Failures are logged but never propagated.
"""

from __future__ import annotations

from typing import TYPE_CHECKING
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
    input_tokens: int,
    output_tokens: int = 0,
) -> None:
    """Track cost for an LLM completion call.

    Args:
        cost_tracker: CostTracker instance for DB persistence.
        workspace_id: Workspace UUID for billing.
        user_id: User UUID who initiated the call.
        model: Model string (e.g., "anthropic/claude-sonnet-4-20250514").
        agent_name: Name of the agent/service making the call.
        input_tokens: Number of input tokens consumed.
        output_tokens: Number of output tokens generated.
    """
    try:
        provider = extract_provider(model)
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
