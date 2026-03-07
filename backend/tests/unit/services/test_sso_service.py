"""Unit tests for SsoService — AUTH-01 through AUTH-04.

All tests use mocked WorkspaceRepository and Supabase admin client.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest

from pilot_space.application.services.sso_service import SsoService
from pilot_space.infrastructure.database.models.workspace import Workspace


def _make_workspace(settings: dict[str, Any] | None = None) -> MagicMock:
    ws = MagicMock(spec=Workspace)
    ws.id = uuid4()
    ws.settings = settings
    ws.is_deleted = False
    return ws


def _make_service(workspace: MagicMock | None = None) -> tuple[SsoService, MagicMock]:
    workspace_repo = MagicMock()
    workspace_repo.session = AsyncMock()
    workspace_repo.session.flush = AsyncMock()
    if workspace is not None:
        workspace_repo.get_by_id = AsyncMock(return_value=workspace)
    else:
        workspace_repo.get_by_id = AsyncMock(return_value=None)
    admin_client = MagicMock()
    service = SsoService(workspace_repo=workspace_repo, supabase_admin_client=admin_client)
    return service, workspace_repo


@pytest.mark.asyncio
async def test_saml_config_stored_and_retrieved() -> None:
    """SAML config is persisted to workspace.settings and can be retrieved."""
    ws = _make_workspace()
    service, _ = _make_service(ws)
    config = {
        "entity_id": "https://idp.example.com/saml",
        "sso_url": "https://idp.example.com/saml/sso",
        "certificate": "MIID...",
    }
    await service.configure_saml(UUID(str(ws.id)), config)
    assert ws.settings is not None
    assert "saml_config" in ws.settings
    saml = ws.settings["saml_config"]
    assert saml["entity_id"] == config["entity_id"]
    assert saml["certificate"] == config["certificate"]
    assert "name_id_format" in saml


@pytest.mark.asyncio
async def test_saml_config_merges_not_replaces() -> None:
    """configure_saml merges into existing settings without removing other keys."""
    ws = _make_workspace(settings={"some_other_key": "preserved_value"})
    service, _ = _make_service(ws)
    config = {"entity_id": "e", "sso_url": "https://u", "certificate": "c"}
    await service.configure_saml(UUID(str(ws.id)), config)
    assert ws.settings is not None
    assert ws.settings.get("some_other_key") == "preserved_value"
    assert "saml_config" in ws.settings


@pytest.mark.asyncio
async def test_saml_config_missing_required_fields_raises() -> None:
    """configure_saml raises ValueError when required fields are absent."""
    ws = _make_workspace()
    service, _ = _make_service(ws)
    with pytest.raises(ValueError, match="missing required fields"):
        await service.configure_saml(UUID(str(ws.id)), {"entity_id": "only"})


@pytest.mark.asyncio
async def test_get_saml_config_returns_none_when_no_settings() -> None:
    """get_saml_config returns None when workspace has no settings."""
    ws = _make_workspace(settings=None)
    service, _ = _make_service(ws)
    assert await service.get_saml_config(UUID(str(ws.id))) is None


@pytest.mark.asyncio
async def test_get_saml_config_returns_stored_config() -> None:
    """get_saml_config returns the stored SAML config dict."""
    saml_data = {
        "entity_id": "https://idp.example.com",
        "sso_url": "https://idp.example.com/sso",
        "certificate": "cert",
        "name_id_format": "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
    }
    ws = _make_workspace(settings={"saml_config": saml_data})
    service, _ = _make_service(ws)
    assert await service.get_saml_config(UUID(str(ws.id))) == saml_data


@pytest.mark.asyncio
async def test_oidc_config_stored_and_retrieved() -> None:
    """OIDC config is persisted to workspace.settings and can be retrieved."""
    ws = _make_workspace()
    service, _ = _make_service(ws)
    config = {"provider": "google", "client_id": "cid", "client_secret": "sec"}
    await service.configure_oidc(UUID(str(ws.id)), config)
    assert ws.settings is not None
    oidc = ws.settings["oidc_config"]
    assert oidc["provider"] == "google"
    assert oidc["client_id"] == "cid"


@pytest.mark.asyncio
async def test_oidc_config_merges_not_replaces() -> None:
    """configure_oidc merges into existing settings without removing other keys."""
    ws = _make_workspace(settings={"saml_config": {"entity_id": "existing"}})
    service, _ = _make_service(ws)
    await service.configure_oidc(
        UUID(str(ws.id)),
        {"provider": "azure", "client_id": "c1", "client_secret": "s1"},
    )
    assert ws.settings is not None
    assert ws.settings.get("saml_config", {}).get("entity_id") == "existing"
    assert "oidc_config" in ws.settings


@pytest.mark.asyncio
async def test_sso_required_flag_set() -> None:
    """set_sso_required(True) stores sso_required=True in workspace.settings."""
    ws = _make_workspace()
    service, _ = _make_service(ws)
    await service.set_sso_required(UUID(str(ws.id)), required=True)
    assert ws.settings is not None
    assert ws.settings["sso_required"] is True


@pytest.mark.asyncio
async def test_get_sso_status_no_config() -> None:
    """Workspace with no settings returns all False/None status."""
    ws = _make_workspace(settings=None)
    service, _ = _make_service(ws)
    result = await service.get_sso_status(UUID(str(ws.id)))
    assert result == {
        "has_saml": False,
        "has_oidc": False,
        "sso_required": False,
        "oidc_provider": None,
    }


@pytest.mark.asyncio
async def test_get_sso_status_with_saml() -> None:
    """Workspace with saml_config returns has_saml=True."""
    ws = _make_workspace(
        settings={"saml_config": {"entity_id": "https://idp", "sso_url": "u", "certificate": "c"}}
    )
    service, _ = _make_service(ws)
    result = await service.get_sso_status(UUID(str(ws.id)))
    assert result["has_saml"] is True
    assert result["has_oidc"] is False
    assert result["oidc_provider"] is None


@pytest.mark.asyncio
async def test_get_sso_status_unknown_workspace() -> None:
    """Non-existent workspace_id returns all False/None (graceful degradation)."""
    service, _ = _make_service(workspace=None)
    result = await service.get_sso_status(uuid4())
    assert result == {
        "has_saml": False,
        "has_oidc": False,
        "sso_required": False,
        "oidc_provider": None,
    }
