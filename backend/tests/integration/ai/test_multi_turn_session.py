"""Integration tests for multi-turn conversation session persistence.

Tests session management across multiple conversation turns:
- Session creation on first message
- Session resumption with conversation history
- Redis persistence and TTL
- Session expiration handling

Architecture tested:
- PilotSpaceAgent: Main conversational agent
- SessionHandler: Manages conversation sessions
- SessionManager: Redis storage for sessions
- SessionStore: Dual Redis/PostgreSQL persistence

Reference:
- backend/src/pilot_space/ai/session/session_manager.py
- backend/src/pilot_space/ai/sdk/session_handler.py
- backend/src/pilot_space/ai/sdk/session_store.py
"""

from __future__ import annotations

import asyncio
import os
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest

from pilot_space.ai.sdk.session_handler import (
    ConversationSession,
    SessionHandler,
)
from pilot_space.ai.sdk.session_store import SessionStore
from pilot_space.ai.session.session_manager import (
    SESSION_TTL_SECONDS,
    AIMessage,
    SessionExpiredError,
    SessionManager,
    SessionNotFoundError,
)

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


class TestSessionCreation:
    """Test suite for session creation behavior."""

    @pytest.mark.asyncio
    async def test_creates_session_on_first_message(
        self,
        redis_cache: dict[str, dict],
    ) -> None:
        """Test session is created with unique session_id on first message.

        Verifies:
        - New session created with unique UUID
        - Session stored in Redis
        - Initial metadata populated correctly
        - TTL set on Redis key
        """
        # Arrange
        mock_redis = MagicMock()

        # Configure in-memory cache behavior
        async def mock_get(key: str) -> dict | None:
            return redis_cache.get(key)

        async def mock_set(key: str, value: dict, ttl: int = 1800) -> bool:
            redis_cache[key] = value
            return True

        mock_redis.get = AsyncMock(side_effect=mock_get)
        mock_redis.set = AsyncMock(side_effect=mock_set)
        mock_redis.expire = AsyncMock(return_value=True)

        session_manager = SessionManager(redis=mock_redis)

        user_id = uuid4()
        workspace_id = uuid4()
        agent_name = "pilotspace_agent"

        # Act - Create new session
        session = await session_manager.create_session(
            user_id=user_id,
            workspace_id=workspace_id,
            agent_name=agent_name,
            initial_context={"note_id": str(uuid4())},
        )

        # Assert
        assert isinstance(session.id, UUID)
        assert session.user_id == user_id
        assert session.workspace_id == workspace_id
        assert session.agent_name == agent_name
        assert session.turn_count == 0
        assert len(session.messages) == 0
        assert session.total_cost_usd == 0.0

        # Verify Redis storage
        session_key = f"ai_session:{session.id}"
        assert session_key in redis_cache
        stored_data = redis_cache[session_key]
        assert stored_data["id"] == str(session.id)
        assert stored_data["agent_name"] == agent_name

    @pytest.mark.asyncio
    async def test_creates_unique_session_ids(
        self,
        redis_cache: dict[str, dict],
    ) -> None:
        """Test each session gets unique identifier.

        Verifies:
        - Multiple sessions have different IDs
        - Sessions are independently stored
        - No collision in Redis keys
        """
        # Arrange
        mock_redis = MagicMock()

        async def mock_get(key: str) -> dict | None:
            return redis_cache.get(key)

        async def mock_set(key: str, value: dict, ttl: int = 1800) -> bool:
            redis_cache[key] = value
            return True

        mock_redis.get = AsyncMock(side_effect=mock_get)
        mock_redis.set = AsyncMock(side_effect=mock_set)
        mock_redis.expire = AsyncMock(return_value=True)

        session_manager = SessionManager(redis=mock_redis)

        user_id = uuid4()
        workspace_id = uuid4()

        # Act - Create two sessions
        session1 = await session_manager.create_session(
            user_id=user_id,
            workspace_id=workspace_id,
            agent_name="agent_1",
        )

        session2 = await session_manager.create_session(
            user_id=user_id,
            workspace_id=workspace_id,
            agent_name="agent_2",
        )

        # Assert
        assert session1.id != session2.id
        assert f"ai_session:{session1.id}" in redis_cache
        assert f"ai_session:{session2.id}" in redis_cache


