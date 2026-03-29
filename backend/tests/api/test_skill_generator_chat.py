"""Tests for POST /api/v1/skills/generator/chat SSE endpoint.

Verifies:
- SSE stream with content_delta, skill_preview, graph_update, done events
- Auth required (no auth returns 401/403)
- Empty message returns 422
- Error handling when no AI provider configured

Phase 058: Dedicated generator chat endpoint.
"""

from __future__ import annotations

import json
from collections.abc import AsyncGenerator
from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from pilot_space.infrastructure.auth import TokenPayload

pytestmark = pytest.mark.asyncio

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

CHAT_URL = "/api/v1/skills/generator/chat"
SAVE_URL = "/api/v1/skills/generator/save"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def test_user_id():
    return uuid4()


@pytest.fixture
def test_workspace_id():
    return uuid4()


@pytest.fixture
def mock_token_payload(test_user_id):
    now = datetime.now(tz=UTC)
    return TokenPayload(
        sub=str(test_user_id),
        email="test@example.com",
        role="authenticated",
        aud="authenticated",
        exp=int(now.timestamp()) + 3600,
        iat=int(now.timestamp()),
    )


@pytest.fixture
def mock_skill_generator_service():
    """Create a mock SkillGeneratorService."""
    return MagicMock()


@pytest.fixture
async def generator_client(
    test_user_id,
    test_workspace_id,
    mock_token_payload,
    mock_skill_generator_service,
) -> AsyncGenerator[AsyncClient, None]:
    """HTTP client with auth + workspace header + mocked dependencies."""
    from pilot_space.api.v1.dependencies import _get_skill_generator_service
    from pilot_space.dependencies.auth import get_current_user, get_session
    from pilot_space.dependencies.workspace import (
        get_current_workspace_id,
        require_header_workspace_member,
    )
    from pilot_space.main import app

    # Mock DB session
    mock_session = AsyncMock()

    # Override auth and workspace deps
    app.dependency_overrides[get_current_user] = lambda: mock_token_payload
    app.dependency_overrides[get_session] = lambda: mock_session
    app.dependency_overrides[get_current_workspace_id] = lambda: test_workspace_id
    app.dependency_overrides[require_header_workspace_member] = lambda: test_workspace_id
    app.dependency_overrides[_get_skill_generator_service] = (
        lambda: mock_skill_generator_service
    )

    transport = ASGITransport(app=app)  # type: ignore[arg-type]
    try:
        async with AsyncClient(
            transport=transport,
            base_url="http://test",
            headers={
                "Authorization": "Bearer test-token",
                "X-Workspace-ID": str(test_workspace_id),
            },
        ) as ac:
            yield ac
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_session, None)
        app.dependency_overrides.pop(get_current_workspace_id, None)
        app.dependency_overrides.pop(require_header_workspace_member, None)
        app.dependency_overrides.pop(_get_skill_generator_service, None)


@pytest.fixture
async def unauthenticated_client() -> AsyncGenerator[AsyncClient, None]:
    """HTTP client without auth headers."""
    from pilot_space.main import app

    transport = ASGITransport(app=app)  # type: ignore[arg-type]
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


async def test_chat_returns_sse_stream(
    generator_client: AsyncClient,
    mock_skill_generator_service: MagicMock,
) -> None:
    """POST /skills/generator/chat returns 200 with SSE content-type."""

    async def _mock_stream(**kwargs: Any) -> AsyncGenerator[str, None]:
        yield 'event: content_delta\ndata: {"content": "Hello", "isPartial": false}\n\n'
        yield 'event: done\ndata: {"sessionId": "abc"}\n\n'

    mock_skill_generator_service.generate_chat_response = MagicMock(
        return_value=_mock_stream()
    )

    response = await generator_client.post(
        CHAT_URL,
        json={"message": "create a skill that reviews React code"},
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")


async def test_chat_sse_event_format(
    generator_client: AsyncClient,
    mock_skill_generator_service: MagicMock,
) -> None:
    """SSE stream contains properly formatted event: and data: lines."""

    async def _mock_stream(**kwargs: Any) -> AsyncGenerator[str, None]:
        yield 'event: content_delta\ndata: {"content": "skill text", "isPartial": false}\n\n'
        yield (
            'event: skill_preview\ndata: {"name": "Test", "description": "",'
            ' "skillContent": "# Test", "category": "general", "icon": "Wand2"}\n\n'
        )
        yield 'event: graph_update\ndata: {"operation": "add_node", "payload": {"id": "1"}}\n\n'
        yield 'event: done\ndata: {"sessionId": "test-session"}\n\n'

    mock_skill_generator_service.generate_chat_response = MagicMock(
        return_value=_mock_stream()
    )

    response = await generator_client.post(
        CHAT_URL,
        json={"message": "create a React review skill"},
    )

    body = response.text
    assert "event: content_delta" in body
    assert "event: skill_preview" in body
    assert "event: graph_update" in body
    assert "event: done" in body


async def test_chat_empty_message_returns_422(generator_client: AsyncClient) -> None:
    """POST /skills/generator/chat with empty message returns 422."""
    response = await generator_client.post(
        CHAT_URL,
        json={"message": ""},
    )
    assert response.status_code == 422


async def test_chat_no_auth_returns_error(unauthenticated_client: AsyncClient) -> None:
    """POST /skills/generator/chat without auth returns 401 or 403."""
    response = await unauthenticated_client.post(
        CHAT_URL,
        json={"message": "create a skill"},
    )
    # Without auth, may return 400 (missing header), 401, or 403
    assert response.status_code in (400, 401, 403)


async def test_chat_no_provider_emits_error_event(
    generator_client: AsyncClient,
    mock_skill_generator_service: MagicMock,
) -> None:
    """When no LLM provider configured, emit error SSE event gracefully."""

    async def _mock_stream(**kwargs: Any) -> AsyncGenerator[str, None]:
        yield (
            'event: error\ndata: {"message": "No AI provider configured.'
            ' Please configure an AI provider in Settings."}\n\n'
        )

    mock_skill_generator_service.generate_chat_response = MagicMock(
        return_value=_mock_stream()
    )

    response = await generator_client.post(
        CHAT_URL,
        json={"message": "create a skill"},
    )

    assert response.status_code == 200
    body = response.text
    assert "event: error" in body
    assert "No AI provider configured" in body


async def test_save_endpoint_still_works(
    generator_client: AsyncClient,
    mock_skill_generator_service: MagicMock,
) -> None:
    """POST /skills/generator/save regression: endpoint still accessible."""
    from pilot_space.application.services.skill.skill_generator_service import (
        SkillSaveResult,
    )

    mock_skill_generator_service.save_skill = AsyncMock(
        return_value=SkillSaveResult(
            skill_id=uuid4(),
            skill_name="Test Skill",
            save_type="personal",
        )
    )

    response = await generator_client.post(
        SAVE_URL,
        json={
            "sessionId": str(uuid4()),
            "saveType": "personal",
            "name": "Test Skill",
            "skillContent": "# Test\nContent",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["skillName"] == "Test Skill"
