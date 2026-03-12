"""Install plugin service — SKRG-02.

Handles plugin install, update, and uninstall operations.
Takes AsyncSession directly (no DI container) — follows SCIM/related-issues pattern.

Source: Phase 19, SKRG-02
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from pilot_space.infrastructure.database.models.workspace_plugin import WorkspacePlugin
from pilot_space.infrastructure.database.repositories.workspace_plugin_repository import (
    WorkspacePluginRepository,
)
from pilot_space.infrastructure.logging import get_logger

if TYPE_CHECKING:
    from uuid import UUID

    from sqlalchemy.ext.asyncio import AsyncSession

    from pilot_space.integrations.github.plugin_service import SkillContent

logger = get_logger(__name__)


class InstallPluginService:
    """Service for installing, updating, and uninstalling workspace plugins.

    Plugins are created with is_active=True — SKILL.md content is auto-wired
    immediately on install (per CONTEXT.md decision). MCP tool bindings and
    action button definitions are stored but NOT wired until Phase 17.
    """

    def __init__(self, db_session: AsyncSession) -> None:
        """Initialize with a database session.

        Args:
            db_session: Active async database session.
        """
        self._session = db_session
        self._plugin_repo = WorkspacePluginRepository(db_session)

    async def install(
        self,
        workspace_id: UUID,
        repo_url: str,
        skill_name: str,
        skill_content: SkillContent,
        installed_sha: str,
        installed_by: UUID | None = None,
    ) -> WorkspacePlugin:
        """Install a plugin from a GitHub repository.

        Creates a WorkspacePlugin record with is_active=True. If a soft-deleted
        plugin with the same key exists, it is replaced with a new record.

        Args:
            workspace_id: Target workspace UUID.
            repo_url: Full GitHub repository URL.
            skill_name: Skill directory name in the repo.
            skill_content: Fetched SkillContent with markdown and references.
            installed_sha: Git commit SHA at install time.
            installed_by: User who triggered the install.

        Returns:
            Created WorkspacePlugin entity.
        """
        from pilot_space.integrations.github.plugin_service import parse_github_url

        owner, repo = parse_github_url(repo_url)

        # Check for existing (non-deleted) plugin
        existing = await self._plugin_repo.get_by_workspace_and_name(
            workspace_id=workspace_id,
            repo_owner=owner,
            repo_name=repo,
            skill_name=skill_name,
        )
        if existing is not None:
            logger.info(
                "Plugin %s/%s/%s already installed in workspace %s — updating",
                owner,
                repo,
                skill_name,
                workspace_id,
            )
            return await self.update(
                plugin=existing,
                skill_content=skill_content,
                new_sha=installed_sha,
            )

        plugin = WorkspacePlugin(
            workspace_id=workspace_id,
            repo_url=repo_url,
            repo_owner=owner,
            repo_name=repo,
            skill_name=skill_name,
            display_name=skill_content.display_name or skill_name,
            description=skill_content.description or None,
            skill_content=skill_content.skill_md,
            references=skill_content.references,
            installed_sha=installed_sha,
            is_active=True,
            installed_by=installed_by,
        )

        created = await self._plugin_repo.create(plugin)
        logger.info(
            "Installed plugin %s/%s/%s in workspace %s (SHA: %s)",
            owner,
            repo,
            skill_name,
            workspace_id,
            installed_sha[:8],
        )

        # Auto-create action buttons from plugin metadata (non-fatal)
        try:
            await self._create_plugin_action_buttons(
                workspace_id=workspace_id,
                plugin=created,
                skill_content=skill_content,
            )
        except Exception:
            logger.warning(
                "Failed to create action buttons for plugin %s",
                skill_name,
                exc_info=True,
            )

        return created

    async def update(
        self,
        plugin: WorkspacePlugin,
        skill_content: SkillContent,
        new_sha: str,
    ) -> WorkspacePlugin:
        """Update a plugin with upstream content.

        Overwrites skill_content, references, and installed_sha.
        No diff or warning — always takes upstream version.

        Args:
            plugin: Existing WorkspacePlugin entity to update.
            skill_content: New SkillContent from upstream.
            new_sha: New Git commit SHA.

        Returns:
            Updated WorkspacePlugin entity.
        """
        old_sha = plugin.installed_sha
        plugin.skill_content = skill_content.skill_md
        plugin.references = skill_content.references
        plugin.installed_sha = new_sha
        plugin.display_name = skill_content.display_name or plugin.skill_name
        plugin.description = skill_content.description or None

        updated = await self._plugin_repo.update(plugin)
        logger.info(
            "Updated plugin %s (SHA: %s -> %s)",
            plugin.skill_name,
            old_sha[:8] if old_sha else "N/A",
            new_sha[:8],
        )
        return updated

    async def uninstall(self, plugin: WorkspacePlugin) -> None:
        """Uninstall (soft-delete) a plugin.

        Deactivates associated action buttons before soft-deleting the plugin.

        Args:
            plugin: WorkspacePlugin entity to uninstall.
        """
        # Deactivate associated action buttons (non-fatal)
        try:
            from pilot_space.infrastructure.database.repositories.skill_action_button_repository import (
                SkillActionButtonRepository,
            )

            btn_repo = SkillActionButtonRepository(self._session)
            count = await btn_repo.deactivate_by_plugin_id(plugin.workspace_id, str(plugin.id))
            if count > 0:
                logger.info(
                    "Deactivated %d action buttons for plugin %s",
                    count,
                    plugin.skill_name,
                )
        except Exception:
            logger.warning(
                "Failed to deactivate action buttons for plugin %s",
                plugin.skill_name,
                exc_info=True,
            )

        await self._plugin_repo.soft_delete(plugin)
        logger.info(
            "Uninstalled plugin %s from workspace %s",
            plugin.skill_name,
            plugin.workspace_id,
        )

    async def _create_plugin_action_buttons(
        self,
        workspace_id: UUID,
        plugin: WorkspacePlugin,
        skill_content: SkillContent,
    ) -> None:
        """Auto-create action buttons from plugin metadata.

        Checks if skill_content references contain action_buttons definitions.
        If found, creates SkillActionButton rows linked to this plugin.

        Args:
            workspace_id: Target workspace UUID.
            plugin: The just-created WorkspacePlugin entity.
            skill_content: Fetched SkillContent with references.
        """
        from pilot_space.infrastructure.database.models.skill_action_button import (
            BindingType,
            SkillActionButton,
        )
        from pilot_space.infrastructure.database.repositories.skill_action_button_repository import (
            SkillActionButtonRepository,
        )

        # Look for action_buttons in references list
        action_buttons: list[object] = []
        for ref in skill_content.references:
            ref_dict: dict[str, object] = ref if isinstance(ref, dict) else {}  # type: ignore[assignment]
            if ref_dict.get("type") == "action_buttons":
                raw = ref_dict.get("buttons", [])
                action_buttons = raw if isinstance(raw, list) else []
                break

        if not action_buttons:
            return

        btn_repo = SkillActionButtonRepository(self._session)
        for idx, btn_raw in enumerate(action_buttons):
            btn_def: dict[str, object] = btn_raw if isinstance(btn_raw, dict) else {}  # type: ignore[assignment]
            if not btn_def.get("name"):
                continue
            button = SkillActionButton(
                workspace_id=workspace_id,
                name=btn_def["name"],
                icon=btn_def.get("icon"),
                binding_type=BindingType.SKILL,
                binding_id=None,
                binding_metadata={
                    "source": "plugin",
                    "plugin_id": str(plugin.id),
                    "skill_name": plugin.skill_name,
                },
                sort_order=idx * 10,
                is_active=True,
            )
            await btn_repo.create(button)

        logger.info(
            "Created %d action buttons for plugin %s",
            len(action_buttons),
            plugin.skill_name,
        )


__all__ = ["InstallPluginService"]
