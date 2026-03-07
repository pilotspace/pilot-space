"""Session recording middleware for workspace session tracking (AUTH-06).

Records authenticated requests as workspace sessions with throttling and
revocation-checking via Redis keys.

Design decisions:
- Session recording is fire-and-forget (asyncio.create_task) to not block requests
- Recording failures NEVER break the request path
- Revocation check IS blocking (must return 401 before handler runs)
- Throttle: 60s window via session:lastseen:{token_hash} key
- Revocation: checked via session:revoked:{workspace_id}:{token_hash} key
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import re
from typing import TYPE_CHECKING
from uuid import UUID

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

if TYPE_CHECKING:
    from pilot_space.infrastructure.cache.redis import RedisClient

logger = logging.getLogger(__name__)

# Redis key templates (must match session_service.py)
_REVOKED_KEY_TEMPLATE = "session:revoked:{workspace_id}:{token_hash}"
_LASTSEEN_KEY_TEMPLATE = "session:lastseen:{token_hash}"

# Regex to extract workspace slug from path, e.g. /api/v1/workspaces/{slug}/...
_WORKSPACE_SLUG_RE = re.compile(r"/workspaces/([^/]+)/")


class SessionRecordingMiddleware(BaseHTTPMiddleware):
    """Middleware that records workspace sessions and checks revocation.

    Runs on every request. Checks if the session token has been revoked
    (blocking) and schedules a session recording task (non-blocking).

    Args:
        app: ASGI application.
        redis: RedisClient instance for key checks.
        session_factory: SQLAlchemy session factory for DB writes.
        workspace_repo: WorkspaceRepository factory for slug lookup.
    """

    def __init__(
        self,
        app,  # type: ignore[no-untyped-def]
        *,
        redis: RedisClient,
        session_factory: object,
    ) -> None:
        """Initialize middleware.

        Args:
            app: ASGI application.
            redis: Redis client for throttle and revocation key checks.
            session_factory: SQLAlchemy async session factory for DB writes.
        """
        super().__init__(app)
        self._redis = redis
        self._session_factory = session_factory

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        """Process request: check revocation, schedule session recording.

        Args:
            request: Incoming HTTP request.
            call_next: Next middleware/handler in chain.

        Returns:
            Response — 401 if session revoked, otherwise pass-through.
        """
        # Extract Bearer token — skip session logic if not present
        token = _extract_bearer_token(request)
        if token is None:
            return await call_next(request)

        token_hash = hashlib.sha256(token.encode()).hexdigest()

        # Extract workspace_id from path (if available)
        workspace_id = _extract_workspace_id_from_state(request)

        # ── Revocation check (blocking — must 401 before handler runs) ──────
        if workspace_id is not None:
            revoked_key = _REVOKED_KEY_TEMPLATE.format(
                workspace_id=workspace_id,
                token_hash=token_hash,
            )
            try:
                is_revoked = await self._redis.get_raw(revoked_key)
                if is_revoked is not None:
                    return JSONResponse(
                        {"detail": "Session has been revoked"},
                        status_code=401,
                    )
            except Exception:
                # Redis error — fail open (do not block the request)
                logger.warning("Redis revocation check failed — proceeding without check")

        # ── Continue to handler ───────────────────────────────────────────────
        response = await call_next(request)

        # ── Session recording (fire-and-forget, never blocks) ─────────────────
        user_id = _extract_user_id(request)
        if user_id is not None and workspace_id is not None:
            ip_address = _extract_ip(request)
            user_agent = request.headers.get("User-Agent")

            asyncio.create_task(  # noqa: RUF006
                _record_session_safe(
                    redis=self._redis,
                    session_factory=self._session_factory,
                    token_hash=token_hash,
                    user_id=user_id,
                    workspace_id=workspace_id,
                    ip_address=ip_address,
                    user_agent=user_agent,
                )
            )

        return response


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _extract_bearer_token(request: Request) -> str | None:
    """Extract Bearer token from Authorization header.

    Args:
        request: Incoming request.

    Returns:
        Token string or None if not present.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header[len("Bearer ") :]
    return token if token else None


def _extract_workspace_id_from_state(request: Request) -> UUID | None:
    """Extract workspace_id from request state (set by RequestContextMiddleware).

    Falls back to parsing the path for workspace slug (requires DB lookup
    which we skip here to keep middleware non-blocking — the revocation check
    uses the workspace_id if available from headers).

    Args:
        request: Incoming request.

    Returns:
        Workspace UUID or None.
    """
    return getattr(request.state, "workspace_id", None)


def _extract_user_id(request: Request) -> UUID | None:
    """Extract user_id from request state (set by auth dependency or middleware).

    Args:
        request: Incoming request.

    Returns:
        User UUID or None.
    """
    user = getattr(request.state, "user", None)
    if user is not None:
        return getattr(user, "user_id", None)
    return None


def _extract_ip(request: Request) -> str | None:
    """Extract client IP from X-Forwarded-For header or request.client.

    Args:
        request: Incoming request.

    Returns:
        IP address string or None.
    """
    xff = request.headers.get("X-Forwarded-For")
    if xff:
        # Take the leftmost (original client) IP from the chain
        return xff.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


async def _record_session_safe(
    *,
    redis: RedisClient,
    session_factory: object,
    token_hash: str,
    user_id: UUID,
    workspace_id: UUID,
    ip_address: str | None,
    user_agent: str | None,
) -> None:
    """Record session with throttle check — gracefully handles all errors.

    This is called as a fire-and-forget task. Any exception is caught and
    logged so session recording NEVER breaks the request path.

    Args:
        redis: Redis client.
        session_factory: SQLAlchemy async session factory.
        token_hash: SHA-256 hex digest of the token.
        user_id: User UUID.
        workspace_id: Workspace UUID.
        ip_address: Client IP.
        user_agent: User-Agent header value.
    """
    try:
        lastseen_key = _LASTSEEN_KEY_TEMPLATE.format(token_hash=token_hash)
        throttled = await redis.get_raw(lastseen_key)
        if throttled is not None:
            return  # Within 60s throttle window

        # Open a DB session for the upsert
        from pilot_space.infrastructure.database.repositories.workspace_session_repository import (
            WorkspaceSessionRepository,
        )

        async with session_factory() as db_session, db_session.begin():  # type: ignore[operator]
            repo = WorkspaceSessionRepository(db_session)
            await repo.upsert_session(
                user_id=user_id,
                workspace_id=workspace_id,
                token_hash=token_hash,
                ip_address=ip_address,
                user_agent=user_agent,
                db=db_session,
            )

        # Refresh throttle key after successful write
        await redis.setex(lastseen_key, 60, "1")

    except Exception:
        logger.debug(
            "Session recording failed for user %s workspace %s — non-fatal",
            user_id,
            workspace_id,
            exc_info=True,
        )