class TestSessionResumption:
    """Test suite for session resumption across messages."""

    @pytest.mark.asyncio
    async def test_resumes_session_with_preserved_history(
        self,
        redis_cache: dict[str, dict],
    ) -> None:
        """Test session is resumed with conversation history on second message.

        Verifies:
        - Session retrieved by session_id
        - Previous messages preserved
        - Turn count incremented
        - Updated timestamp reflects new activity
        """
        # Arrange
        mock_redis = MagicMock()

        async def mock_get(key: str) -> dict | None:
            return redis_cache.get(key)

        async def mock_set(key: str, value: dict, ttl: int = 1800) -> bool:
            redis_cache[key] = value
            return True

        async def mock_expire(key: str, ttl: int) -> bool:
            return True

        mock_redis.get = AsyncMock(side_effect=mock_get)
        mock_redis.set = AsyncMock(side_effect=mock_set)
        mock_redis.expire = AsyncMock(side_effect=mock_expire)

        session_manager = SessionManager(redis=mock_redis)

        user_id = uuid4()
        workspace_id = uuid4()

        # Create initial session with first message
        session = await session_manager.create_session(
            user_id=user_id,
            workspace_id=workspace_id,
            agent_name="pilotspace_agent",
        )

        first_message = AIMessage(
            role="user",
            content="What is Python?",
            tokens=10,
        )

        await session_manager.update_session(
            session_id=session.id,
            message=first_message,
        )

        # Act - Resume session and add second message
        resumed_session = await session_manager.get_session(session.id)

        second_message = AIMessage(
            role="user",
            content="Tell me more about FastAPI",
            tokens=12,
        )

        updated_session = await session_manager.update_session(
            session_id=resumed_session.id,
            message=second_message,
        )

        # Assert
        assert updated_session.id == session.id
        assert len(updated_session.messages) == 2
        assert updated_session.messages[0].content == "What is Python?"
        assert updated_session.messages[1].content == "Tell me more about FastAPI"
        assert updated_session.turn_count == 2

    @pytest.mark.asyncio
    async def test_preserves_context_across_turns(
        self,
        redis_cache: dict[str, dict],
    ) -> None:
        """Test session context is preserved across conversation turns.

        Verifies:
        - Initial context retained
        - Context updates merged correctly
        - Context available in resumed session
        """
        # Arrange
        mock_redis = MagicMock()

        async def mock_get(key: str) -> dict | None:
            return redis_cache.get(key)

        async def mock_set(key: str, value: dict, ttl: int = 1800) -> bool:
            redis_cache[key] = value
            return True

        async def mock_expire(key: str, ttl: int) -> bool:
            return True

        mock_redis.get = AsyncMock(side_effect=mock_get)
        mock_redis.set = AsyncMock(side_effect=mock_set)
        mock_redis.expire = AsyncMock(side_effect=mock_expire)

        session_manager = SessionManager(redis=mock_redis)

        user_id = uuid4()
        workspace_id = uuid4()
        note_id = uuid4()

        # Create session with initial context
        session = await session_manager.create_session(
            user_id=user_id,
            workspace_id=workspace_id,
            agent_name="pilotspace_agent",
            initial_context={"note_id": str(note_id), "mode": "editing"},
        )

        # Update with additional context
        await session_manager.update_session(
            session_id=session.id,
            message=AIMessage(role="user", content="Test"),
            context_update={"selected_text": "Python is great"},
        )

        # Act - Resume and verify context
        resumed_session = await session_manager.get_session(session.id)

        # Assert
        assert resumed_session.context["note_id"] == str(note_id)
        assert resumed_session.context["mode"] == "editing"
        assert resumed_session.context["selected_text"] == "Python is great"

    @pytest.mark.asyncio
    async def test_accumulates_cost_across_turns(
        self,
        redis_cache: dict[str, dict],
    ) -> None:
        """Test session cost accumulates across multiple turns.

        Verifies:
        - Cost starts at 0.0
        - Each turn adds to total cost
        - Cost persists across session resumption
        """
        # Arrange
        mock_redis = MagicMock()

        async def mock_get(key: str) -> dict | None:
            return redis_cache.get(key)

        async def mock_set(key: str, value: dict, ttl: int = 1800) -> bool:
            redis_cache[key] = value
            return True

        async def mock_expire(key: str, ttl: int) -> bool:
            return True

        mock_redis.get = AsyncMock(side_effect=mock_get)
        mock_redis.set = AsyncMock(side_effect=mock_set)
        mock_redis.expire = AsyncMock(side_effect=mock_expire)

        session_manager = SessionManager(redis=mock_redis)

        user_id = uuid4()
        workspace_id = uuid4()

        # Create session
        session = await session_manager.create_session(
            user_id=user_id,
            workspace_id=workspace_id,
            agent_name="pilotspace_agent",
        )

        # First turn with cost
        await session_manager.update_session(
            session_id=session.id,
            message=AIMessage(role="user", content="First message"),
            cost_delta=0.005,
        )

        # Second turn with cost
        await session_manager.update_session(
            session_id=session.id,
            message=AIMessage(role="user", content="Second message"),
            cost_delta=0.007,
        )

        # Act - Resume and verify cost
        resumed_session = await session_manager.get_session(session.id)

        # Assert
        assert resumed_session.total_cost_usd == pytest.approx(0.012, rel=1e-6)
        assert resumed_session.turn_count == 2


