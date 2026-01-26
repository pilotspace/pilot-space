"""MCP Tool Registry for Claude Agent SDK.

Provides tool registration and selection for agent orchestration.
Tools are registered via decorators and selected per agent needs.

Reference: Claude Agent SDK patterns
T017: Create Tool Registry Factory
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, TypeVar

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


# Type for tool functions
ToolFunc = TypeVar("ToolFunc", bound=Callable[..., Any])

# Global tool registry
_TOOL_REGISTRY: dict[str, Callable[..., Any]] = {}
_TOOL_CATEGORIES: dict[str, list[str]] = {
    "database": [],
    "github": [],
    "search": [],
}


def register_tool(category: str) -> Callable[[ToolFunc], ToolFunc]:
    """Decorator to register an MCP tool.

    Usage:
        @register_tool("database")
        async def get_issue_context(...):
            ...

    Args:
        category: Tool category (database, github, search)

    Returns:
        Decorator function
    """

    def decorator(func: ToolFunc) -> ToolFunc:
        _TOOL_REGISTRY[func.__name__] = func
        if category in _TOOL_CATEGORIES:
            _TOOL_CATEGORIES[category].append(func.__name__)
        return func

    return decorator


@dataclass
class ToolContext:
    """Context passed to tools during execution.

    Contains database session and user context for RLS.
    """

    db_session: AsyncSession
    workspace_id: str
    user_id: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)


class ToolRegistry:
    """Registry for MCP tools used by Claude Agent SDK.

    Provides tool selection and filtering for agents.
    Each agent requests specific tools or categories.

    Usage:
        registry = ToolRegistry()
        tools = registry.get_tools(categories=["database"])
        # Pass tools to ClaudeSDKClient
    """

    @classmethod
    def get_tool(cls, name: str) -> Callable[..., Any] | None:
        """Get a specific tool by name.

        Args:
            name: Tool function name

        Returns:
            Tool function or None if not found
        """
        return _TOOL_REGISTRY.get(name)

    @classmethod
    def get_tools(
        cls,
        names: list[str] | None = None,
        categories: list[str] | None = None,
    ) -> list[Callable[..., Any]]:
        """Get tools by name or category.

        Args:
            names: Specific tool names to include
            categories: Tool categories to include

        Returns:
            List of tool functions
        """
        selected: list[Callable[..., Any]] = []

        if names:
            for name in names:
                if name in _TOOL_REGISTRY:
                    selected.append(_TOOL_REGISTRY[name])

        if categories:
            for category in categories:
                if category in _TOOL_CATEGORIES:
                    for name in _TOOL_CATEGORIES[category]:
                        tool = _TOOL_REGISTRY.get(name)
                        if tool and tool not in selected:
                            selected.append(tool)

        # If nothing specified, return all
        if not names and not categories:
            selected = list(_TOOL_REGISTRY.values())

        return selected

    @classmethod
    def get_all_tool_names(cls) -> list[str]:
        """Get all registered tool names.

        Returns:
            List of tool function names
        """
        return list(_TOOL_REGISTRY.keys())

    @classmethod
    def get_tools_by_category(cls, category: str) -> list[str]:
        """Get tool names for a specific category.

        Args:
            category: Category name (database, github, search)

        Returns:
            List of tool names in the category
        """
        return _TOOL_CATEGORIES.get(category, []).copy()

    @classmethod
    def get_categories(cls) -> list[str]:
        """Get all available categories.

        Returns:
            List of category names
        """
        return list(_TOOL_CATEGORIES.keys())
