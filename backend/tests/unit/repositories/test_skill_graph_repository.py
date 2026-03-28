"""Unit tests for SkillGraphRepository.

Tests CRUD operations and template lookup.
Uses SQLite in-memory database via local fixtures.

Source: Phase 50, P50-03
"""

from __future__ import annotations

import uuid as _uuid_mod
from collections.abc import AsyncGenerator
from typing import Any
from uuid import uuid4

import pytest
from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from pilot_space.infrastructure.database.models import Workspace
from pilot_space.infrastructure.database.models.skill_template import SkillTemplate
from pilot_space.infrastructure.database.repositories.skill_graph_repository import (
    SkillGraphRepository,
)

pytestmark = pytest.mark.asyncio

# ---------------------------------------------------------------------------
# Local SQLite schema
# ---------------------------------------------------------------------------

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT,
    avatar_url TEXT,
    default_sdlc_role TEXT,
    bio TEXT,
    ai_settings TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    is_deleted BOOLEAN DEFAULT 0 NOT NULL,
    deleted_at DATETIME
);

CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    settings TEXT DEFAULT '{}',
    audit_retention_days INTEGER,
    rate_limit_standard_rpm INTEGER,
    rate_limit_ai_rpm INTEGER,
    storage_quota_mb INTEGER,
    storage_used_bytes INTEGER DEFAULT 0 NOT NULL,
    owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    is_deleted BOOLEAN DEFAULT 0 NOT NULL,
    deleted_at DATETIME
);

CREATE TABLE IF NOT EXISTS skill_templates (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    skill_content TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'Wand2',
    sort_order INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL,
    role_type TEXT,
    is_active BOOLEAN NOT NULL DEFAULT 1,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    marketplace_listing_id TEXT,
    installed_version TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    is_deleted BOOLEAN DEFAULT 0 NOT NULL,
    deleted_at DATETIME
);

CREATE TABLE IF NOT EXISTS skill_graphs (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    skill_template_id TEXT NOT NULL REFERENCES skill_templates(id) ON DELETE CASCADE,
    graph_json TEXT NOT NULL,
    node_count INTEGER NOT NULL DEFAULT 0,
    edge_count INTEGER NOT NULL DEFAULT 0,
    last_compiled_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    is_deleted BOOLEAN DEFAULT 0 NOT NULL,
    deleted_at DATETIME
);
"""


def _register_sqlite_fns(dbapi_conn: Any, connection_record: Any) -> None:
    dbapi_conn.create_function("gen_random_uuid", 0, lambda: str(_uuid_mod.uuid4()))


@pytest.fixture
async def test_engine() -> AsyncGenerator[AsyncEngine, None]:
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False,
    )
    event.listen(engine.sync_engine, "connect", _register_sqlite_fns)
    async with engine.begin() as conn:
        for stmt in _SCHEMA_SQL.strip().split(";"):
            cleaned = stmt.strip()
            if cleaned:
                await conn.execute(text(cleaned))
    yield engine
    await engine.dispose()


@pytest.fixture
async def db_session(test_engine: AsyncEngine) -> AsyncGenerator[AsyncSession, None]:
    factory = async_sessionmaker(
        test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
    )
    async with factory() as session, session.begin():
        yield session


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
async def workspace(db_session: AsyncSession) -> Workspace:
    ws = Workspace(
        id=uuid4(),
        name="Test Workspace",
        slug="test-graph-ws",
        owner_id=uuid4(),
    )
    db_session.add(ws)
    await db_session.flush()
    return ws


@pytest.fixture
async def skill_template(
    db_session: AsyncSession,
    workspace: Workspace,
) -> SkillTemplate:
    t = SkillTemplate(
        id=uuid4(),
        workspace_id=workspace.id,
        name="Graph Skill",
        description="Skill with graph",
        skill_content="# Graph Skill\n\nContent.",
        source="workspace",
    )
    db_session.add(t)
    await db_session.flush()
    return t


@pytest.fixture
async def repo(db_session: AsyncSession) -> SkillGraphRepository:
    return SkillGraphRepository(db_session)


# ============================================================================
# Tests
# ============================================================================


class TestCreateGraph:
    """Tests for create()."""

    async def test_create_graph(
        self,
        repo: SkillGraphRepository,
        workspace: Workspace,
        skill_template: SkillTemplate,
    ) -> None:
        """Create a graph and verify all fields."""
        graph_data = {"nodes": [{"id": "n1"}], "edges": []}
        graph = await repo.create(
            workspace_id=workspace.id,
            skill_template_id=skill_template.id,
            graph_json=graph_data,
            node_count=1,
            edge_count=0,
        )

        assert graph.id is not None
        assert graph.skill_template_id == skill_template.id
        assert graph.graph_json == graph_data
        assert graph.node_count == 1
        assert graph.edge_count == 0
        assert graph.last_compiled_at is None
        assert graph.is_deleted is False

    async def test_create_with_defaults(
        self,
        repo: SkillGraphRepository,
        workspace: Workspace,
        skill_template: SkillTemplate,
    ) -> None:
        """Create with minimal fields uses default counts."""
        graph = await repo.create(
            workspace_id=workspace.id,
            skill_template_id=skill_template.id,
            graph_json={"nodes": [], "edges": []},
        )

        assert graph.node_count == 0
        assert graph.edge_count == 0


class TestGetByTemplate:
    """Tests for get_by_template()."""

    async def test_get_graph_by_template(
        self,
        repo: SkillGraphRepository,
        workspace: Workspace,
        skill_template: SkillTemplate,
    ) -> None:
        """Creates graph, retrieves by template_id."""
        await repo.create(
            workspace_id=workspace.id,
            skill_template_id=skill_template.id,
            graph_json={"nodes": [{"id": "n1"}], "edges": []},
            node_count=1,
        )

        found = await repo.get_by_template(skill_template.id)
        assert found is not None
        assert found.skill_template_id == skill_template.id
        assert found.node_count == 1

    async def test_returns_none_for_no_graph(
        self,
        repo: SkillGraphRepository,
        skill_template: SkillTemplate,
    ) -> None:
        """Returns None when no graph exists for template."""
        found = await repo.get_by_template(skill_template.id)
        assert found is None

    async def test_excludes_deleted_graphs(
        self,
        db_session: AsyncSession,
        repo: SkillGraphRepository,
        workspace: Workspace,
        skill_template: SkillTemplate,
    ) -> None:
        """Soft-deleted graphs excluded from lookup."""
        graph = await repo.create(
            workspace_id=workspace.id,
            skill_template_id=skill_template.id,
            graph_json={"nodes": [], "edges": []},
        )
        graph.is_deleted = True
        await db_session.flush()

        found = await repo.get_by_template(skill_template.id)
        assert found is None


class TestUpdateGraph:
    """Tests for update()."""

    async def test_update_graph(
        self,
        repo: SkillGraphRepository,
        workspace: Workspace,
        skill_template: SkillTemplate,
    ) -> None:
        """Modifies graph_json and verifies persistence."""
        graph = await repo.create(
            workspace_id=workspace.id,
            skill_template_id=skill_template.id,
            graph_json={"nodes": [], "edges": []},
            node_count=0,
        )

        graph.graph_json = {"nodes": [{"id": "n1"}, {"id": "n2"}], "edges": [{"from": "n1", "to": "n2"}]}
        graph.node_count = 2
        graph.edge_count = 1
        updated = await repo.update(graph)

        assert updated.node_count == 2
        assert updated.edge_count == 1
        assert len(updated.graph_json["nodes"]) == 2
