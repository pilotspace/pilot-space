"""Request context middleware for workspace and correlation ID extraction.

Extracts common request context (workspace_id, correlation_id) from headers
and stores them in request.state for use by dependencies.

Also integrates with structured logging to inject context into all logs.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from starlette.middleware.base import (
    BaseHTTPMiddleware,
    RequestResponseEndpoint,
)
from starlette.responses import Response


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Middleware to extract and store request context."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        """Extract workspace_id and correlation_id from headers.

        Args:
            request: Incoming request.
            call_next: Next middleware in chain.

        Returns:
            Response with correlation ID header.
        """
        # Extract workspace ID from headers
        workspace_id_str = request.headers.get("X-Workspace-ID") or request.headers.get(
            "X-Workspace-Id"
        )

        workspace_id: uuid.UUID | None = None
        if workspace_id_str:
            try:
                workspace_id = uuid.UUID(workspace_id_str)
                request.state.workspace_id = workspace_id
            except ValueError:
                request.state.workspace_id = None
        else:
            request.state.workspace_id = None

        # Extract or generate correlation ID
        correlation_id = request.headers.get("X-Correlation-ID")
        if not correlation_id:
            correlation_id = str(uuid.uuid4())
        request.state.correlation_id = correlation_id

        # Generate unique request ID for this specific request
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id

        # Extract user ID if available (set by auth middleware)
        user_id: uuid.UUID | None = None
        if hasattr(request.state, "user") and request.state.user:
            user_id = request.state.user.user_id

        # Set structured logging context
        try:
            from pilot_space.infrastructure.logging import set_request_context

            set_request_context(
                request_id=request_id,
                workspace_id=str(workspace_id) if workspace_id else None,
                user_id=str(user_id) if user_id else None,
                correlation_id=correlation_id,
            )
        except ImportError:
            # Graceful fallback if logging module not available (during tests)
            pass

        try:
            response = await call_next(request)
        finally:
            # Clear structured logging context after request
            try:
                from pilot_space.infrastructure.logging import clear_request_context

                clear_request_context()
            except ImportError:
                pass

        # Add correlation ID to response headers for tracing
        response.headers["X-Correlation-ID"] = correlation_id
        response.headers["X-Request-ID"] = request_id

        return response


def get_workspace_id(request: Request) -> uuid.UUID:
    """Dependency to get workspace ID from request state.

    Args:
        request: FastAPI request.

    Returns:
        Workspace UUID from request state.

    Raises:
        HTTPException: If workspace ID is not set or invalid.
    """
    workspace_id = getattr(request.state, "workspace_id", None)
    if workspace_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Workspace-ID header required",
        )
    return workspace_id


def get_correlation_id(request: Request) -> str:
    """Dependency to get correlation ID from request state.

    Args:
        request: FastAPI request.

    Returns:
        Correlation ID string from request state.
    """
    return getattr(request.state, "correlation_id", str(uuid.uuid4()))


# Type aliases for dependency injection
WorkspaceId = Annotated[uuid.UUID, Depends(get_workspace_id)]
CorrelationId = Annotated[str, Depends(get_correlation_id)]


__all__ = [
    "CorrelationId",
    "RequestContextMiddleware",
    "WorkspaceId",
    "get_correlation_id",
    "get_workspace_id",
]
