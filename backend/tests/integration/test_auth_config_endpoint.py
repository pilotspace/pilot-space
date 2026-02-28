"""Integration tests for GET /api/v1/auth/config endpoint.

Covers:
- Returns provider="authcore" + authcore_url when AUTH_PROVIDER=authcore
- Returns provider="supabase" + authcore_url=null when default (no env var)
- Returns provider="supabase" when AUTH_PROVIDER explicitly set to "supabase"
- authcore_url propagated from AUTHCORE_URL setting
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import patch

import pytest
from fastapi import status

if TYPE_CHECKING:
    from httpx import AsyncClient


@pytest.mark.asyncio
class TestAuthConfigEndpoint:
    """GET /api/v1/auth/config returns correct provider config."""

    async def test_returns_supabase_config_by_default(
        self,
        client: AsyncClient,
    ) -> None:
        """Default settings yield provider=supabase with null authcore_url."""
        from unittest.mock import MagicMock

        mock_settings = MagicMock()
        mock_settings.auth_provider = "supabase"
        mock_settings.authcore_url = None

        with patch("pilot_space.config.get_settings", return_value=mock_settings):
            response = await client.get("/api/v1/auth/config")

        assert response.status_code == status.HTTP_200_OK
        body = response.json()
        assert body["provider"] == "supabase"
        assert body["authcore_url"] is None

    async def test_returns_authcore_config_when_auth_provider_authcore(
        self,
        client: AsyncClient,
    ) -> None:
        """AUTH_PROVIDER=authcore yields provider=authcore with authcore_url."""
        from unittest.mock import MagicMock

        mock_settings = MagicMock()
        mock_settings.auth_provider = "authcore"
        mock_settings.authcore_url = "https://auth.example.com"

        with patch("pilot_space.config.get_settings", return_value=mock_settings):
            response = await client.get("/api/v1/auth/config")

        assert response.status_code == status.HTTP_200_OK
        body = response.json()
        assert body["provider"] == "authcore"
        assert body["authcore_url"] == "https://auth.example.com"

    async def test_authcore_url_is_null_when_not_configured(
        self,
        client: AsyncClient,
    ) -> None:
        """AUTH_PROVIDER=authcore with no AUTHCORE_URL yields authcore_url=null."""
        from unittest.mock import MagicMock

        mock_settings = MagicMock()
        mock_settings.auth_provider = "authcore"
        mock_settings.authcore_url = None

        with patch("pilot_space.config.get_settings", return_value=mock_settings):
            response = await client.get("/api/v1/auth/config")

        assert response.status_code == status.HTTP_200_OK
        body = response.json()
        assert body["provider"] == "authcore"
        assert body["authcore_url"] is None

    async def test_supabase_provider_never_exposes_authcore_url(
        self,
        client: AsyncClient,
    ) -> None:
        """Even if AUTHCORE_URL is set, it must NOT be returned for supabase provider."""
        from unittest.mock import MagicMock

        mock_settings = MagicMock()
        mock_settings.auth_provider = "supabase"
        mock_settings.authcore_url = "https://auth.example.com"

        with patch("pilot_space.config.get_settings", return_value=mock_settings):
            response = await client.get("/api/v1/auth/config")

        assert response.status_code == status.HTTP_200_OK
        body = response.json()
        assert body["provider"] == "supabase"
        assert body["authcore_url"] is None

    async def test_provider_name_is_lowercased(
        self,
        client: AsyncClient,
    ) -> None:
        """Auth provider name in response is always lowercase."""
        from unittest.mock import MagicMock

        mock_settings = MagicMock()
        mock_settings.auth_provider = "SUPABASE"
        mock_settings.authcore_url = None

        with patch("pilot_space.config.get_settings", return_value=mock_settings):
            response = await client.get("/api/v1/auth/config")

        assert response.status_code == status.HTTP_200_OK
        body = response.json()
        assert body["provider"] == "supabase"

    async def test_config_endpoint_requires_no_authentication(
        self,
        client: AsyncClient,
    ) -> None:
        """GET /config is public — no Authorization header required."""
        from unittest.mock import MagicMock

        mock_settings = MagicMock()
        mock_settings.auth_provider = "supabase"
        mock_settings.authcore_url = None

        with patch("pilot_space.config.get_settings", return_value=mock_settings):
            # Plain client without any auth header
            response = await client.get("/api/v1/auth/config")

        assert response.status_code == status.HTTP_200_OK

    async def test_response_schema_has_exactly_two_fields(
        self,
        client: AsyncClient,
    ) -> None:
        """Response body contains exactly 'provider' and 'authcore_url'."""
        from unittest.mock import MagicMock

        mock_settings = MagicMock()
        mock_settings.auth_provider = "supabase"
        mock_settings.authcore_url = None

        with patch("pilot_space.config.get_settings", return_value=mock_settings):
            response = await client.get("/api/v1/auth/config")

        body = response.json()
        assert set(body.keys()) == {"provider", "authcore_url"}
