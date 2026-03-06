"""Add content_hash column to graph_nodes for unkeyed node deduplication.

Revision ID: 059_add_graph_nodes_content_hash
Revises: 058_fix_graph_check_constraints
Create Date: 2026-03-05

Adds a nullable VARCHAR(64) content_hash column to graph_nodes that stores
a SHA-256 digest of (workspace_id:node_type:normalized_content) for nodes
without an external_id (decisions, patterns, preferences). Paired index
(workspace_id, content_hash) enables O(1) dedup lookup.
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "059_add_graph_nodes_content_hash"
down_revision = "058_fix_graph_check_constraints"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "graph_nodes",
        sa.Column("content_hash", sa.String(64), nullable=True),
    )
    op.create_index(
        "ix_graph_nodes_content_hash",
        "graph_nodes",
        ["workspace_id", "content_hash"],
    )


def downgrade() -> None:
    op.drop_index("ix_graph_nodes_content_hash", table_name="graph_nodes")
    op.drop_column("graph_nodes", "content_hash")
