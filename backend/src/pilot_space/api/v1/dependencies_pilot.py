"""FastAPI dependency type aliases for pilot CLI services.

Kept in a separate module to respect the 700-line limit on dependencies.py.
"""

from __future__ import annotations

from typing import Annotated

from dependency_injector.wiring import Provide, inject
from fastapi import Depends

from pilot_space.application.services.auth import ValidateAPIKeyService
from pilot_space.application.services.issue import GetImplementContextService
from pilot_space.container import Container

__all__ = [
    "GetImplementContextServiceDep",
    "ValidateAPIKeyServiceDep",
]


@inject
def _get_implement_context_service(
    svc: GetImplementContextService = Depends(Provide[Container.get_implement_context_service]),
) -> GetImplementContextService:
    return svc


GetImplementContextServiceDep = Annotated[
    GetImplementContextService, Depends(_get_implement_context_service)
]


@inject
def _get_validate_api_key_service(
    svc: ValidateAPIKeyService = Depends(Provide[Container.validate_api_key_service]),
) -> ValidateAPIKeyService:
    return svc


ValidateAPIKeyServiceDep = Annotated[ValidateAPIKeyService, Depends(_get_validate_api_key_service)]