class TestRedisStorage:
    """Test suite for Redis session persistence."""

    @pytest.mark.asyncio
    async def test_stores_session_in_redis(
        self,
        redis_cache: dict[str, dict],
    ) -> None:
        """Test session data is stored in Redis with correct structure.

        Verifies:
        - Session stored at correct Redis key
        - Data serialized to dict format
        - All fields present and valid
        """
        # Arrange
        mock_redis = MagicMock()

        async def mock_get(key: str) -> dict | None:
            return redis_cache.get(key)

        async def mock_set(key: str, value: dict, ttl: int = 1800) -> bool:
            redis_cache[key] = value
            return True

        async def mock_expire(key: str, ttl: int) -> bool:
            return True

        mock_redis.get = AsyncMock(side_effect=mock_get)
        mock_redis.set = AsyncMock(side_effect=mock_set)
        mock_redis.expire = AsyncMock(side_effect=mock_expire)

        session_manager = SessionManager(redis=mock_redis)

        user_id = uuid4()
        workspace_id = uuid4()

        # Act - Create session
        session = await session_manager.create_session(
            user_id=user_id,
            workspace_id=workspace_id,
            agent_name="pilotspace_agent",
        )

        # Assert - Verify Redis storage
        session_key = f"ai_session:{session.id}"
        assert session_key in redis_cache

        stored_data = redis_cache[session_key]
        assert stored_data["id"] == str(session.id)
        assert stored_data["user_id"] == str(user_id)
        assert stored_data["workspace_id"] == str(workspace_id)
        assert stored_data["agent_name"] == "pilotspace_agent"
        assert "created_at" in stored_data
        assert "expires_at" in stored_data

    @pytest.mark.asyncio
    async def test_retrieves_session_from_redis(
        self,
        redis_cache: dict[str, dict],
    ) -> None:
        """Test session retrieval from Redis reconstructs state correctly.

        Verifies:
        - Session retrieved by ID
        - Data deserialized correctly
        - Messages and context restored
        """
        # Arrange
        mock_redis = MagicMock()

        async def mock_get(key: str) -> dict | None:
            return redis_cache.get(key)

        async def mock_set(key: str, value: dict, ttl: int = 1800) -> bool:
            redis_cache[key] = value
            return True

        async def mock_expire(key: str, ttl: int) -> bool:
            return True

        mock_redis.get = AsyncMock(side_effect=mock_get)
        mock_redis.set = AsyncMock(side_effect=mock_set)
        mock_redis.expire = AsyncMock(side_effect=mock_expire)

        session_manager = SessionManager(redis=mock_redis)

        user_id = uuid4()
        workspace_id = uuid4()

        # Create and store session
        original_session = await session_manager.create_session(
            user_id=user_id,
            workspace_id=workspace_id,
            agent_name="pilotspace_agent",
            initial_context={"test": "value"},
        )

        await session_manager.update_session(
            session_id=original_session.id,
            message=AIMessage(role="user", content="Test message", tokens=5),
        )

        # Act - Retrieve session
        retrieved_session = await session_manager.get_session(original_session.id)

        # Assert
        assert retrieved_session.id == original_session.id
        assert retrieved_session.user_id == user_id
        assert retrieved_session.workspace_id == workspace_id
        assert retrieved_session.context["test"] == "value"
        assert len(retrieved_session.messages) == 1
        assert retrieved_session.messages[0].content == "Test message"

    @pytest.mark.asyncio
    async def test_raises_error_for_nonexistent_session(
        self,
        redis_cache: dict[str, dict],
    ) -> None:
        """Test retrieving non-existent session raises SessionNotFoundError.

        Verifies:
        - Correct exception type raised
        - Exception contains session_id
        """
        # Arrange
        mock_redis = MagicMock()

        async def mock_get(key: str) -> dict | None:
            return redis_cache.get(key)

        mock_redis.get = AsyncMock(side_effect=mock_get)

        session_manager = SessionManager(redis=mock_redis)

        nonexistent_id = uuid4()

        # Act & Assert
        with pytest.raises(SessionNotFoundError) as exc_info:
            await session_manager.get_session(nonexistent_id)

        assert exc_info.value.session_id == nonexistent_id


