"""Unit tests for AI infrastructure DI container.

Tests verify that the container correctly wires AI infrastructure services.
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import MagicMock

import pytest

from pilot_space.container import Container, create_container

if TYPE_CHECKING:
    from pilot_space.config import Settings


class TestAIContainerIntegration:
    """Test AI services in main DI container."""

    def test_container_has_ai_providers(self) -> None:
        """Verify AI providers exist in container."""
        container = Container()

        # Verify stateless AI providers exist
        assert hasattr(container, "encryption_key")
        assert hasattr(container, "session_manager")
        assert hasattr(container, "provider_selector")
        assert hasattr(container, "resilient_executor")
        assert hasattr(container, "tool_registry")

    def test_ai_services_are_singletons(self, test_settings: Settings) -> None:
        """Verify AI services use singleton pattern.

        Args:
            test_settings: Test settings fixture.
        """
        container = create_container(test_settings)

        # Mock Redis to avoid connection
        container.redis_client.override(MagicMock(return_value=None))

        # Get services twice - should be same instance
        provider1 = container.provider_selector()
        provider2 = container.provider_selector()
        assert provider1 is provider2

        executor1 = container.resilient_executor()
        executor2 = container.resilient_executor()
        assert executor1 is executor2

        registry1 = container.tool_registry()
        registry2 = container.tool_registry()
        assert registry1 is registry2

    def test_encryption_key_provider(self) -> None:
        """Test encryption key provider exists."""
        container = Container()

        # Verify encryption_key provider exists
        assert hasattr(container, "encryption_key")

        # Provider should be callable
        assert callable(container.encryption_key)

    def test_container_creation_with_config(self) -> None:
        """Test container creation with custom config."""
        from pilot_space.config import Settings

        # Create settings with custom values
        settings = Settings(
            encryption_key="test-encryption-key-32-bytes-long!!",
            ai_timeout_seconds=120,
            ai_max_retries=5,
        )

        container = create_container(settings)
        assert container is not None
        assert container.config() == settings


@pytest.fixture
def test_settings() -> Settings:
    """Create test settings.

    Returns:
        Settings instance for testing.
    """
    from pilot_space.config import Settings

    return Settings(
        app_env="development",
        encryption_key="test-encryption-key-32-bytes-long!!",
        database_url="postgresql+asyncpg://test:test@localhost/test",
        redis_url="redis://localhost:6379/0",
        ai_timeout_seconds=60,
        ai_max_retries=3,
    )
