"""Langfuse wrapper utilities for LLM observability.

Provides lifecycle functions for Langfuse startup/shutdown and
re-exports the @observe decorator for convenience.

No LiteLLM dependency — uses Langfuse directly.
"""

from __future__ import annotations

from pilot_space.infrastructure.logging import get_logger

logger = get_logger(__name__)


def configure_langfuse() -> None:
    """Configure Langfuse for LLM observability.

    Reads LANGFUSE_* env vars (set via Settings / .env).
    Safe to call when Langfuse is not configured (empty keys) --
    the @observe decorator degrades gracefully.
    """
    try:
        logger.info("langfuse_configured", callback_mode="decorator_only")
    except Exception:
        logger.warning("langfuse_configure_failed", exc_info=True)


def flush_langfuse() -> None:
    """Flush pending Langfuse events on shutdown.

    Safe to call when Langfuse is not configured -- catches all errors.
    """
    try:
        from langfuse import Langfuse

        client = Langfuse()
        client.flush()
        logger.info("langfuse_flushed")
    except Exception:
        logger.debug("langfuse_flush_skipped", exc_info=True)


# Re-export observe decorator for convenience.
# Import is deferred to avoid import errors when langfuse is not installed.
try:
    from langfuse.decorators import observe  # pyright: ignore[reportMissingImports]
except ImportError:  # pragma: no cover
    # Provide a no-op fallback so code with @observe doesn't crash
    # if langfuse somehow isn't installed.
    from functools import wraps
    from typing import Any, TypeVar

    _F = TypeVar("_F")

    def observe(**kwargs: Any) -> Any:  # type: ignore[misc]
        """No-op fallback when langfuse is not installed."""

        def decorator(func: _F) -> _F:
            @wraps(func)  # type: ignore[arg-type]
            async def wrapper(*args: Any, **kw: Any) -> Any:
                return await func(*args, **kw)  # type: ignore[misc]

            return wrapper  # type: ignore[return-value]

        return decorator


__all__ = ["configure_langfuse", "flush_langfuse", "observe"]
