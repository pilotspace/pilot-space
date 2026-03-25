"""Anthropic-compatible LLM proxy endpoint.

Implements the Anthropic Messages API contract so that Claude Agent SDK
(and any Anthropic-compatible client) can route through the built-in
LLMGateway instead of calling the provider directly.

Flow:
    Claude Agent SDK → ANTHROPIC_BASE_URL=http://localhost:8000/api/v1/ai/proxy
    → POST /v1/messages → this proxy → LLMGateway → real provider

Benefits:
    - Unified cost tracking for ALL LLM calls (including SDK orchestration)
    - Resilience (retry + circuit breaker) on SDK calls
    - Langfuse @observe tracing on SDK calls
    - Workspace base_url forwarding (Ollama/custom proxy)
    - Per-API-key client pooling

The proxy is transparent: the SDK doesn't know it's talking to a proxy.
Auth is via the same API key the SDK sends in the Authorization header.

Design Decision: The proxy implements ONLY the Messages API (POST /v1/messages)
and streaming variant. Embeddings and other endpoints are not needed since the
SDK only uses the Messages API.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Header, Request
from fastapi.responses import StreamingResponse

from pilot_space.ai.exceptions import AINotConfiguredError
from pilot_space.ai.proxy.cost_hooks import track_llm_cost
from pilot_space.ai.proxy.tracing import observe  # pyright: ignore[reportAttributeAccessIssue]
from pilot_space.infrastructure.logging import get_logger

router = APIRouter(tags=["ai-proxy"])

logger = get_logger(__name__)

# Sentinel for when workspace context isn't available
_SYSTEM_USER_ID = UUID("00000000-0000-0000-0000-000000000000")


async def _resolve_proxy_deps(
    request: Request,
) -> tuple[Any, Any, Any]:
    """Resolve DI dependencies for the proxy endpoint.

    Returns (resilient_executor, cost_tracker, key_storage) from the DI container.
    """
    from pilot_space.container.container import Container

    container: Container = request.app.state.container  # type: ignore[assignment]
    return (
        container.resilient_executor(),
        container.cost_tracker(),
        container.secure_key_storage(),
    )


@router.post("/v1/messages")
@observe(name="ai_proxy.messages")  # type: ignore[misc]
async def proxy_messages(
    request: Request,
    x_workspace_id: str | None = Header(None, alias="X-Workspace-Id"),
    x_user_id: str | None = Header(None, alias="X-User-Id"),
) -> StreamingResponse:
    """Anthropic Messages API proxy.

    Accepts the same request format as Anthropic's POST /v1/messages,
    forwards through the built-in LLMGateway infrastructure (resilience,
    cost tracking, tracing), and returns the response transparently.

    The SDK sends the API key in the Authorization header. The proxy
    extracts it and uses it directly (no SecureKeyStorage lookup needed
    since the SDK already resolved the workspace key).

    Custom headers:
        X-Workspace-Id: Workspace UUID for cost attribution
        X-User-Id: User UUID for cost attribution
    """
    import hashlib

    import anthropic

    # Extract API key from Authorization header (Anthropic SDK sends "x-api-key" header)
    api_key = request.headers.get("x-api-key") or ""
    if not api_key:
        # Fallback: check Authorization: Bearer <key>
        auth = request.headers.get("authorization", "")
        if auth.startswith("Bearer "):
            api_key = auth[7:]

    if not api_key:
        raise AINotConfiguredError(
            workspace_id=UUID(x_workspace_id) if x_workspace_id else None
        )

    body = await request.json()
    model: str = body.get("model", "claude-sonnet-4-20250514")
    messages: list[dict[str, Any]] = body.get("messages", [])
    max_tokens: int = body.get("max_tokens", 1024)
    temperature: float = body.get("temperature", 1.0)
    system_msg: str | list[Any] | None = body.get("system")
    stream: bool = body.get("stream", False)

    # Parse workspace/user context for cost tracking
    workspace_id = UUID(x_workspace_id) if x_workspace_id else None
    user_id = UUID(x_user_id) if x_user_id else _SYSTEM_USER_ID

    # Resolve infrastructure
    executor, cost_tracker, key_storage = await _resolve_proxy_deps(request)

    # Look up workspace base_url (if workspace context available)
    base_url: str | None = None
    if workspace_id and key_storage:
        try:
            key_info = await key_storage.get_key_info(workspace_id, "anthropic", "llm")
            if key_info:
                base_url = key_info.base_url
        except Exception:
            logger.debug("ai_proxy_key_info_lookup_failed", exc_info=True)

    # Build client with connection pooling (same pattern as LLMGateway)
    key_hash = hashlib.sha256(
        f"{api_key}:{base_url or ''}".encode()
    ).hexdigest()[:16]

    # Cache clients on the app state to avoid TCP pool churn
    proxy_clients_attr = "proxy_anthropic_clients"
    if not hasattr(request.app.state, proxy_clients_attr):
        setattr(request.app.state, proxy_clients_attr, {})

    clients: dict[str, anthropic.AsyncAnthropic] = getattr(request.app.state, proxy_clients_attr)
    if key_hash not in clients:
        kwargs: dict[str, Any] = {"api_key": api_key}
        if base_url:
            kwargs["base_url"] = base_url
        clients[key_hash] = anthropic.AsyncAnthropic(**kwargs)
    client = clients[key_hash]

    # Build kwargs for messages.create
    create_kwargs: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
    }
    if temperature != 1.0:
        create_kwargs["temperature"] = temperature
    if system_msg is not None:
        create_kwargs["system"] = system_msg
    if stream:
        create_kwargs["stream"] = True

    # Pass through additional Anthropic-specific params
    for key in ("top_p", "top_k", "stop_sequences", "metadata", "tools",
                "tool_choice", "thinking"):
        if key in body:
            create_kwargs[key] = body[key]

    logger.info(
        "ai_proxy_request",
        model=model,
        stream=stream,
        workspace_id=str(workspace_id) if workspace_id else None,
        has_base_url=bool(base_url),
        message_count=len(messages),
    )

    if stream:
        return await _handle_streaming(
            client=client,
            create_kwargs=create_kwargs,
            executor=executor,
            cost_tracker=cost_tracker,
            workspace_id=workspace_id,
            user_id=user_id,
            model=model,
        )

    # Non-streaming path
    response = await executor.execute(
        provider="anthropic",
        operation=lambda: client.messages.create(**create_kwargs),
    )

    # Track cost
    if workspace_id and cost_tracker:
        await track_llm_cost(
            cost_tracker,
            workspace_id=workspace_id,
            user_id=user_id,
            model=f"anthropic/{model}",
            agent_name="ai_proxy",
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
        )

    logger.info(
        "ai_proxy_response",
        model=model,
        input_tokens=response.usage.input_tokens,
        output_tokens=response.usage.output_tokens,
    )

    # Return the raw Anthropic response (SDK expects exact format)
    return StreamingResponse(
        iter([response.model_dump_json()]),
        media_type="application/json",
        headers={"content-type": "application/json"},
    )


async def _handle_streaming(
    *,
    client: Any,
    create_kwargs: dict[str, Any],
    executor: Any,
    cost_tracker: Any,
    workspace_id: UUID | None,
    user_id: UUID,
    model: str,
) -> StreamingResponse:
    """Handle streaming Messages API response.

    Forwards SSE events from the Anthropic API transparently, tracking
    cost from the final message_delta event.
    """

    async def _stream_generator() -> AsyncIterator[str]:
        total_input_tokens = 0
        total_output_tokens = 0

        try:
            stream = await executor.execute(
                provider="anthropic",
                operation=lambda: client.messages.create(**create_kwargs),
            )

            async for event in stream:
                # Track token usage from stream events
                event_data = event.model_dump() if hasattr(event, "model_dump") else {}
                event_type = getattr(event, "type", "")

                if event_type == "message_start":
                    usage = event_data.get("message", {}).get("usage", {})
                    total_input_tokens = usage.get("input_tokens", 0)

                if event_type == "message_delta":
                    usage = event_data.get("usage", {})
                    total_output_tokens = usage.get("output_tokens", 0)

                # Forward the SSE event transparently
                yield f"event: {event_type}\ndata: {json.dumps(event_data)}\n\n"

        except Exception as e:
            error_data = {
                "type": "error",
                "error": {"type": "api_error", "message": str(e)},
            }
            yield f"event: error\ndata: {json.dumps(error_data)}\n\n"
        finally:
            # Track cost after stream completes
            if workspace_id and cost_tracker and (total_input_tokens or total_output_tokens):
                try:
                    await track_llm_cost(
                        cost_tracker,
                        workspace_id=workspace_id,
                        user_id=user_id,
                        model=f"anthropic/{model}",
                        agent_name="ai_proxy",
                        input_tokens=total_input_tokens,
                        output_tokens=total_output_tokens,
                    )
                except Exception:
                    logger.debug("ai_proxy_stream_cost_tracking_failed", exc_info=True)

            logger.info(
                "ai_proxy_stream_complete",
                model=model,
                input_tokens=total_input_tokens,
                output_tokens=total_output_tokens,
            )

    return StreamingResponse(
        _stream_generator(),
        media_type="text/event-stream",
        headers={
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            "connection": "keep-alive",
        },
    )
