"""Cross-phase DI wiring and contract verification (Phase 056-03, Task 2).

Verifies that all skill platform services from phases 51-54 are properly
registered in the DI container, routers are mounted on the FastAPI app,
and wiring_config includes all required modules.

These are compile-time wiring checks -- no DB or HTTP calls needed.
"""

from __future__ import annotations

from pathlib import Path

import pytest


# ---------------------------------------------------------------------------
# A. Container registration checks
# ---------------------------------------------------------------------------


class TestContainerRegistration:
    """Verify all skill platform services are registered in DI container."""

    def test_skill_generator_service_registered(self) -> None:
        """SkillGeneratorService must be registered in Container (Phase 51)."""
        from pilot_space.container.container import Container

        assert hasattr(Container, "skill_generator_service"), (
            "SkillGeneratorService not registered in Container"
        )

    def test_skill_graph_service_registered(self) -> None:
        """SkillGraphService must be registered in Container (Phase 52)."""
        from pilot_space.container.container import Container

        assert hasattr(Container, "skill_graph_service"), (
            "SkillGraphService not registered in Container"
        )

    def test_graph_compiler_service_registered(self) -> None:
        """GraphCompilerService must be registered in Container (Phase 53)."""
        from pilot_space.container.container import Container

        assert hasattr(Container, "graph_compiler_service"), (
            "GraphCompilerService not registered in Container"
        )

    def test_marketplace_service_registered(self) -> None:
        """MarketplaceService must be registered in Container (Phase 54)."""
        from pilot_space.container.container import Container

        assert hasattr(Container, "marketplace_service"), (
            "MarketplaceService not registered in Container"
        )

    def test_marketplace_install_service_registered(self) -> None:
        """MarketplaceInstallService must be registered in Container (Phase 54)."""
        from pilot_space.container.container import Container

        assert hasattr(Container, "marketplace_install_service"), (
            "MarketplaceInstallService not registered in Container"
        )

    def test_marketplace_review_service_registered(self) -> None:
        """MarketplaceReviewService must be registered in Container (Phase 54)."""
        from pilot_space.container.container import Container

        assert hasattr(Container, "marketplace_review_service"), (
            "MarketplaceReviewService not registered in Container"
        )


# ---------------------------------------------------------------------------
# B. Container provider type checks
# ---------------------------------------------------------------------------


class TestContainerProviderTypes:
    """Verify providers are Factory (not Singleton) for session-scoped services."""

    @pytest.mark.parametrize(
        "provider_name",
        [
            "skill_generator_service",
            "skill_graph_service",
            "graph_compiler_service",
            "marketplace_service",
            "marketplace_install_service",
            "marketplace_review_service",
        ],
    )
    def test_provider_is_factory(self, provider_name: str) -> None:
        """Session-scoped services must use Factory provider (new instance per request)."""
        from dependency_injector.providers import Factory

        from pilot_space.container.container import Container

        provider = getattr(Container, provider_name, None)
        assert provider is not None, f"{provider_name} not found in Container"
        assert isinstance(provider, Factory), (
            f"{provider_name} should be Factory, got {type(provider).__name__}"
        )


# ---------------------------------------------------------------------------
# C. Router registration checks
# ---------------------------------------------------------------------------


class TestRouterRegistration:
    """Verify marketplace and skill-graphs routers are mounted on FastAPI app."""

    @pytest.fixture(scope="class")
    def app_routes(self) -> list[str]:
        """Get all route paths from the FastAPI app."""
        from pilot_space.main import app

        paths: list[str] = []
        for route in app.routes:
            if hasattr(route, "path"):
                paths.append(route.path)
        return paths

    def test_marketplace_router_mounted(self, app_routes: list[str]) -> None:
        """Marketplace router must be accessible at /api/v1/workspaces/{workspace_id}/marketplace."""
        marketplace_routes = [r for r in app_routes if "/marketplace" in r]
        assert len(marketplace_routes) > 0, (
            "No marketplace routes found on FastAPI app. "
            f"Available routes: {[r for r in app_routes if 'skill' in r.lower() or 'market' in r.lower()]}"
        )

    def test_skill_graphs_router_mounted(self, app_routes: list[str]) -> None:
        """Skill graphs router must be accessible at /api/v1/workspaces/{workspace_id}/skill-graphs."""
        sg_routes = [r for r in app_routes if "/skill-graphs" in r]
        assert len(sg_routes) > 0, (
            "No skill-graphs routes found on FastAPI app. "
            f"Available routes: {[r for r in app_routes if 'skill' in r.lower() or 'graph' in r.lower()]}"
        )

    def test_marketplace_route_prefix(self, app_routes: list[str]) -> None:
        """Marketplace routes must be under /api/v1/workspaces prefix."""
        marketplace_routes = [r for r in app_routes if "/marketplace" in r]
        for route in marketplace_routes:
            assert route.startswith("/api/v1/workspaces"), (
                f"Marketplace route {route} not under /api/v1/workspaces"
            )

    def test_skill_graphs_route_prefix(self, app_routes: list[str]) -> None:
        """Skill graph routes must be under /api/v1/workspaces prefix."""
        sg_routes = [r for r in app_routes if "/skill-graphs" in r]
        for route in sg_routes:
            assert route.startswith("/api/v1/workspaces"), (
                f"Skill graph route {route} not under /api/v1/workspaces"
            )


