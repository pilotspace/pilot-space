"""Shared async Supabase client singleton.

Provides a module-level cached async Supabase client used by both the storage
and queue infrastructure clients. Using a module-level cache avoids async
factory complications with the dependency-injector Singleton provider while
ensuring a single SDK client instance is reused across the application.

Usage::

    from pilot_space.infrastructure.supabase_client import get_supabase_client

    client = await get_supabase_client()
    # client.storage, client.postgrest, etc.
"""

from __future__ import annotations

import asyncio

from supabase import AsyncClient, acreate_client

from pilot_space.config import get_settings
from pilot_space.infrastructure.logging import get_logger

logger = get_logger(__name__)

_client: AsyncClient | None = None
_lock = asyncio.Lock()


async def get_supabase_client() -> AsyncClient:
    """Return the shared async Supabase client, initialising it on first call.

    The client is initialised once and cached for the lifetime of the process.
    It uses the service role key so callers have full Supabase access; access
    control decisions must be enforced by the application layer.

    Returns:
        The shared ``AsyncClient`` instance.

    Raises:
        RuntimeError: If ``SUPABASE_URL`` or ``SUPABASE_SERVICE_KEY`` are not
            configured in settings.
    """
    global _client  # noqa: PLW0603

    if _client is not None:
        return _client

    async with _lock:
        # Double-check after acquiring lock
        if _client is not None:
            return _client

        settings = get_settings()
        url = settings.supabase_url
        key = settings.supabase_service_key.get_secret_value()

        if not url or not key:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_SERVICE_KEY must be configured to use "
                "the Supabase SDK client."
            )

        logger.info("supabase_client_init", supabase_url=url)
        _client = await acreate_client(url, key)
        return _client


def reset_supabase_client() -> None:
    """Reset the shared client (for testing only)."""
    global _client  # noqa: PLW0603
    _client = None


__all__ = ["get_supabase_client", "reset_supabase_client"]
