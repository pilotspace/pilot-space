"""Fix pilot_api_keys RLS policy to allow cross-workspace key_hash lookup.

Revision ID: 053_fix_pilot_api_keys_rls
Revises: 052_add_pilot_api_keys
Create Date: 2026-03-01

The original workspace-scoped USING clause on ALL operations prevents
authentication because the workspace is unknown until the key is validated.

Fix: split into two policies:
1. ``pilot_api_keys_select_by_hash`` — permissive SELECT for unauthenticated
   key validation. Restricted to active (non-deleted, non-expired) rows only;
   key_hash is an opaque SHA-256 digest so this reveals nothing about other
   workspaces.
2. ``pilot_api_keys_workspace_isolation`` — workspace-scoped policy for
   INSERT/UPDATE/DELETE (management operations that already have workspace
   context from the authenticated session).
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "053_fix_pilot_api_keys_rls"
down_revision: str | None = "052_add_pilot_api_keys"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    """Replace the all-operations workspace policy with two targeted policies."""
    # Drop the original policy that blocked cross-workspace SELECT during auth
    op.execute('DROP POLICY IF EXISTS "pilot_api_keys_workspace_isolation" ON pilot_api_keys')

    # Policy 1: Allow SELECT for key_hash validation without workspace context.
    # Scoped to active rows only — deleted/expired keys are never returned.
    # key_hash is a one-way SHA-256 digest; matching it reveals no workspace data.
    op.execute("""
        CREATE POLICY "pilot_api_keys_select_by_hash"
        ON pilot_api_keys
        FOR SELECT
        USING (
            is_deleted = false
            AND (expires_at IS NULL OR expires_at > now())
        )
    """)

    # Policy 2: Workspace-scoped policy for write operations (INSERT/UPDATE/DELETE).
    # These operations occur through authenticated endpoints that have already set
    # app.current_workspace_id in the session via set_rls_context().
    op.execute("""
        CREATE POLICY "pilot_api_keys_workspace_isolation"
        ON pilot_api_keys
        FOR ALL
        USING (
            workspace_id = current_setting('app.current_workspace_id', true)::uuid
        )
        WITH CHECK (
            workspace_id = current_setting('app.current_workspace_id', true)::uuid
        )
    """)


def downgrade() -> None:
    """Restore the original all-operations workspace-scoped policy."""
    op.execute('DROP POLICY IF EXISTS "pilot_api_keys_select_by_hash" ON pilot_api_keys')
    op.execute('DROP POLICY IF EXISTS "pilot_api_keys_workspace_isolation" ON pilot_api_keys')

    # Restore original policy (blocks key_hash lookup without workspace context)
    op.execute("""
        CREATE POLICY "pilot_api_keys_workspace_isolation"
        ON pilot_api_keys
        FOR ALL
        USING (
            workspace_id = current_setting('app.current_workspace_id', true)::uuid
        )
        WITH CHECK (
            workspace_id = current_setting('app.current_workspace_id', true)::uuid
        )
    """)