class TestSessionExpiration:
    """Test suite for session TTL and expiration."""

    @pytest.mark.asyncio
    async def test_session_expires_after_timeout(
        self,
        redis_cache: dict[str, dict],
    ) -> None:
        """Test session expires after TTL (30 minutes).

        Verifies:
        - Session has expires_at timestamp
        - Expired sessions raise SessionExpiredError
        - TTL is 1800 seconds (30 minutes)
        """
        # Arrange
        mock_redis = MagicMock()

        async def mock_get(key: str) -> dict | None:
            return redis_cache.get(key)

        async def mock_set(key: str, value: dict, ttl: int = 1800) -> bool:
            redis_cache[key] = value
            return True

        async def mock_expire(key: str, ttl: int) -> bool:
            return True

        mock_redis.get = AsyncMock(side_effect=mock_get)
        mock_redis.set = AsyncMock(side_effect=mock_set)
        mock_redis.expire = AsyncMock(side_effect=mock_expire)

        session_manager = SessionManager(redis=mock_redis)

        user_id = uuid4()
        workspace_id = uuid4()

        # Create session
        session = await session_manager.create_session(
            user_id=user_id,
            workspace_id=workspace_id,
            agent_name="pilotspace_agent",
        )

        # Manually expire the session by manipulating stored data
        session_key = f"ai_session:{session.id}"
        stored_data = redis_cache[session_key]
        stored_data["expires_at"] = (datetime.now(UTC) - timedelta(seconds=1)).isoformat()
        redis_cache[session_key] = stored_data

        # Act & Assert
        with pytest.raises(SessionExpiredError) as exc_info:
            await session_manager.get_session(session.id)

        assert exc_info.value.session_id == session.id

    @pytest.mark.asyncio
    async def test_ttl_set_to_1800_seconds(
        self,
        redis_cache: dict[str, dict],
    ) -> None:
        """Test Redis TTL is set to 1800 seconds (30 minutes).

        Verifies:
        - TTL constant is 1800
        - Redis SET called with ttl=1800
        """
        # Arrange
        mock_redis = MagicMock()

        async def mock_get(key: str) -> dict | None:
            return redis_cache.get(key)

        async def mock_set(key: str, value: dict, ttl: int = 1800) -> bool:
            redis_cache[key] = value
            return True

        mock_redis.get = AsyncMock(side_effect=mock_get)
        mock_redis.set = AsyncMock(side_effect=mock_set)
        mock_redis.expire = AsyncMock(return_value=True)

        session_manager = SessionManager(redis=mock_redis)

        user_id = uuid4()
        workspace_id = uuid4()

        # Act
        await session_manager.create_session(
            user_id=user_id,
            workspace_id=workspace_id,
            agent_name="pilotspace_agent",
        )

        # Assert
        assert SESSION_TTL_SECONDS == 1800
        # Verify mock_redis.set was called with ttl=1800
        mock_redis.set.assert_called()
        call_kwargs = mock_redis.set.call_args[1]
        assert call_kwargs.get("ttl") == 1800

    @pytest.mark.asyncio
    async def test_ttl_refreshed_on_update(
        self,
        redis_cache: dict[str, dict],
    ) -> None:
        """Test session TTL is refreshed when updated.

        Verifies:
        - Each update extends expires_at
        - TTL reset to 1800 seconds
        - Session remains active after update
        """
        # Arrange
        mock_redis = MagicMock()

        async def mock_get(key: str) -> dict | None:
            return redis_cache.get(key)

        async def mock_set(key: str, value: dict, ttl: int = 1800) -> bool:
            redis_cache[key] = value
            return True

        async def mock_expire(key: str, ttl: int) -> bool:
            return True

        mock_redis.get = AsyncMock(side_effect=mock_get)
        mock_redis.set = AsyncMock(side_effect=mock_set)
        mock_redis.expire = AsyncMock(side_effect=mock_expire)

        session_manager = SessionManager(redis=mock_redis)

        user_id = uuid4()
        workspace_id = uuid4()

        # Create session
        session = await session_manager.create_session(
            user_id=user_id,
            workspace_id=workspace_id,
            agent_name="pilotspace_agent",
        )

        initial_expires_at = session.expires_at

        # Simulate time passing
        await asyncio.sleep(0.1)

        # Act - Update session
        updated_session = await session_manager.update_session(
            session_id=session.id,
            message=AIMessage(role="user", content="Update"),
        )

        # Assert - expires_at extended
        assert updated_session.expires_at > initial_expires_at


