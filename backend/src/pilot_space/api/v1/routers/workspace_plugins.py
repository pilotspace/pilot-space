"""Workspace plugins REST API endpoints (SKRG-01..05).

Admin-only endpoints for plugin lifecycle. Uses direct instantiation pattern
(not @inject DI) — follows SCIM/related-issues pattern.

Source: Phase 19, SKRG-01..05
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from pilot_space.api.middleware.request_context import WorkspaceId
from pilot_space.api.v1.schemas.workspace_plugin import (
    SkillListItem,
    WorkspaceGithubCredentialRequest,
    WorkspaceGithubCredentialResponse,
    WorkspacePluginInstallAllRequest,
    WorkspacePluginInstallRequest,
    WorkspacePluginResponse,
    WorkspacePluginToggleRepoRequest,
    WorkspacePluginToggleRequest,
    WorkspacePluginUpdateCheckResponse,
)
from pilot_space.dependencies import CurrentUserId, DbSession, RedisDep
from pilot_space.infrastructure.database.models.workspace_member import (
    WorkspaceMember,
    WorkspaceRole,
)
from pilot_space.infrastructure.logging import get_logger

logger = get_logger(__name__)

router = APIRouter(
    prefix="/{workspace_id}/plugins",
    tags=["Workspace Plugins"],
)

_PLUGIN_SHA_CACHE_TTL = 300


async def _require_admin(user_id: UUID, workspace_id: UUID, session: DbSession) -> None:
    """Verify user is ADMIN or OWNER. Raises 403 if not."""
    stmt = select(WorkspaceMember.role).where(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.user_id == user_id,
    )
    result = await session.execute(stmt)
    row = result.scalar()
    if row is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member")
    role = row.value if hasattr(row, "value") else str(row)
    if role not in (WorkspaceRole.ADMIN.value, WorkspaceRole.OWNER.value):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin required")


async def _get_workspace_token(workspace_id: UUID, session: DbSession) -> str | None:
    """Get decrypted workspace GitHub PAT, or None for system token fallback."""
    from pilot_space.infrastructure.database.repositories.workspace_github_credential_repository import (
        WorkspaceGithubCredentialRepository,
    )
    from pilot_space.infrastructure.encryption import decrypt_api_key

    cred_repo = WorkspaceGithubCredentialRepository(session)
    credential = await cred_repo.get_by_workspace(workspace_id)
    if credential is None:
        return None
    try:
        return decrypt_api_key(credential.pat_encrypted)
    except Exception:
        logger.warning("Failed to decrypt GitHub PAT for workspace %s", workspace_id)
        return None


async def _get_cached_head_sha(
    redis: RedisDep, workspace_id: str, owner: str, repo: str, gh: object
) -> str | None:
    """Get HEAD SHA with 5-minute Redis cache."""
    cache_key = f"plugin:head_sha:{workspace_id}:{owner}:{repo}"
    cached = await redis.get(cache_key)
    if cached is not None and isinstance(cached, str):
        return cached
    try:
        from pilot_space.integrations.github.plugin_service import GitHubPluginService

        if isinstance(gh, GitHubPluginService):
            sha = await gh.get_head_sha(owner, repo)
            await redis.set(cache_key, sha, ttl=_PLUGIN_SHA_CACHE_TTL)
            return sha
    except Exception:
        logger.warning("Failed to fetch HEAD SHA for %s/%s", owner, repo)
    return None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=list[WorkspacePluginResponse],
    summary="List installed plugins",
)
async def list_installed_plugins(
    workspace_id: WorkspaceId, session: DbSession, current_user_id: CurrentUserId
) -> list[WorkspacePluginResponse]:
    """Return all installed (non-deleted) plugins for this workspace."""
    await _require_admin(current_user_id, workspace_id, session)

    from pilot_space.infrastructure.database.repositories.workspace_plugin_repository import (
        WorkspacePluginRepository,
    )

    repo = WorkspacePluginRepository(session)
    plugins = await repo.get_installed_by_workspace(workspace_id)
    return [WorkspacePluginResponse.model_validate(p) for p in plugins]


@router.get(
    "/browse",
    response_model=list[SkillListItem],
    summary="Browse skills in a GitHub repo",
)
async def browse_repo(
    workspace_id: WorkspaceId,
    session: DbSession,
    current_user_id: CurrentUserId,
    repo_url: str = Query(description="GitHub repository URL to browse"),
) -> list[SkillListItem]:
    """Fetch available skills from a GitHub repository URL."""
    await _require_admin(current_user_id, workspace_id, session)

    from pilot_space.integrations.github.plugin_service import (
        GitHubPluginService,
        PluginRateLimitError,
        PluginRepoError,
        parse_github_url,
    )

    try:
        owner, repo = parse_github_url(repo_url)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    token = await _get_workspace_token(workspace_id, session)
    gh = GitHubPluginService(token=token)
    try:
        skill_names = await gh.list_skills(owner, repo)
        items: list[SkillListItem] = []
        for name in skill_names:
            try:
                content = await gh.fetch_skill_content(owner, repo, name)
                items.append(
                    SkillListItem(
                        skill_name=name,
                        display_name=content.display_name or name,
                        description=content.description or None,
                    )
                )
            except Exception:
                items.append(SkillListItem(skill_name=name, display_name=name))
        return items
    except PluginRepoError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except PluginRateLimitError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"GitHub API error: {exc}"
        ) from exc
    finally:
        await gh.aclose()


@router.post(
    "",
    response_model=WorkspacePluginResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Install a single skill plugin",
)
async def install_plugin(
    workspace_id: WorkspaceId,
    request: WorkspacePluginInstallRequest,
    session: DbSession,
    current_user_id: CurrentUserId,
) -> WorkspacePluginResponse:
    """Install one skill from a GitHub repository into this workspace."""
    await _require_admin(current_user_id, workspace_id, session)

    from pilot_space.application.services.workspace_plugin.install_plugin_service import (
        InstallPluginService,
    )
    from pilot_space.integrations.github.plugin_service import GitHubPluginService, parse_github_url

    try:
        owner, repo = parse_github_url(request.repo_url)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    token = await _get_workspace_token(workspace_id, session)
    gh = GitHubPluginService(token=token)
    try:
        skill_content = await gh.fetch_skill_content(owner, repo, request.skill_name)
        head_sha = await gh.get_head_sha(owner, repo)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"GitHub API error: {exc}"
        ) from exc
    finally:
        await gh.aclose()

    install_svc = InstallPluginService(db_session=session)
    plugin = await install_svc.install(
        workspace_id=workspace_id,
        repo_url=request.repo_url,
        skill_name=request.skill_name,
        skill_content=skill_content,
        installed_sha=head_sha,
        installed_by=current_user_id,
    )
    logger.info("[Plugins] Installed %s in workspace %s", request.skill_name, workspace_id)
    return WorkspacePluginResponse.model_validate(plugin)


@router.post(
    "/install-all",
    response_model=list[WorkspacePluginResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Install all skills from a GitHub repo",
)
async def install_all_from_repo(
    workspace_id: WorkspaceId,
    request: WorkspacePluginInstallAllRequest,
    session: DbSession,
    current_user_id: CurrentUserId,
) -> list[WorkspacePluginResponse]:
    """Browse a GitHub repo and install all discovered skills at once."""
    await _require_admin(current_user_id, workspace_id, session)

    from pilot_space.application.services.workspace_plugin.install_plugin_service import (
        InstallPluginService,
    )
    from pilot_space.integrations.github.plugin_service import (
        GitHubPluginService,
        PluginRateLimitError,
        PluginRepoError,
        parse_github_url,
    )

    try:
        owner, repo = parse_github_url(request.repo_url)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    token = request.pat or await _get_workspace_token(workspace_id, session)
    gh = GitHubPluginService(token=token)
    skill_names: list[str] = []
    head_sha = ""
    try:
        skill_names = await gh.list_skills(owner, repo)
        head_sha = await gh.get_head_sha(owner, repo) if skill_names else ""
    except PluginRepoError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except PluginRateLimitError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"GitHub API error: {exc}"
        ) from exc

    if not skill_names:
        await gh.aclose()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No skills found.")

    install_svc = InstallPluginService(db_session=session)
    results: list[WorkspacePluginResponse] = []
    try:
        for name in skill_names:
            try:
                content = await gh.fetch_skill_content(owner, repo, name)
                plugin = await install_svc.install(
                    workspace_id=workspace_id,
                    repo_url=request.repo_url,
                    skill_name=name,
                    skill_content=content,
                    installed_sha=head_sha,
                    installed_by=current_user_id,
                )
                results.append(WorkspacePluginResponse.model_validate(plugin))
            except Exception:
                logger.warning(
                    "[Plugins] Failed to install skill %s from %s/%s",
                    name,
                    owner,
                    repo,
                    exc_info=True,
                )
    finally:
        await gh.aclose()

    if not results:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to install any skills."
        )

    logger.info(
        "[Plugins] Installed %d skills from %s/%s in workspace %s",
        len(results),
        owner,
        repo,
        workspace_id,
    )
    return results


@router.patch(
    "/{plugin_id}/toggle",
    response_model=WorkspacePluginResponse,
    summary="Toggle plugin active state",
)
async def toggle_plugin(
    workspace_id: WorkspaceId,
    plugin_id: UUID,
    request: WorkspacePluginToggleRequest,
    session: DbSession,
    current_user_id: CurrentUserId,
) -> WorkspacePluginResponse:
    """Activate or deactivate a single plugin skill."""
    await _require_admin(current_user_id, workspace_id, session)

    from pilot_space.infrastructure.database.repositories.workspace_plugin_repository import (
        WorkspacePluginRepository,
    )

    repo = WorkspacePluginRepository(session)
    plugin = await repo.get_by_id(plugin_id)
    if plugin is None or plugin.workspace_id != workspace_id or plugin.is_deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plugin not found")

    plugin.is_active = request.is_active
    updated = await repo.update(plugin)
    logger.info(
        "[Plugins] Toggled %s to %s", plugin_id, "active" if request.is_active else "inactive"
    )
    return WorkspacePluginResponse.model_validate(updated)


@router.patch(
    "/toggle-repo",
    response_model=list[WorkspacePluginResponse],
    summary="Toggle all plugins from a repo",
)
async def toggle_repo_plugins(
    workspace_id: WorkspaceId,
    request: WorkspacePluginToggleRepoRequest,
    session: DbSession,
    current_user_id: CurrentUserId,
) -> list[WorkspacePluginResponse]:
    """Activate or deactivate all plugin skills from a specific repository."""
    await _require_admin(current_user_id, workspace_id, session)

    from pilot_space.infrastructure.database.repositories.workspace_plugin_repository import (
        WorkspacePluginRepository,
    )
    from pilot_space.integrations.github.plugin_service import parse_github_url

    try:
        owner, repo = parse_github_url(request.repo_url)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    plugin_repo = WorkspacePluginRepository(session)
    plugins = await plugin_repo.get_by_workspace_and_repo(workspace_id, owner, repo)
    if not plugins:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No plugins from this repo."
        )

    results: list[WorkspacePluginResponse] = []
    for plugin in plugins:
        plugin.is_active = request.is_active
        updated = await plugin_repo.update(plugin)
        results.append(WorkspacePluginResponse.model_validate(updated))

    logger.info(
        "[Plugins] Toggled %d from %s/%s to %s", len(results), owner, repo, request.is_active
    )
    return results


@router.delete(
    "/uninstall-repo",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Uninstall all plugins from a repo",
)
async def uninstall_repo_plugins(
    workspace_id: WorkspaceId,
    session: DbSession,
    current_user_id: CurrentUserId,
    repo_url: str = Query(description="GitHub repository URL to uninstall"),
) -> None:
    """Soft-delete all installed plugins from a specific repository."""
    await _require_admin(current_user_id, workspace_id, session)

    from pilot_space.application.services.workspace_plugin.install_plugin_service import (
        InstallPluginService,
    )
    from pilot_space.infrastructure.database.repositories.workspace_plugin_repository import (
        WorkspacePluginRepository,
    )
    from pilot_space.integrations.github.plugin_service import parse_github_url

    try:
        owner, repo = parse_github_url(repo_url)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    plugin_repo = WorkspacePluginRepository(session)
    plugins = await plugin_repo.get_by_workspace_and_repo(workspace_id, owner, repo)
    if not plugins:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No plugins from this repo."
        )

    install_svc = InstallPluginService(db_session=session)
    for plugin in plugins:
        await install_svc.uninstall(plugin)

    logger.info(
        "[Plugins] Uninstalled %d from %s/%s in workspace %s",
        len(plugins),
        owner,
        repo,
        workspace_id,
    )


@router.delete(
    "/{plugin_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Uninstall a single plugin",
)
async def uninstall_plugin(
    workspace_id: WorkspaceId,
    plugin_id: UUID,
    session: DbSession,
    current_user_id: CurrentUserId,
) -> None:
    """Soft-delete an installed plugin."""
    await _require_admin(current_user_id, workspace_id, session)

    from pilot_space.application.services.workspace_plugin.install_plugin_service import (
        InstallPluginService,
    )
    from pilot_space.infrastructure.database.repositories.workspace_plugin_repository import (
        WorkspacePluginRepository,
    )

    repo = WorkspacePluginRepository(session)
    plugin = await repo.get_by_id(plugin_id)
    if plugin is None or plugin.workspace_id != workspace_id or plugin.is_deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plugin not found")

    install_svc = InstallPluginService(db_session=session)
    await install_svc.uninstall(plugin)
    logger.info("[Plugins] Uninstalled %s from workspace %s", plugin_id, workspace_id)


@router.get(
    "/check-updates",
    response_model=WorkspacePluginUpdateCheckResponse,
    summary="Check for plugin updates",
)
async def check_updates(
    workspace_id: WorkspaceId,
    session: DbSession,
    current_user_id: CurrentUserId,
    redis: RedisDep,
) -> WorkspacePluginUpdateCheckResponse:
    """Check if installed plugins have newer versions available."""
    await _require_admin(current_user_id, workspace_id, session)

    from pilot_space.infrastructure.database.repositories.workspace_plugin_repository import (
        WorkspacePluginRepository,
    )

    repo = WorkspacePluginRepository(session)
    plugins = await repo.get_installed_by_workspace(workspace_id)
    token = await _get_workspace_token(workspace_id, session)

    repo_shas: dict[tuple[str, str], str | None] = {}
    from pilot_space.integrations.github.plugin_service import GitHubPluginService

    gh = GitHubPluginService(token=token)
    try:
        for plugin in plugins:
            key = (plugin.repo_owner, plugin.repo_name)
            if key not in repo_shas:
                repo_shas[key] = await _get_cached_head_sha(
                    redis=redis,
                    workspace_id=str(workspace_id),
                    owner=plugin.repo_owner,
                    repo=plugin.repo_name,
                    gh=gh,
                )
    finally:
        await gh.aclose()

    results: list[WorkspacePluginResponse] = []
    for plugin in plugins:
        key = (plugin.repo_owner, plugin.repo_name)
        head_sha = repo_shas.get(key)
        resp = WorkspacePluginResponse.model_validate(plugin)
        resp.has_update = head_sha is not None and head_sha != plugin.installed_sha
        results.append(resp)
    return WorkspacePluginUpdateCheckResponse(plugins=results)


@router.post(
    "/github-credential",
    response_model=WorkspaceGithubCredentialResponse,
    summary="Save workspace GitHub PAT",
)
async def save_github_credential(
    workspace_id: WorkspaceId,
    request: WorkspaceGithubCredentialRequest,
    session: DbSession,
    current_user_id: CurrentUserId,
) -> WorkspaceGithubCredentialResponse:
    """Encrypt and store a GitHub PAT for this workspace."""
    await _require_admin(current_user_id, workspace_id, session)

    from pilot_space.infrastructure.database.repositories.workspace_github_credential_repository import (
        WorkspaceGithubCredentialRepository,
    )
    from pilot_space.infrastructure.encryption import encrypt_api_key

    pat_encrypted = encrypt_api_key(request.pat)
    cred_repo = WorkspaceGithubCredentialRepository(session)
    await cred_repo.upsert(
        workspace_id=workspace_id, pat_encrypted=pat_encrypted, created_by=current_user_id
    )
    logger.info("[Plugins] GitHub PAT saved for workspace %s", workspace_id)
    return WorkspaceGithubCredentialResponse(has_pat=True)


@router.get(
    "/github-credential",
    response_model=WorkspaceGithubCredentialResponse,
    summary="Check GitHub PAT status",
)
async def get_github_credential(
    workspace_id: WorkspaceId,
    session: DbSession,
    current_user_id: CurrentUserId,
) -> WorkspaceGithubCredentialResponse:
    """Check if a GitHub PAT is configured for this workspace."""
    await _require_admin(current_user_id, workspace_id, session)

    from pilot_space.infrastructure.database.repositories.workspace_github_credential_repository import (
        WorkspaceGithubCredentialRepository,
    )

    cred_repo = WorkspaceGithubCredentialRepository(session)
    credential = await cred_repo.get_by_workspace(workspace_id)
    return WorkspaceGithubCredentialResponse(has_pat=credential is not None)


__all__ = ["router"]