# ---------------------------------------------------------------------------
# D. Wiring config check
# ---------------------------------------------------------------------------


class TestWiringConfig:
    """Verify wiring_config includes all modules using @inject for skill platform."""

    @pytest.fixture(scope="class")
    def container_source(self) -> str:
        """Read container.py source."""
        container_path = (
            Path(__file__).resolve().parents[2]
            / "src"
            / "pilot_space"
            / "container"
            / "container.py"
        )
        return container_path.read_text()

    def test_dependencies_module_wired(self, container_source: str) -> None:
        """api.v1.dependencies must be in wiring_config (contains marketplace deps)."""
        assert "pilot_space.api.v1.dependencies" in container_source

    def test_workspace_skills_deps_wired(self, container_source: str) -> None:
        """api.v1.dependencies_workspace_skills must be in wiring_config."""
        assert "pilot_space.api.v1.dependencies_workspace_skills" in container_source


# ---------------------------------------------------------------------------
# E. Dependency function exports
# ---------------------------------------------------------------------------


class TestDependencyExports:
    """Verify dependency functions for skill platform services are exported."""

    def test_skill_graph_service_dep_exported(self) -> None:
        """SkillGraphServiceDep must be importable from dependencies."""
        from pilot_space.api.v1.dependencies import SkillGraphServiceDep

        assert SkillGraphServiceDep is not None

    def test_graph_compiler_service_dep_exported(self) -> None:
        """GraphCompilerServiceDep must be importable from dependencies."""
        from pilot_space.api.v1.dependencies import GraphCompilerServiceDep

        assert GraphCompilerServiceDep is not None

    def test_marketplace_service_dep_exported(self) -> None:
        """MarketplaceServiceDep must be importable from dependencies."""
        from pilot_space.api.v1.dependencies import MarketplaceServiceDep

        assert MarketplaceServiceDep is not None

    def test_marketplace_install_service_dep_exported(self) -> None:
        """MarketplaceInstallServiceDep must be importable from dependencies."""
        from pilot_space.api.v1.dependencies import MarketplaceInstallServiceDep

        assert MarketplaceInstallServiceDep is not None

    def test_marketplace_review_service_dep_exported(self) -> None:
        """MarketplaceReviewServiceDep must be importable from dependencies."""
        from pilot_space.api.v1.dependencies import MarketplaceReviewServiceDep

        assert MarketplaceReviewServiceDep is not None


# ---------------------------------------------------------------------------
# F. Import chain verification
# ---------------------------------------------------------------------------


class TestImportChain:
    """Verify the full import chain works without errors (no circular deps)."""

    def test_skill_generator_service_importable(self) -> None:
        """SkillGeneratorService module must import cleanly."""
        from pilot_space.application.services.skill.skill_generator_service import (
            SkillGeneratorService,
        )

        assert SkillGeneratorService is not None

    def test_skill_graph_service_importable(self) -> None:
        """SkillGraphService module must import cleanly."""
        from pilot_space.application.services.skill.skill_graph_service import (
            SkillGraphService,
        )

        assert SkillGraphService is not None

    def test_graph_compiler_service_importable(self) -> None:
        """GraphCompilerService module must import cleanly."""
        from pilot_space.application.services.skill.graph_compiler_service import (
            GraphCompilerService,
        )

        assert GraphCompilerService is not None

    def test_marketplace_service_importable(self) -> None:
        """MarketplaceService module must import cleanly."""
        from pilot_space.application.services.skill.marketplace_service import (
            MarketplaceService,
        )

        assert MarketplaceService is not None

    def test_marketplace_install_service_importable(self) -> None:
        """MarketplaceInstallService module must import cleanly."""
        from pilot_space.application.services.skill.marketplace_install_service import (
            MarketplaceInstallService,
        )

        assert MarketplaceInstallService is not None

    def test_marketplace_review_service_importable(self) -> None:
        """MarketplaceReviewService module must import cleanly."""
        from pilot_space.application.services.skill.marketplace_review_service import (
            MarketplaceReviewService,
        )

        assert MarketplaceReviewService is not None