class TestSessionHandler:
    """Test suite for SessionHandler integration layer."""

    @pytest.mark.asyncio
    async def test_session_handler_creates_conversation_session(
        self,
        redis_cache: dict[str, dict],
    ) -> None:
        """Test SessionHandler creates ConversationSession wrapper.

        Verifies:
        - SessionHandler uses SessionManager
        - Returns ConversationSession type
        - Conversion between AISession and ConversationSession
        """
        # Arrange
        mock_redis = MagicMock()

        async def mock_get(key: str) -> dict | None:
            return redis_cache.get(key)

        async def mock_set(key: str, value: dict, ttl: int = 1800) -> bool:
            redis_cache[key] = value
            return True

        async def mock_expire(key: str, ttl: int) -> bool:
            return True

        mock_redis.get = AsyncMock(side_effect=mock_get)
        mock_redis.set = AsyncMock(side_effect=mock_set)
        mock_redis.expire = AsyncMock(side_effect=mock_expire)

        session_manager = SessionManager(redis=mock_redis)
        session_handler = SessionHandler(session_manager=session_manager)

        user_id = uuid4()
        workspace_id = uuid4()

        # Act
        conversation_session = await session_handler.create_session(
            workspace_id=workspace_id,
            user_id=user_id,
            agent_name="pilotspace_agent",
        )

        # Assert
        assert isinstance(conversation_session, ConversationSession)
        assert conversation_session.workspace_id == workspace_id
        assert conversation_session.user_id == user_id
        assert conversation_session.agent_name == "pilotspace_agent"

    @pytest.mark.asyncio
    async def test_session_handler_adds_messages(
        self,
        redis_cache: dict[str, dict],
    ) -> None:
        """Test SessionHandler adds messages to session.

        Verifies:
        - Messages added via handler
        - Messages stored in SessionManager
        - Session updated correctly
        """
        # Arrange
        mock_redis = MagicMock()

        async def mock_get(key: str) -> dict | None:
            return redis_cache.get(key)

        async def mock_set(key: str, value: dict, ttl: int = 1800) -> bool:
            redis_cache[key] = value
            return True

        async def mock_expire(key: str, ttl: int) -> bool:
            return True

        mock_redis.get = AsyncMock(side_effect=mock_get)
        mock_redis.set = AsyncMock(side_effect=mock_set)
        mock_redis.expire = AsyncMock(side_effect=mock_expire)

        session_manager = SessionManager(redis=mock_redis)
        session_handler = SessionHandler(session_manager=session_manager)

        user_id = uuid4()
        workspace_id = uuid4()

        # Create session
        conversation_session = await session_handler.create_session(
            workspace_id=workspace_id,
            user_id=user_id,
            agent_name="pilotspace_agent",
        )

        # Act - Add message
        await session_handler.add_message(
            session_id=conversation_session.session_id,
            role="user",
            content="Test message",
            tokens=10,
        )

        # Retrieve and verify
        retrieved = await session_handler.get_session(conversation_session.session_id)

        # Assert
        assert retrieved is not None
        assert len(retrieved.messages) == 1
        assert retrieved.messages[0].role == "user"
        assert retrieved.messages[0].content == "Test message"


