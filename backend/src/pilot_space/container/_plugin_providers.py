"""Plugin and seeding DI provider sub-container.

Extracted from container.py to keep the main container under 700 lines.
Covers: SeedTemplatesService and SeedPluginsService.

Both services are constructed imperatively (manual instantiation) in
workspace creation with fire-and-forget asyncio.create_task, so they
do NOT use @inject. They are registered here as Factory providers so
endpoints can optionally inject them via Depends() without breaking
the existing imperative call pattern.

Session lifecycle note: when called imperatively (create_task), callers
pass a fresh session obtained via get_db_session() before the task fires.
The session must outlive the background task; callers are responsible for
managing session context around fire-and-forget tasks.
"""

from __future__ import annotations

from dependency_injector import providers

from pilot_space.application.services.skill_template.seed_templates_service import (
    SeedTemplatesService,
)
from pilot_space.application.services.workspace_plugin.seed_plugins_service import (
    SeedPluginsService,
)
from pilot_space.container._base import InfraContainer
from pilot_space.dependencies.auth import get_current_session


class PluginContainer(InfraContainer):
    """DI sub-container for plugin and seeding service providers.

    Inherits InfraContainer to remain composable in the Container MRO.
    Container (main) inherits this class to compose all providers.
    """

    # ---------------------------------------------------------------------------
    # Seed Templates Service (P20-07)
    # Non-fatal fire-and-forget seeder for workspace built-in skill templates.
    # ---------------------------------------------------------------------------

    seed_templates_service = providers.Factory(
        SeedTemplatesService,
        db_session=providers.Callable(get_current_session),
    )

    # ---------------------------------------------------------------------------
    # Seed Plugins Service (SKRG-05)
    # Non-fatal fire-and-forget seeder for workspace default official plugins.
    # ---------------------------------------------------------------------------

    seed_plugins_service = providers.Factory(
        SeedPluginsService,
        db_session=providers.Callable(get_current_session),
    )


__all__ = ["PluginContainer"]
