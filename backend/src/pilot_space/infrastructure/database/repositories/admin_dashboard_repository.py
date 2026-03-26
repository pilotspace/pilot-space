"""AdminDashboardRepository — cross-workspace read-only queries for super-admin.

TENANT-04: Uses service_role DB connection to bypass RLS for cross-workspace
aggregation queries. All SQL is read-only (SELECT only).
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# ---------------------------------------------------------------------------
# SQL Queries (read-only, service_role session required)
# ---------------------------------------------------------------------------

_LIST_WORKSPACES_SQL = text("""
SELECT
    w.id,
    w.name,
    w.slug,
    w.created_at,
    COALESCE(m.member_count, 0) AS member_count,
    ou.email AS owner_email,
    al_agg.last_active,
    w.storage_used_bytes,
    COALESCE(al_agg.ai_action_count, 0) AS ai_action_count
FROM workspaces w
LEFT JOIN (
    SELECT workspace_id, COUNT(*) FILTER (WHERE is_active = true AND is_deleted = false) AS member_count
    FROM workspace_members
    GROUP BY workspace_id
) m ON m.workspace_id = w.id
LEFT JOIN users ou ON ou.id = w.owner_id
LEFT JOIN (
    SELECT
        workspace_id,
        MAX(created_at) AS last_active,
        COUNT(*) FILTER (WHERE actor_type = 'AI') AS ai_action_count
    FROM audit_log
    GROUP BY workspace_id
) al_agg ON al_agg.workspace_id = w.id
WHERE w.is_deleted = false
ORDER BY w.created_at DESC
LIMIT :limit OFFSET :offset
""")

_WORKSPACE_DETAIL_SQL = text("""
SELECT
    w.id,
    w.name,
    w.slug,
    w.created_at,
    COALESCE(m.member_count, 0) AS member_count,
    ou.email AS owner_email,
    al_agg.last_active,
    w.storage_used_bytes,
    COALESCE(al_agg.ai_action_count, 0) AS ai_action_count,
    w.rate_limit_standard_rpm,
    w.rate_limit_ai_rpm,
    w.storage_quota_mb
FROM workspaces w
LEFT JOIN (
    SELECT workspace_id, COUNT(*) FILTER (WHERE is_active = true AND is_deleted = false) AS member_count
    FROM workspace_members
    GROUP BY workspace_id
) m ON m.workspace_id = w.id
LEFT JOIN users ou ON ou.id = w.owner_id
LEFT JOIN (
    SELECT
        workspace_id,
        MAX(created_at) AS last_active,
        COUNT(*) FILTER (WHERE actor_type = 'AI') AS ai_action_count
    FROM audit_log
    GROUP BY workspace_id
) al_agg ON al_agg.workspace_id = w.id
WHERE w.slug = :slug AND w.is_deleted = false
""")

_TOP_MEMBERS_SQL = text("""
SELECT
    wm.user_id,
    u.email,
    u.full_name,
    wm.role,
    COUNT(al.id) AS action_count
FROM workspace_members wm
JOIN users u ON u.id = wm.user_id
LEFT JOIN audit_log al ON al.workspace_id = wm.workspace_id AND al.actor_id = wm.user_id
WHERE wm.workspace_id = :workspace_id
  AND wm.is_active = true
  AND wm.is_deleted = false
GROUP BY wm.user_id, u.email, u.full_name, wm.role
ORDER BY action_count DESC
LIMIT 5
""")

_RECENT_AI_ACTIONS_SQL = text("""
SELECT
    id,
    action,
    resource_type,
    resource_id,
    actor_id,
    ai_model,
    ai_token_cost,
    created_at
FROM audit_log
WHERE workspace_id = :workspace_id AND actor_type = 'AI'
ORDER BY created_at DESC
LIMIT 10
""")


class AdminDashboardRepository:
    """Read-only repository for cross-workspace admin dashboard queries.

    Requires a service_role session (bypasses RLS) to run cross-workspace
    aggregation queries. The caller (AdminDashboardService) is responsible
    for providing the correctly privileged session.

    Args:
        session: A service_role AsyncSession that bypasses RLS policies.
    """

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_workspaces(
        self,
        *,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """Fetch all workspaces with aggregated health metrics.

        Args:
            limit: Maximum rows to return.
            offset: Number of rows to skip.

        Returns:
            List of row mappings as plain dicts.
        """
        result = await self._session.execute(
            _LIST_WORKSPACES_SQL, {"limit": limit, "offset": offset}
        )
        return [dict(row) for row in result.mappings()]

    async def get_workspace_by_slug(
        self,
        slug: str,
    ) -> dict[str, Any] | None:
        """Fetch a single workspace row by slug.

        Args:
            slug: Workspace URL slug.

        Returns:
            Row mapping as a plain dict, or None if not found.
        """
        result = await self._session.execute(
            _WORKSPACE_DETAIL_SQL, {"slug": slug}
        )
        row = result.mappings().one_or_none()
        return dict(row) if row is not None else None

    async def get_top_members(
        self,
        workspace_id: Any,
    ) -> list[dict[str, Any]]:
        """Fetch the top 5 most active members for a workspace.

        Args:
            workspace_id: Workspace UUID (raw value from DB row).

        Returns:
            List of member row mappings as plain dicts.
        """
        result = await self._session.execute(
            _TOP_MEMBERS_SQL, {"workspace_id": workspace_id}
        )
        return [dict(row) for row in result.mappings()]

    async def get_recent_ai_actions(
        self,
        workspace_id: Any,
    ) -> list[dict[str, Any]]:
        """Fetch the last 10 AI audit log entries for a workspace.

        Args:
            workspace_id: Workspace UUID (raw value from DB row).

        Returns:
            List of audit log row mappings as plain dicts.
        """
        result = await self._session.execute(
            _RECENT_AI_ACTIONS_SQL, {"workspace_id": workspace_id}
        )
        return [dict(row) for row in result.mappings()]


__all__ = ["AdminDashboardRepository"]
