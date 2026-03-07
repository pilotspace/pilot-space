"""Tests for SSO authentication router — AUTH-01 through AUTH-04.

Tests cover:
  - GET /auth/sso/status: returns SSO availability for a workspace (no auth)
  - Graceful degradation when SSO service unavailable
  - Correct reflection of SAML/OIDC/enforcement configuration
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def _make_sso_status(
    *,
    has_saml: bool = False,
    has_oidc: bool = False,
    sso_required: bool = False,
    oidc_provider: str | None = None,
) -> dict:
    return {
        "has_saml": has_saml,
        "has_oidc": has_oidc,
        "sso_required": sso_required,
        "oidc_provider": oidc_provider,
    }


@pytest.mark.asyncio
async def test_sso_status_returns_all_false_when_service_unavailable() -> None:
    """GET /auth/sso/status returns all-false when SsoService cannot be instantiated.

    Scenario:
        Given the DI container fails to provide SsoService (_get_sso_service returns None)
        When GET /auth/sso/status?workspace_id={id} is called
        Then the response status is 200
        And has_saml, has_oidc, sso_required are all False
        And oidc_provider is None
    """
    from pilot_space.api.v1.routers.auth_sso import get_sso_status
    from pilot_space.api.v1.schemas.sso import SsoStatusResponse

    workspace_id = uuid.uuid4()
    mock_session = AsyncMock()

    with patch("pilot_space.api.v1.routers.auth_sso._get_sso_service", return_value=None):
        result = await get_sso_status(workspace_id=workspace_id, session=mock_session)

    assert isinstance(result, SsoStatusResponse)
    assert result.has_saml is False
    assert result.has_oidc is False
    assert result.sso_required is False
    assert result.oidc_provider is None


@pytest.mark.asyncio
async def test_sso_status_returns_has_saml_when_configured() -> None:
    """GET /auth/sso/status returns has_saml=True when SAML is configured.

    Scenario:
        Given workspace has a valid SAML configuration stored
        When GET /auth/sso/status?workspace_id={id} is called
        Then the response has has_saml=True
        And other flags reflect actual configuration
    """
    from pilot_space.api.v1.routers.auth_sso import get_sso_status
    from pilot_space.api.v1.schemas.sso import SsoStatusResponse

    workspace_id = uuid.uuid4()
    mock_session = AsyncMock()

    mock_service = MagicMock()
    mock_service.get_sso_status = AsyncMock(return_value=_make_sso_status(has_saml=True))

    with patch("pilot_space.api.v1.routers.auth_sso._get_sso_service", return_value=mock_service):
        result = await get_sso_status(workspace_id=workspace_id, session=mock_session)

    mock_service.get_sso_status.assert_called_once_with(workspace_id)
    assert isinstance(result, SsoStatusResponse)
    assert result.has_saml is True
    assert result.has_oidc is False
    assert result.sso_required is False


@pytest.mark.asyncio
async def test_sso_status_returns_sso_required_when_enforcement_enabled() -> None:
    """GET /auth/sso/status reflects sso_required=True when enforcement is active.

    Scenario:
        Given workspace has SSO-only enforcement enabled
        When GET /auth/sso/status?workspace_id={id} is called
        Then the response has sso_required=True
    """
    from pilot_space.api.v1.routers.auth_sso import get_sso_status
    from pilot_space.api.v1.schemas.sso import SsoStatusResponse

    workspace_id = uuid.uuid4()
    mock_session = AsyncMock()

    mock_service = MagicMock()
    mock_service.get_sso_status = AsyncMock(
        return_value=_make_sso_status(has_saml=True, sso_required=True)
    )

    with patch("pilot_space.api.v1.routers.auth_sso._get_sso_service", return_value=mock_service):
        result = await get_sso_status(workspace_id=workspace_id, session=mock_session)

    assert isinstance(result, SsoStatusResponse)
    assert result.sso_required is True


@pytest.mark.asyncio
async def test_sso_status_returns_oidc_provider_when_oidc_configured() -> None:
    """GET /auth/sso/status returns oidc_provider name when OIDC is configured.

    Scenario:
        Given workspace has OIDC configured with provider="google"
        When GET /auth/sso/status?workspace_id={id} is called
        Then the response has has_oidc=True and oidc_provider="google"
    """
    from pilot_space.api.v1.routers.auth_sso import get_sso_status
    from pilot_space.api.v1.schemas.sso import SsoStatusResponse

    workspace_id = uuid.uuid4()
    mock_session = AsyncMock()

    mock_service = MagicMock()
    mock_service.get_sso_status = AsyncMock(
        return_value=_make_sso_status(has_oidc=True, oidc_provider="google")
    )

    with patch("pilot_space.api.v1.routers.auth_sso._get_sso_service", return_value=mock_service):
        result = await get_sso_status(workspace_id=workspace_id, session=mock_session)

    assert isinstance(result, SsoStatusResponse)
    assert result.has_oidc is True
    assert result.oidc_provider == "google"


@pytest.mark.asyncio
async def test_sso_status_graceful_for_unknown_workspace() -> None:
    """GET /auth/sso/status returns all-false for unknown workspace_id.

    Scenario:
        Given workspace_id does not exist in the database
        When GET /auth/sso/status?workspace_id={id} is called
        Then the response is 200 with all-false (graceful degradation, no 404)

    This is intentional: the login page calls this before auth to decide
    whether to show an SSO button; it should degrade gracefully.
    """
    from pilot_space.api.v1.routers.auth_sso import get_sso_status
    from pilot_space.api.v1.schemas.sso import SsoStatusResponse

    workspace_id = uuid.uuid4()
    mock_session = AsyncMock()

    mock_service = MagicMock()
    # SsoService.get_sso_status returns all-false for unknown workspace
    mock_service.get_sso_status = AsyncMock(return_value=_make_sso_status())

    with patch("pilot_space.api.v1.routers.auth_sso._get_sso_service", return_value=mock_service):
        result = await get_sso_status(workspace_id=workspace_id, session=mock_session)

    assert isinstance(result, SsoStatusResponse)
    assert result.has_saml is False
    assert result.has_oidc is False
    assert result.sso_required is False
    assert result.oidc_provider is None
