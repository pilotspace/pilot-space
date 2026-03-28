"""Add marketplace tables for skill platform.

Revision ID: 104_add_marketplace_tables
Revises: 103_fix_invitation_unique_constraint
Create Date: 2026-03-29

Phase 50 -- Skill Domain Model Evolution (P50-01):

1. Creates skill_marketplace_listings table:
   - name, description, long_description, author, icon, category, tags
   - version (semver), download_count, avg_rating, screenshots, graph_data
   - published_by FK -> users.id
   - RLS: public-read for authenticated, publisher-write (OWNER/ADMIN)

2. Creates skill_versions table:
   - listing_id FK -> skill_marketplace_listings.id
   - version (semver), skill_content, graph_data, changelog
   - RLS: public-read, publisher-write

3. Creates skill_reviews table:
   - listing_id FK -> skill_marketplace_listings.id
   - user_id FK -> users.id, rating (1-5), review_text
   - RLS: public-read, author-write

4. Creates skill_graphs table:
   - skill_template_id FK -> skill_templates.id
   - graph_json, node_count, edge_count, last_compiled_at
   - RLS: standard workspace isolation

5. Extends skill_templates with:
   - marketplace_listing_id FK -> skill_marketplace_listings.id (SET NULL)
   - installed_version VARCHAR(20)

Downgrade: reverses all changes in reverse order.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision: str = "104_add_marketplace_tables"
down_revision: str = "103_fix_invitation_unique_constraint"
branch_labels: None = None
depends_on: None = None


def upgrade() -> None:
    """Create marketplace tables, indexes, RLS, and extend skill_templates."""

    # -----------------------------------------------------------------------
    # 1. Create skill_marketplace_listings table
    # -----------------------------------------------------------------------
    op.create_table(
        "skill_marketplace_listings",
        # Primary key
        sa.Column(
            "id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=text("gen_random_uuid()"),
            nullable=False,
        ),
        # Workspace scoping
        sa.Column(
            "workspace_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # Business fields
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("long_description", sa.Text(), nullable=True),
        sa.Column("author", sa.String(100), nullable=False),
        sa.Column(
            "icon",
            sa.String(50),
            server_default=text("'Wand2'"),
            nullable=False,
        ),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column(
            "tags",
            sa.JSON(),
            server_default=text("'[]'"),
            nullable=False,
        ),
        sa.Column("version", sa.String(20), nullable=False),
        sa.Column(
            "download_count",
            sa.Integer(),
            server_default=text("0"),
            nullable=False,
        ),
        sa.Column("avg_rating", sa.Float(), nullable=True),
        sa.Column("screenshots", sa.JSON(), nullable=True),
        sa.Column("graph_data", sa.JSON(), nullable=True),
        sa.Column(
            "published_by",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        # Timestamps
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        # Soft delete
        sa.Column(
            "is_deleted",
            sa.Boolean(),
            server_default=text("false"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Partial unique index: one listing per name+author (excluding deleted)
    op.execute(
        text(
            "CREATE UNIQUE INDEX uq_skill_marketplace_listings_name_author "
            "ON skill_marketplace_listings (name, author) "
            "WHERE is_deleted = false"
        )
    )

    # Indexes
    op.create_index(
        "ix_skill_marketplace_listings_category",
        "skill_marketplace_listings",
        ["category"],
    )
    op.create_index(
        "ix_skill_marketplace_listings_workspace_id",
        "skill_marketplace_listings",
        ["workspace_id"],
    )

    # RLS: public-read, publisher-write (OWNER/ADMIN)
    op.execute(
        text("ALTER TABLE skill_marketplace_listings ENABLE ROW LEVEL SECURITY")
    )
    op.execute(
        text("ALTER TABLE skill_marketplace_listings FORCE ROW LEVEL SECURITY")
    )
    op.execute(
        text(
            """
            CREATE POLICY "skill_marketplace_listings_read"
            ON skill_marketplace_listings
            FOR SELECT
            TO authenticated
            USING (true)
            """
        )
    )
    op.execute(
        text(
            """
            CREATE POLICY "skill_marketplace_listings_write"
            ON skill_marketplace_listings
            FOR ALL
            TO authenticated
            USING (
                workspace_id IN (
                    SELECT wm.workspace_id
                    FROM workspace_members wm
                    WHERE wm.user_id = current_setting('app.current_user_id', true)::uuid
                    AND wm.is_deleted = false
                    AND wm.role IN ('OWNER', 'ADMIN')
                )
            )
            WITH CHECK (
                workspace_id IN (
                    SELECT wm.workspace_id
                    FROM workspace_members wm
                    WHERE wm.user_id = current_setting('app.current_user_id', true)::uuid
                    AND wm.is_deleted = false
                    AND wm.role IN ('OWNER', 'ADMIN')
                )
            )
            """
        )
    )
    op.execute(
        text(
            """
            CREATE POLICY "skill_marketplace_listings_service_role"
            ON skill_marketplace_listings
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true)
            """
        )
    )

    # -----------------------------------------------------------------------
    # 2. Create skill_versions table
    # -----------------------------------------------------------------------
    op.create_table(
        "skill_versions",
        # Primary key
        sa.Column(
            "id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=text("gen_random_uuid()"),
            nullable=False,
        ),
        # Workspace scoping
        sa.Column(
            "workspace_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # Listing reference
        sa.Column(
            "listing_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("skill_marketplace_listings.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # Business fields
        sa.Column("version", sa.String(20), nullable=False),
        sa.Column("skill_content", sa.Text(), nullable=False),
        sa.Column("graph_data", sa.JSON(), nullable=True),
        sa.Column("changelog", sa.Text(), nullable=True),
        # Timestamps
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        # Soft delete
        sa.Column(
            "is_deleted",
            sa.Boolean(),
            server_default=text("false"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Partial unique index: one version per listing (excluding deleted)
    op.execute(
        text(
            "CREATE UNIQUE INDEX uq_skill_versions_listing_version "
            "ON skill_versions (listing_id, version) "
            "WHERE is_deleted = false"
        )
    )

    # Indexes
    op.create_index(
        "ix_skill_versions_listing_id",
        "skill_versions",
        ["listing_id"],
    )
    op.create_index(
        "ix_skill_versions_workspace_id",
        "skill_versions",
        ["workspace_id"],
    )

    # RLS: public-read, publisher-write (OWNER/ADMIN)
    op.execute(text("ALTER TABLE skill_versions ENABLE ROW LEVEL SECURITY"))
    op.execute(text("ALTER TABLE skill_versions FORCE ROW LEVEL SECURITY"))
    op.execute(
        text(
            """
            CREATE POLICY "skill_versions_read"
            ON skill_versions
            FOR SELECT
            TO authenticated
            USING (true)
            """
        )
    )
    op.execute(
        text(
            """
            CREATE POLICY "skill_versions_write"
            ON skill_versions
            FOR ALL
            TO authenticated
            USING (
                workspace_id IN (
                    SELECT wm.workspace_id
                    FROM workspace_members wm
                    WHERE wm.user_id = current_setting('app.current_user_id', true)::uuid
                    AND wm.is_deleted = false
                    AND wm.role IN ('OWNER', 'ADMIN')
                )
            )
            WITH CHECK (
                workspace_id IN (
                    SELECT wm.workspace_id
                    FROM workspace_members wm
                    WHERE wm.user_id = current_setting('app.current_user_id', true)::uuid
                    AND wm.is_deleted = false
                    AND wm.role IN ('OWNER', 'ADMIN')
                )
            )
            """
        )
    )
    op.execute(
        text(
            """
            CREATE POLICY "skill_versions_service_role"
            ON skill_versions
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true)
            """
        )
    )

    # -----------------------------------------------------------------------
    # 3. Create skill_reviews table
    # -----------------------------------------------------------------------
    op.create_table(
        "skill_reviews",
        # Primary key
        sa.Column(
            "id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=text("gen_random_uuid()"),
            nullable=False,
        ),
        # Workspace scoping (reviewer's workspace)
        sa.Column(
            "workspace_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # Listing reference
        sa.Column(
            "listing_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("skill_marketplace_listings.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # User reference
        sa.Column(
            "user_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # Business fields
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("review_text", sa.Text(), nullable=True),
        # Timestamps
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        # Soft delete
        sa.Column(
            "is_deleted",
            sa.Boolean(),
            server_default=text("false"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        # Check constraint
        sa.CheckConstraint(
            "rating >= 1 AND rating <= 5",
            name="ck_skill_reviews_rating_range",
        ),
    )

    # Partial unique index: one review per user per listing (excluding deleted)
    op.execute(
        text(
            "CREATE UNIQUE INDEX uq_skill_reviews_listing_user "
            "ON skill_reviews (listing_id, user_id) "
            "WHERE is_deleted = false"
        )
    )

    # Indexes
    op.create_index(
        "ix_skill_reviews_listing_id",
        "skill_reviews",
        ["listing_id"],
    )
    op.create_index(
        "ix_skill_reviews_workspace_id",
        "skill_reviews",
        ["workspace_id"],
    )

    # RLS: public-read, author-write
    op.execute(text("ALTER TABLE skill_reviews ENABLE ROW LEVEL SECURITY"))
    op.execute(text("ALTER TABLE skill_reviews FORCE ROW LEVEL SECURITY"))
    op.execute(
        text(
            """
            CREATE POLICY "skill_reviews_read"
            ON skill_reviews
            FOR SELECT
            TO authenticated
            USING (true)
            """
        )
    )
    op.execute(
        text(
            """
            CREATE POLICY "skill_reviews_write"
            ON skill_reviews
            FOR INSERT
            TO authenticated
            WITH CHECK (
                user_id = current_setting('app.current_user_id', true)::uuid
            )
            """
        )
    )
    op.execute(
        text(
            """
            CREATE POLICY "skill_reviews_update_delete"
            ON skill_reviews
            FOR ALL
            TO authenticated
            USING (
                user_id = current_setting('app.current_user_id', true)::uuid
            )
            """
        )
    )
    op.execute(
        text(
            """
            CREATE POLICY "skill_reviews_service_role"
            ON skill_reviews
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true)
            """
        )
    )

    # -----------------------------------------------------------------------
    # 4. Create skill_graphs table
    # -----------------------------------------------------------------------
    op.create_table(
        "skill_graphs",
        # Primary key
        sa.Column(
            "id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=text("gen_random_uuid()"),
            nullable=False,
        ),
        # Workspace scoping
        sa.Column(
            "workspace_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # Skill template reference
        sa.Column(
            "skill_template_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("skill_templates.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # Business fields
        sa.Column(
            "graph_json",
            sa.JSON(),
            server_default=text("'{}'"),
            nullable=False,
        ),
        sa.Column(
            "node_count",
            sa.Integer(),
            server_default=text("0"),
            nullable=False,
        ),
        sa.Column(
            "edge_count",
            sa.Integer(),
            server_default=text("0"),
            nullable=False,
        ),
        sa.Column("last_compiled_at", sa.DateTime(timezone=True), nullable=True),
        # Timestamps
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        # Soft delete
        sa.Column(
            "is_deleted",
            sa.Boolean(),
            server_default=text("false"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Indexes
    op.create_index(
        "ix_skill_graphs_skill_template_id",
        "skill_graphs",
        ["skill_template_id"],
    )
    op.create_index(
        "ix_skill_graphs_workspace_id",
        "skill_graphs",
        ["workspace_id"],
    )

    # RLS: standard workspace isolation
    op.execute(text("ALTER TABLE skill_graphs ENABLE ROW LEVEL SECURITY"))
    op.execute(text("ALTER TABLE skill_graphs FORCE ROW LEVEL SECURITY"))
    op.execute(
        text(
            """
            CREATE POLICY "skill_graphs_workspace_isolation"
            ON skill_graphs
            FOR ALL
            TO authenticated
            USING (
                workspace_id IN (
                    SELECT wm.workspace_id
                    FROM workspace_members wm
                    WHERE wm.user_id = current_setting('app.current_user_id', true)::uuid
                    AND wm.is_deleted = false
                    AND wm.role IN ('OWNER', 'ADMIN', 'MEMBER', 'GUEST')
                )
            )
            """
        )
    )
    op.execute(
        text(
            """
            CREATE POLICY "skill_graphs_service_role"
            ON skill_graphs
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true)
            """
        )
    )

    # -----------------------------------------------------------------------
    # 5. Extend skill_templates with marketplace columns
    # -----------------------------------------------------------------------
    op.add_column(
        "skill_templates",
        sa.Column(
            "marketplace_listing_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("skill_marketplace_listings.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "skill_templates",
        sa.Column("installed_version", sa.String(20), nullable=True),
    )
    op.create_index(
        "ix_skill_templates_marketplace_listing_id",
        "skill_templates",
        ["marketplace_listing_id"],
    )


def downgrade() -> None:
    """Reverse all changes in exact reverse order."""

    # -----------------------------------------------------------------------
    # 1. Remove skill_templates extension columns
    # -----------------------------------------------------------------------
    op.drop_index(
        "ix_skill_templates_marketplace_listing_id",
        table_name="skill_templates",
    )
    op.drop_column("skill_templates", "installed_version")
    op.drop_column("skill_templates", "marketplace_listing_id")

    # -----------------------------------------------------------------------
    # 2. Drop skill_graphs: policies -> indexes -> table
    # -----------------------------------------------------------------------
    op.execute(
        text('DROP POLICY IF EXISTS "skill_graphs_service_role" ON skill_graphs')
    )
    op.execute(
        text(
            'DROP POLICY IF EXISTS "skill_graphs_workspace_isolation" ON skill_graphs'
        )
    )
    op.drop_index("ix_skill_graphs_workspace_id", table_name="skill_graphs")
    op.drop_index("ix_skill_graphs_skill_template_id", table_name="skill_graphs")
    op.drop_table("skill_graphs")

    # -----------------------------------------------------------------------
    # 3. Drop skill_reviews: policies -> indexes -> table
    # -----------------------------------------------------------------------
    op.execute(
        text('DROP POLICY IF EXISTS "skill_reviews_service_role" ON skill_reviews')
    )
    op.execute(
        text(
            'DROP POLICY IF EXISTS "skill_reviews_update_delete" ON skill_reviews'
        )
    )
    op.execute(
        text('DROP POLICY IF EXISTS "skill_reviews_write" ON skill_reviews')
    )
    op.execute(
        text('DROP POLICY IF EXISTS "skill_reviews_read" ON skill_reviews')
    )
    op.execute(text("DROP INDEX IF EXISTS uq_skill_reviews_listing_user"))
    op.drop_index("ix_skill_reviews_workspace_id", table_name="skill_reviews")
    op.drop_index("ix_skill_reviews_listing_id", table_name="skill_reviews")
    op.drop_table("skill_reviews")

    # -----------------------------------------------------------------------
    # 4. Drop skill_versions: policies -> indexes -> table
    # -----------------------------------------------------------------------
    op.execute(
        text('DROP POLICY IF EXISTS "skill_versions_service_role" ON skill_versions')
    )
    op.execute(
        text('DROP POLICY IF EXISTS "skill_versions_write" ON skill_versions')
    )
    op.execute(
        text('DROP POLICY IF EXISTS "skill_versions_read" ON skill_versions')
    )
    op.execute(text("DROP INDEX IF EXISTS uq_skill_versions_listing_version"))
    op.drop_index("ix_skill_versions_workspace_id", table_name="skill_versions")
    op.drop_index("ix_skill_versions_listing_id", table_name="skill_versions")
    op.drop_table("skill_versions")

    # -----------------------------------------------------------------------
    # 5. Drop skill_marketplace_listings: policies -> indexes -> table
    # -----------------------------------------------------------------------
    op.execute(
        text(
            'DROP POLICY IF EXISTS "skill_marketplace_listings_service_role"'
            " ON skill_marketplace_listings"
        )
    )
    op.execute(
        text(
            'DROP POLICY IF EXISTS "skill_marketplace_listings_write"'
            " ON skill_marketplace_listings"
        )
    )
    op.execute(
        text(
            'DROP POLICY IF EXISTS "skill_marketplace_listings_read"'
            " ON skill_marketplace_listings"
        )
    )
    op.execute(
        text("DROP INDEX IF EXISTS uq_skill_marketplace_listings_name_author")
    )
    op.drop_index(
        "ix_skill_marketplace_listings_workspace_id",
        table_name="skill_marketplace_listings",
    )
    op.drop_index(
        "ix_skill_marketplace_listings_category",
        table_name="skill_marketplace_listings",
    )
    op.drop_table("skill_marketplace_listings")
