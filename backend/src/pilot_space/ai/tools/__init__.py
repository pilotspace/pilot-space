"""MCP Tool Definitions for Claude Agent SDK.

This package contains tool definitions that expose Pilot Space
data and functionality to Claude agents via the Model Context Protocol.

Tool Categories:
    database: Issue, Note, Project, Cycle context retrieval and mutations
    github: PR details, diff, code search, comments
    search: Semantic search, similar issue detection
    note: Note content manipulation and AI enhancements
    issue: Issue creation and linking from notes

Usage:
    from pilot_space.ai.tools import ToolRegistry, ToolContext

    # Get all tools for an agent
    tools = ToolRegistry.get_tools()

    # Get tools by category
    db_tools = ToolRegistry.get_tools(categories=["database"])

    # Get specific tools
    issue_tools = ToolRegistry.get_tools(names=["get_issue_context", "create_issue"])

All tools are registered automatically when imported.
"""

# Import all tools to trigger registration
from pilot_space.ai.tools.database_tools import (
    create_issue,
    create_note_annotation,
    find_similar_issues,
    get_cycle_context,
    get_issue_context,
    get_note_content,
    get_page_content,
    get_project_context,
    get_workspace_members,
)
from pilot_space.ai.tools.github_tools import (
    get_pr_details,
    get_pr_diff,
    post_pr_comment,
    search_code_in_repo,
)
from pilot_space.ai.tools.mcp_server import (
    ToolContext,
    ToolRegistry,
    register_tool,
)
from pilot_space.ai.tools.note_tools import (
    create_issue_from_note,
    enhance_text,
    extract_issues,
    link_existing_issues,
    summarize_note,
    update_note_block,
)
from pilot_space.ai.tools.search_tools import (
    search_codebase,
    semantic_search,
)

__all__ = [
    "ToolContext",
    "ToolRegistry",
    "create_issue",
    "create_issue_from_note",
    "create_note_annotation",
    "enhance_text",
    "extract_issues",
    "find_similar_issues",
    "get_cycle_context",
    "get_issue_context",
    "get_note_content",
    "get_page_content",
    "get_pr_details",
    "get_pr_diff",
    "get_project_context",
    "get_workspace_members",
    "link_existing_issues",
    "post_pr_comment",
    "register_tool",
    "search_code_in_repo",
    "search_codebase",
    "semantic_search",
    "summarize_note",
    "update_note_block",
]
