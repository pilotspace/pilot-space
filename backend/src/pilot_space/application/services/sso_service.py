"""SSO configuration and user provisioning service.

Covers:
  AUTH-01: SAML 2.0 configuration CRUD + user provisioning
  AUTH-02: OIDC configuration CRUD
  AUTH-03: Role claim mapping (stored with SAML/OIDC config)
  AUTH-04: SSO-only enforcement flag

Design notes:
  - All settings are stored in workspace.settings JSONB using Python dict
    merge so that other keys are never overwritten.
  - provision_saml_user calls the Supabase admin API to create/update users
    and creates a WorkspaceMember row when the user is new to the workspace.
  - This is a plain class (no DI base class) — injected via DI container.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any
from uuid import UUID

from pilot_space.infrastructure.logging import get_logger

if TYPE_CHECKING:
    from pilot_space.infrastructure.database.repositories.workspace_repository import (
        WorkspaceRepository,
    )

logger = get_logger(__name__)


class SsoService:
    """Application service for SSO configuration and user provisioning.

    Args:
        workspace_repo: Repository for Workspace entity access.
        supabase_admin_client: Supabase admin client for user provisioning.
    """

    def __init__(
        self,
        workspace_repo: WorkspaceRepository,
        supabase_admin_client: Any,
    ) -> None:
        self._workspace_repo = workspace_repo
        self._admin_client = supabase_admin_client

    # ------------------------------------------------------------------
    # SAML configuration (AUTH-01)
    # ------------------------------------------------------------------

    async def configure_saml(
        self,
        workspace_id: UUID,
        config: dict[str, Any],
    ) -> None:
        """Store SAML IdP configuration in workspace.settings["saml_config"].

        Merges into existing JSONB — never replaces other settings keys.

        Args:
            workspace_id: Target workspace UUID.
            config: Dict with required keys: entity_id, sso_url, certificate.
                    Optional: name_id_format.

        Raises:
            ValueError: If required config keys are missing.
            LookupError: If workspace not found.
        """
        required_keys = ("entity_id", "sso_url", "certificate")
        missing = [k for k in required_keys if not config.get(k)]
        if missing:
            raise ValueError(f"SAML config missing required fields: {missing}")

        workspace = await self._workspace_repo.get_by_id(workspace_id)
        if workspace is None:
            raise LookupError(f"Workspace {workspace_id} not found")

        existing: dict[str, Any] = dict(workspace.settings or {})
        existing["saml_config"] = {
            "entity_id": config["entity_id"],
            "sso_url": str(config["sso_url"]),
            "certificate": config["certificate"],
            "name_id_format": config.get(
                "name_id_format",
                "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
            ),
        }
        workspace.settings = existing
        await self._workspace_repo.session.flush()
        logger.info("saml_config_stored", workspace_id=str(workspace_id))

    async def get_saml_config(
        self,
        workspace_id: UUID,
    ) -> dict[str, Any] | None:
        """Retrieve SAML IdP configuration for a workspace.

        Args:
            workspace_id: Target workspace UUID.

        Returns:
            SAML config dict or None if not configured.
        """
        workspace = await self._workspace_repo.get_by_id(workspace_id)
        if workspace is None or not workspace.settings:
            return None
        return workspace.settings.get("saml_config")  # type: ignore[return-value]

    # ------------------------------------------------------------------
    # OIDC configuration (AUTH-02)
    # ------------------------------------------------------------------

    async def configure_oidc(
        self,
        workspace_id: UUID,
        config: dict[str, Any],
    ) -> None:
        """Store OIDC provider configuration in workspace.settings["oidc_config"].

        Args:
            workspace_id: Target workspace UUID.
            config: Dict with required keys: provider, client_id, client_secret.
                    Optional: issuer_url.

        Raises:
            ValueError: If required config keys are missing.
            LookupError: If workspace not found.
        """
        required_keys = ("provider", "client_id", "client_secret")
        missing = [k for k in required_keys if not config.get(k)]
        if missing:
            raise ValueError(f"OIDC config missing required fields: {missing}")

        workspace = await self._workspace_repo.get_by_id(workspace_id)
        if workspace is None:
            raise LookupError(f"Workspace {workspace_id} not found")

        existing: dict[str, Any] = dict(workspace.settings or {})
        issuer_url = config.get("issuer_url")
        existing["oidc_config"] = {
            "provider": config["provider"],
            "client_id": config["client_id"],
            "client_secret": config["client_secret"],
            "issuer_url": str(issuer_url) if issuer_url else None,
        }
        workspace.settings = existing
        await self._workspace_repo.session.flush()
        logger.info("oidc_config_stored", workspace_id=str(workspace_id))

    async def get_oidc_config(
        self,
        workspace_id: UUID,
    ) -> dict[str, Any] | None:
        """Retrieve OIDC provider configuration for a workspace.

        Args:
            workspace_id: Target workspace UUID.

        Returns:
            OIDC config dict or None if not configured.
        """
        workspace = await self._workspace_repo.get_by_id(workspace_id)
        if workspace is None or not workspace.settings:
            return None
        return workspace.settings.get("oidc_config")  # type: ignore[return-value]

    # ------------------------------------------------------------------
    # SSO enforcement (AUTH-04)
    # ------------------------------------------------------------------

    async def set_sso_required(
        self,
        workspace_id: UUID,
        required: bool,
    ) -> None:
        """Set the sso_required flag in workspace.settings.

        When True, email/password login is blocked for this workspace;
        users must log in via SSO.

        Args:
            workspace_id: Target workspace UUID.
            required: True to require SSO, False to allow password login.

        Raises:
            LookupError: If workspace not found.
        """
        workspace = await self._workspace_repo.get_by_id(workspace_id)
        if workspace is None:
            raise LookupError(f"Workspace {workspace_id} not found")

        existing: dict[str, Any] = dict(workspace.settings or {})
        existing["sso_required"] = required
        workspace.settings = existing
        await self._workspace_repo.session.flush()
        logger.info("sso_required_set", workspace_id=str(workspace_id), required=required)

    async def get_sso_status(
        self,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        """Return SSO status flags for a workspace.

        Used by the unauthenticated /auth/sso/status endpoint so the login
        page can show or hide the SSO button.

        Args:
            workspace_id: Target workspace UUID.

        Returns:
            Dict: {has_saml, has_oidc, sso_required, oidc_provider}
            All values default to False/None if workspace or settings not found.
        """
        empty: dict[str, Any] = {
            "has_saml": False,
            "has_oidc": False,
            "sso_required": False,
            "oidc_provider": None,
        }

        workspace = await self._workspace_repo.get_by_id(workspace_id)
        if workspace is None or not workspace.settings:
            return empty

        settings: dict[str, Any] = workspace.settings
        saml_config = settings.get("saml_config")
        oidc_config = settings.get("oidc_config")

        return {
            "has_saml": bool(saml_config and saml_config.get("entity_id")),
            "has_oidc": bool(oidc_config and oidc_config.get("client_id")),
            "sso_required": bool(settings.get("sso_required", False)),
            "oidc_provider": oidc_config.get("provider") if oidc_config else None,
        }

    # ------------------------------------------------------------------
    # User provisioning (AUTH-01)
    # ------------------------------------------------------------------

    async def provision_saml_user(
        self,
        email: str,
        display_name: str,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        """Create or update a Supabase user from a SAML assertion.

        Also creates a WorkspaceMember row if the user is new to the workspace.

        Args:
            email: User email from SAML name_id or email attribute.
            display_name: Display name from SAML attributes.
            workspace_id: The workspace the user is logging into.

        Returns:
            Dict with keys: user_id (str), email (str), is_new (bool).

        Raises:
            RuntimeError: If Supabase admin call fails.
        """
        try:
            # Try to find existing user by email via admin API
            # Supabase admin: list users and filter (no direct lookup by email in SDK)
            admin = self._admin_client.auth.admin

            # admin.list_users() returns a list; filter for matching email
            users_response = await admin.list_users()
            existing_user = next(
                (u for u in (users_response or []) if u.email == email),
                None,
            )

            if existing_user is None:
                # Create new user
                create_response = await admin.create_user(
                    {
                        "email": email,
                        "email_confirm": True,
                        "user_metadata": {"name": display_name},
                        "app_metadata": {
                            "provider": "saml",
                            "workspace_id": str(workspace_id),
                        },
                    }
                )
                user_id = str(create_response.user.id)
                is_new = True
                logger.info("saml_user_created", user_id=user_id, email=email)
            else:
                user_id = str(existing_user.id)
                is_new = False
                # Update app_metadata with latest workspace info
                await admin.update_user_by_id(
                    user_id,
                    {
                        "app_metadata": {
                            "provider": "saml",
                            "workspace_id": str(workspace_id),
                        },
                    },
                )
                logger.info("saml_user_updated", user_id=user_id, email=email)

        except Exception as exc:
            logger.exception("saml_user_provision_failed", email=email, error=str(exc))
            raise RuntimeError(f"Failed to provision SAML user: {exc}") from exc

        # Ensure WorkspaceMember row exists for this workspace
        await self._ensure_workspace_member(user_id=user_id, workspace_id=workspace_id)

        return {"user_id": user_id, "email": email, "is_new": is_new}

    async def _ensure_workspace_member(
        self,
        user_id: str,
        workspace_id: UUID,
    ) -> None:
        """Create a WorkspaceMember row if none exists.

        Uses INSERT ... ON CONFLICT DO NOTHING pattern via Python:
        checks first to avoid a round-trip on hot path, then creates.

        Args:
            user_id: Supabase user UUID as string.
            workspace_id: Workspace to join.
        """
        from uuid import UUID as _UUID

        from sqlalchemy import exists, select

        from pilot_space.infrastructure.database.models.workspace_member import (
            WorkspaceMember,
            WorkspaceRole,
        )

        session = self._workspace_repo.session
        uid = _UUID(user_id)

        stmt = select(
            exists().where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.user_id == uid,
            )
        )
        result = await session.execute(stmt)
        already_member = result.scalar()

        if not already_member:
            member = WorkspaceMember(
                workspace_id=workspace_id,
                user_id=uid,
                role=WorkspaceRole.MEMBER,
                is_active=True,
            )
            session.add(member)
            await session.flush()
            logger.info(
                "saml_workspace_member_created",
                user_id=user_id,
                workspace_id=str(workspace_id),
            )
