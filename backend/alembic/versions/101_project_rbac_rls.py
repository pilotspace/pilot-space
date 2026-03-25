"""Add RLS policies for project_members table.

Enables Row-Level Security on project_members and adds appropriate
SELECT/INSERT/UPDATE/DELETE policies for workspace-scoped isolation.
Only workspace members can see project memberships; only Admin/Owner
can write to project_members.

Revision ID: 101_project_rbac_rls
Revises: 100_project_rbac_schema
Create Date: 2026-03-25
"""

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "101_project_rbac_rls"
down_revision: str | None = "100_project_rbac_schema"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    """Enable RLS on project_members and create access policies."""

    op.execute("ALTER TABLE project_members ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE project_members FORCE ROW LEVEL SECURITY")

    # SELECT: workspace members can see project membership of other members in
    # the same workspace; Admins/Owners see all; regular members see only the
    # project_members rows for projects they themselves are in.
    op.execute(
        """
        CREATE POLICY "project_members_select"
        ON project_members
        FOR SELECT
        USING (
            project_id IN (
                SELECT p.id
                FROM projects p
                INNER JOIN workspace_members wm
                    ON wm.workspace_id = p.workspace_id
                WHERE wm.user_id = current_setting('app.current_user_id', true)::uuid
                  AND wm.is_deleted = false
                  AND wm.is_active = true
                  AND p.is_deleted = false
            )
        )
    """
    )

    # INSERT: only Admins and Owners can add project members
    op.execute(
        """
        CREATE POLICY "project_members_insert"
        ON project_members
        FOR INSERT
        WITH CHECK (
            project_id IN (
                SELECT p.id
                FROM projects p
                INNER JOIN workspace_members wm
                    ON wm.workspace_id = p.workspace_id
                WHERE wm.user_id = current_setting('app.current_user_id', true)::uuid
                  AND wm.role IN ('ADMIN', 'OWNER')
                  AND wm.is_deleted = false
                  AND wm.is_active = true
                  AND p.is_deleted = false
            )
        )
    """
    )

    # UPDATE: only Admins and Owners can modify project membership
    op.execute(
        """
        CREATE POLICY "project_members_update"
        ON project_members
        FOR UPDATE
        USING (
            project_id IN (
                SELECT p.id
                FROM projects p
                INNER JOIN workspace_members wm
                    ON wm.workspace_id = p.workspace_id
                WHERE wm.user_id = current_setting('app.current_user_id', true)::uuid
                  AND wm.role IN ('ADMIN', 'OWNER')
                  AND wm.is_deleted = false
                  AND wm.is_active = true
                  AND p.is_deleted = false
            )
        )
        WITH CHECK (
            project_id IN (
                SELECT p.id
                FROM projects p
                INNER JOIN workspace_members wm
                    ON wm.workspace_id = p.workspace_id
                WHERE wm.user_id = current_setting('app.current_user_id', true)::uuid
                  AND wm.role IN ('ADMIN', 'OWNER')
                  AND wm.is_deleted = false
                  AND wm.is_active = true
                  AND p.is_deleted = false
            )
        )
    """
    )

    # DELETE: only Admins and Owners can remove project members
    op.execute(
        """
        CREATE POLICY "project_members_delete"
        ON project_members
        FOR DELETE
        USING (
            project_id IN (
                SELECT p.id
                FROM projects p
                INNER JOIN workspace_members wm
                    ON wm.workspace_id = p.workspace_id
                WHERE wm.user_id = current_setting('app.current_user_id', true)::uuid
                  AND wm.role IN ('ADMIN', 'OWNER')
                  AND wm.is_deleted = false
                  AND wm.is_active = true
                  AND p.is_deleted = false
            )
        )
    """
    )

    # Index to accelerate RLS lookups
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_project_members_project_user_active
        ON project_members (project_id, user_id)
        WHERE is_active = true AND is_deleted = false
    """
    )


def downgrade() -> None:
    """Remove RLS policies and disable RLS on project_members."""
    op.execute("DROP INDEX IF EXISTS ix_project_members_project_user_active")
    op.execute('DROP POLICY IF EXISTS "project_members_delete" ON project_members')
    op.execute('DROP POLICY IF EXISTS "project_members_update" ON project_members')
    op.execute('DROP POLICY IF EXISTS "project_members_insert" ON project_members')
    op.execute('DROP POLICY IF EXISTS "project_members_select" ON project_members')
    op.execute("ALTER TABLE project_members DISABLE ROW LEVEL SECURITY")
