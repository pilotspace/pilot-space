"""Unified LLM proxy layer using LiteLLM with Langfuse observability.

Provides a single entry point (LLMGateway) for all AI completions,
replacing scattered direct provider SDK calls with a provider-agnostic
abstraction that wraps every call with ResilientExecutor, auto-tracks
costs, and emits Langfuse traces.
"""

from pilot_space.ai.proxy.llm_gateway import EmbeddingResponse, LLMGateway, LLMResponse

__all__ = ["EmbeddingResponse", "LLMGateway", "LLMResponse"]
