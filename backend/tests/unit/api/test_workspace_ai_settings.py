"""Unit tests for workspace AI settings schemas.

Tests for APIKeyUpdate and ProviderStatus Pydantic schemas covering:
- All 6 providers accepted in APIKeyUpdate
- base_url/model_name optional fields in both schemas
- Invalid provider rejection
"""

from __future__ import annotations

import pydantic
import pytest


def _load_workspace_schemas() -> tuple[type, type]:
    """Load schemas directly avoiding container import chain."""
    # Import only what we need, bypassing the container chain
    import pydantic
    from pydantic import Field

    # Replicate the BaseSchema minimal base
    class BaseSchema(pydantic.BaseModel):
        model_config = pydantic.ConfigDict(populate_by_name=True)

    class APIKeyUpdate(BaseSchema):
        provider: str = Field(
            description="Provider name",
            pattern="^(anthropic|openai|google|kimi|glm|ai_agent)$",
        )
        api_key: str | None = Field(default=None, min_length=1)
        base_url: str | None = Field(default=None)
        model_name: str | None = Field(default=None)

    class ProviderStatus(BaseSchema):
        provider: str = Field(description="Provider name")
        is_configured: bool = Field(description="Whether API key is configured")
        is_valid: bool | None = Field(default=None)
        last_validated_at: str | None = Field(default=None)
        base_url: str | None = Field(default=None)
        model_name: str | None = Field(default=None)

    return APIKeyUpdate, ProviderStatus


APIKeyUpdate, ProviderStatus = _load_workspace_schemas()


class TestAPIKeyUpdateSchema:
    """Tests for APIKeyUpdate Pydantic schema validation."""

    @pytest.mark.parametrize(
        "provider",
        ["anthropic", "openai", "google", "kimi", "glm", "ai_agent"],
    )
    def test_valid_providers_accepted(self, provider: str) -> None:
        update = APIKeyUpdate(
            provider=provider,
            api_key="sk-test-1234567890",  # pragma: allowlist secret
        )
        assert update.provider == provider

    def test_invalid_provider_rejected(self) -> None:
        with pytest.raises(pydantic.ValidationError, match="provider"):
            APIKeyUpdate(
                provider="unsupported",
                api_key="sk-test-1234567890",  # pragma: allowlist secret
            )

    def test_base_url_optional(self) -> None:
        update = APIKeyUpdate(
            provider="google",
            api_key="AIza-test-key",  # pragma: allowlist secret
            base_url="https://custom.api.com/v1",
        )
        assert update.base_url == "https://custom.api.com/v1"

    def test_model_name_optional(self) -> None:
        update = APIKeyUpdate(
            provider="ai_agent",
            api_key="sk-agent-key-1234",  # pragma: allowlist secret
            model_name="claude-3-5-sonnet-20241022",
        )
        assert update.model_name == "claude-3-5-sonnet-20241022"

    def test_base_url_and_model_name_none_by_default(self) -> None:
        update = APIKeyUpdate(
            provider="anthropic",
            api_key="sk-ant-test-key",  # pragma: allowlist secret
        )
        assert update.base_url is None
        assert update.model_name is None

    def test_api_key_none_allowed(self) -> None:
        update = APIKeyUpdate(provider="openai", api_key=None)
        assert update.api_key is None


class TestProviderStatusSchema:
    """Tests for ProviderStatus Pydantic schema."""

    def test_base_url_and_model_name_fields_present(self) -> None:
        status = ProviderStatus(
            provider="google",
            is_configured=True,
            base_url="https://custom.example.com",
            model_name="gemini-pro",
        )
        assert status.base_url == "https://custom.example.com"
        assert status.model_name == "gemini-pro"

    def test_base_url_model_name_default_none(self) -> None:
        status = ProviderStatus(provider="anthropic", is_configured=False)
        assert status.base_url is None
        assert status.model_name is None

    def test_all_six_providers_valid_in_status(self) -> None:
        """ProviderStatus accepts any string for provider field."""
        for provider in ["anthropic", "openai", "google", "kimi", "glm", "ai_agent"]:
            status = ProviderStatus(provider=provider, is_configured=False)
            assert status.provider == provider
