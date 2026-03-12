"""FastAPI dependency type aliases for workspace role skill services.

Kept in a separate module to respect the 700-line limit on dependencies.py.

Source: Phase 16, WRSKL-01..02
"""

from __future__ import annotations

from typing import Annotated

from dependency_injector.wiring import Provide, inject
from fastapi import Depends

from pilot_space.application.services.workspace_role_skill import (
    ActivateWorkspaceSkillService,
    CreateWorkspaceSkillService,
    DeleteWorkspaceSkillService,
    ListWorkspaceSkillsService,
)
from pilot_space.container import Container

__all__ = [
    "ActivateWorkspaceSkillServiceDep",
    "CreateWorkspaceSkillServiceDep",
    "DeleteWorkspaceSkillServiceDep",
    "ListWorkspaceSkillsServiceDep",
]


@inject
def _get_create_workspace_skill_service(
    service: CreateWorkspaceSkillService = Depends(
        Provide[Container.create_workspace_skill_service]
    ),
) -> CreateWorkspaceSkillService:
    return service


CreateWorkspaceSkillServiceDep = Annotated[
    CreateWorkspaceSkillService, Depends(_get_create_workspace_skill_service)
]


@inject
def _get_activate_workspace_skill_service(
    service: ActivateWorkspaceSkillService = Depends(
        Provide[Container.activate_workspace_skill_service]
    ),
) -> ActivateWorkspaceSkillService:
    return service


ActivateWorkspaceSkillServiceDep = Annotated[
    ActivateWorkspaceSkillService, Depends(_get_activate_workspace_skill_service)
]


@inject
def _get_list_workspace_skills_service(
    service: ListWorkspaceSkillsService = Depends(Provide[Container.list_workspace_skills_service]),
) -> ListWorkspaceSkillsService:
    return service


ListWorkspaceSkillsServiceDep = Annotated[
    ListWorkspaceSkillsService, Depends(_get_list_workspace_skills_service)
]


@inject
def _get_delete_workspace_skill_service(
    service: DeleteWorkspaceSkillService = Depends(
        Provide[Container.delete_workspace_skill_service]
    ),
) -> DeleteWorkspaceSkillService:
    return service


DeleteWorkspaceSkillServiceDep = Annotated[
    DeleteWorkspaceSkillService, Depends(_get_delete_workspace_skill_service)
]
