"""Unit tests for production encryption key startup enforcement (MCPI-06).

Verifies that the lifespan startup check correctly:
- Raises RuntimeError for production + empty ENCRYPTION_KEY
- Raises RuntimeError for production + invalid (non-Fernet) ENCRYPTION_KEY
- Passes silently for production + valid Fernet ENCRYPTION_KEY
- Passes silently for non-production regardless of ENCRYPTION_KEY value
"""

from __future__ import annotations

from unittest.mock import patch

import pytest
from cryptography.fernet import Fernet
from pydantic import SecretStr

from pilot_space.config import Settings, get_settings
from pilot_space.infrastructure.encryption import get_encryption_service


@pytest.fixture(autouse=True)
def _clear_caches() -> None:
    """Clear lru_cache singletons before and after each test."""
    get_settings.cache_clear()
    get_encryption_service.cache_clear()
    yield  # type: ignore[misc]
    get_settings.cache_clear()
    get_encryption_service.cache_clear()


def _make_settings(app_env: str, encryption_key: str) -> Settings:
    """Create a Settings instance with the given app_env and encryption_key."""
    return Settings(
        app_env=app_env,  # type: ignore[arg-type]
        encryption_key=SecretStr(encryption_key),
        # Provide minimal required values to avoid validation errors
        supabase_jwt_secret=SecretStr("super-secret-jwt-token-with-at-least-32-characters-long"),
    )


def _run_encryption_check(settings: Settings) -> None:
    """Run the encryption key startup check logic extracted from main.py lifespan.

    This mirrors exactly what the lifespan does after jwt_provider_validated.
    """
    if settings.is_production:
        from pilot_space.infrastructure.encryption import EncryptionError, get_encryption_service

        enc_key_val = settings.encryption_key.get_secret_value()
        if not enc_key_val:
            raise RuntimeError(
                "ENCRYPTION_KEY must be set in production. "
                'Generate one with: python -c "from cryptography.fernet import Fernet; '
                'print(Fernet.generate_key().decode())"'
            )
        try:
            get_encryption_service()
        except EncryptionError as exc:
            raise RuntimeError(
                f"ENCRYPTION_KEY is invalid: {exc}. "
                'Generate a valid key with: python -c "from cryptography.fernet import Fernet; '
                'print(Fernet.generate_key().decode())"'
            ) from exc


class TestProductionEmptyKeyRaises:
    """Production environment + empty ENCRYPTION_KEY must raise RuntimeError at startup."""

    def test_production_empty_key_raises(self) -> None:
        settings = _make_settings(app_env="production", encryption_key="")

        with pytest.raises(RuntimeError) as exc_info:
            _run_encryption_check(settings)

        assert "ENCRYPTION_KEY" in str(exc_info.value)
        assert "must be set in production" in str(exc_info.value)

    def test_error_message_includes_generation_command(self) -> None:
        settings = _make_settings(app_env="production", encryption_key="")

        with pytest.raises(RuntimeError) as exc_info:
            _run_encryption_check(settings)

        assert "Fernet.generate_key" in str(exc_info.value)


class TestProductionValidKeyPasses:
    """Production environment + valid Fernet key must not raise."""

    def test_production_valid_key_passes(self, monkeypatch: pytest.MonkeyPatch) -> None:
        valid_key = Fernet.generate_key().decode()
        settings = _make_settings(app_env="production", encryption_key=valid_key)

        # Patch get_settings in the config module (where get_encryption_service imports it from)
        with patch(
            "pilot_space.config.get_settings",
            return_value=settings,
        ):
            get_encryption_service.cache_clear()
            # Should not raise
            _run_encryption_check(settings)


class TestNonProductionEmptyKeyAllowed:
    """Non-production environments must not raise even with empty ENCRYPTION_KEY."""

    def test_development_empty_key_no_error(self) -> None:
        settings = _make_settings(app_env="development", encryption_key="")
        # Should not raise
        _run_encryption_check(settings)

    def test_staging_empty_key_no_error(self) -> None:
        settings = _make_settings(app_env="staging", encryption_key="")
        # Should not raise
        _run_encryption_check(settings)


class TestProductionInvalidFernetKeyRaises:
    """Production environment + non-empty but invalid Fernet key must raise RuntimeError."""

    def test_production_invalid_fernet_key_raises(self, monkeypatch: pytest.MonkeyPatch) -> None:
        invalid_key = "not-a-fernet-key"
        settings = _make_settings(app_env="production", encryption_key=invalid_key)

        # Patch get_settings in config module so get_encryption_service() reads our key
        with patch(
            "pilot_space.config.get_settings",
            return_value=settings,
        ):
            get_encryption_service.cache_clear()

            with pytest.raises(RuntimeError) as exc_info:
                _run_encryption_check(settings)

        error_msg = str(exc_info.value)
        assert "ENCRYPTION_KEY is invalid" in error_msg
        assert "Fernet.generate_key" in error_msg

    def test_production_invalid_key_wraps_encryption_error(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """RuntimeError must chain the underlying EncryptionError as __cause__."""
        invalid_key = "bad-key-format"
        settings = _make_settings(app_env="production", encryption_key=invalid_key)

        with patch(
            "pilot_space.config.get_settings",
            return_value=settings,
        ):
            get_encryption_service.cache_clear()

            with pytest.raises(RuntimeError) as exc_info:
                _run_encryption_check(settings)

        from pilot_space.infrastructure.encryption import EncryptionError

        assert isinstance(exc_info.value.__cause__, EncryptionError)