@pytest.mark.skipif(
    "sqlite" in os.environ.get("TEST_DATABASE_URL", "sqlite"),
    reason="PostgreSQL-specific test (requires gen_random_uuid, JSONB)",
)
class TestDatabasePersistence:
    """Test suite for PostgreSQL session persistence via SessionStore.

    Note: Skipped on SQLite as it requires PostgreSQL-specific features.
    Run with PostgreSQL: TEST_DATABASE_URL=postgresql://... pytest ...
    """

    @pytest.mark.asyncio
    async def test_session_store_saves_to_database(
        self,
        redis_cache: dict[str, dict],
        db_session: AsyncSession,
    ) -> None:
        """Test SessionStore saves Redis session to PostgreSQL.

        Verifies:
        - Session saved from Redis to database
        - Database record created
        - Data matches Redis session
        """
        # Arrange
        mock_redis = MagicMock()

        async def mock_get(key: str) -> dict | None:
            return redis_cache.get(key)

        async def mock_set(key: str, value: dict, ttl: int = 1800) -> bool:
            redis_cache[key] = value
            return True

        async def mock_expire(key: str, ttl: int) -> bool:
            return True

        mock_redis.get = AsyncMock(side_effect=mock_get)
        mock_redis.set = AsyncMock(side_effect=mock_set)
        mock_redis.expire = AsyncMock(side_effect=mock_expire)

        session_manager = SessionManager(redis=mock_redis)
        session_store = SessionStore(session_manager=session_manager, db_session=db_session)

        user_id = uuid4()
        workspace_id = uuid4()

        # Create session in Redis
        redis_session = await session_manager.create_session(
            user_id=user_id,
            workspace_id=workspace_id,
            agent_name="pilotspace_agent",
        )

        # Act - Save to database
        result = await session_store.save_to_db(redis_session.id)

        # Assert
        assert result is True

        # Verify database record
        from sqlalchemy import select

        from pilot_space.infrastructure.database.models.ai_session import (
            AISession as DBSession,
        )

        stmt = select(DBSession).where(DBSession.id == redis_session.id)
        db_result = await db_session.execute(stmt)
        db_session_model = db_result.scalar_one_or_none()

        assert db_session_model is not None
        assert db_session_model.id == redis_session.id
        assert db_session_model.user_id == user_id
        assert db_session_model.workspace_id == workspace_id

    @pytest.mark.asyncio
    async def test_session_store_loads_from_database(
        self,
        redis_cache: dict[str, dict],
        db_session: AsyncSession,
    ) -> None:
        """Test SessionStore loads session from PostgreSQL to Redis.

        Verifies:
        - Session loaded from database when not in Redis
        - Redis session restored
        - Data consistency between DB and Redis
        """
        # Arrange
        mock_redis = MagicMock()

        async def mock_get(key: str) -> dict | None:
            return redis_cache.get(key)

        async def mock_set(key: str, value: dict, ttl: int = 1800) -> bool:
            redis_cache[key] = value
            return True

        async def mock_expire(key: str, ttl: int) -> bool:
            return True

        # Mock scan_keys for private access during restoration
        async def mock_scan_keys(pattern: str, max_keys: int = 1000) -> list[str]:
            return []

        mock_redis.get = AsyncMock(side_effect=mock_get)
        mock_redis.set = AsyncMock(side_effect=mock_set)
        mock_redis.expire = AsyncMock(side_effect=mock_expire)
        mock_redis.scan_keys = AsyncMock(side_effect=mock_scan_keys)

        session_manager = SessionManager(redis=mock_redis)
        session_store = SessionStore(session_manager=session_manager, db_session=db_session)

        user_id = uuid4()
        workspace_id = uuid4()

        # Create and save session
        redis_session = await session_manager.create_session(
            user_id=user_id,
            workspace_id=workspace_id,
            agent_name="pilotspace_agent",
        )

        await session_store.save_to_db(redis_session.id)

        # Clear Redis cache to simulate expiration
        redis_cache.clear()

        # Act - Load from database
        loaded_session = await session_store.load_from_db(redis_session.id)

        # Assert
        assert loaded_session is not None
        assert loaded_session.id == redis_session.id
        assert loaded_session.user_id == user_id
        assert loaded_session.workspace_id == workspace_id

        # Verify Redis was restored
        session_key = f"ai_session:{redis_session.id}"
        assert session_key in redis_cache


__all__ = [
    "TestDatabasePersistence",
    "TestRedisStorage",
    "TestSessionCreation",
    "TestSessionExpiration",
    "TestSessionHandler",
    "TestSessionResumption",
]
