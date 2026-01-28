"""AI Context Subagent for interactive issue context aggregation.

Provides conversational interface for:
- Related document discovery
- Code snippet retrieval
- Task breakdown suggestions
- Dependency identification

Reference: docs/architect/ai-layer.md
Design Decision: DD-055 (AI Context Architecture)
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any
from uuid import UUID

from claude_agent_sdk import ClaudeAgentOptions, query

from pilot_space.ai.agents.sdk_base import AgentContext, StreamingSDKBaseAgent
from pilot_space.ai.context import (
    clear_context,
    get_api_key_lock,
    set_api_key,
    set_workspace_context,
)

if TYPE_CHECKING:
    from collections.abc import AsyncIterator


@dataclass
class AIContextInput:
    """Input for AI context subagent.

    Attributes:
        issue_id: Issue UUID to build context for
        include_code: Include related code snippets
        include_docs: Include related documentation
        include_tasks: Include task breakdown
    """

    issue_id: UUID
    include_code: bool = True
    include_docs: bool = True
    include_tasks: bool = True


@dataclass
class AIContextOutput:
    """Output from AI context aggregation.

    Attributes:
        summary: Context summary
        related_documents: Related notes and documents
        code_snippets: Relevant code snippets with explanations
        task_breakdown: Suggested task decomposition
        dependencies: Issue dependencies identified
    """

    summary: str
    related_documents: list[dict[str, Any]]
    code_snippets: list[dict[str, Any]]
    task_breakdown: list[dict[str, Any]]
    dependencies: list[dict[str, Any]]


class AIContextSubagent(StreamingSDKBaseAgent[AIContextInput, AIContextOutput]):
    """Subagent for interactive AI context conversations.

    Provides multi-turn context building with semantic search,
    code analysis, and task planning.

    Usage:
        subagent = AIContextSubagent(...)
        async for chunk in subagent.execute_stream(input_data, context):
            yield chunk
    """

    AGENT_NAME = "ai_context_subagent"
    DEFAULT_MODEL = "claude-sonnet-4-20250514"

    def get_system_prompt(self) -> str:
        """Get system prompt for AI context.

        Returns:
            System prompt string with context guidelines
        """
        return """You are an AI assistant helping developers understand issue context.

Your role:
1. **Discover Related Content**: Find relevant notes, docs, code, issues
2. **Explain Connections**: Clarify how pieces relate to current issue
3. **Suggest Tasks**: Break down issue into actionable subtasks
4. **Identify Dependencies**: Find blocking issues or prerequisites

Use available tools to:
- Search semantic knowledge base for related content
- Query codebase for relevant implementations
- Find similar resolved issues for reference
- Retrieve linked PRs and commits

Format responses:
- Use bullet points for lists
- Include file paths and line numbers for code
- Provide clickable issue/PR references
- Highlight confidence level (RECOMMENDED | DEFAULT | CURRENT | ALTERNATIVE)

Be concise but thorough. Focus on actionable insights."""

    def get_tools(self) -> list[dict[str, Any]]:
        """Get MCP tools for AI context.

        Returns:
            List of tool definitions for search and analysis
        """
        return [
            {
                "name": "search_related_notes",
                "description": "Search for related notes using semantic similarity",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string"},
                        "limit": {"type": "integer", "default": 5},
                    },
                    "required": ["query"],
                },
            },
            {
                "name": "search_codebase",
                "description": "Search codebase for relevant code snippets",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string"},
                        "language": {"type": "string"},
                        "limit": {"type": "integer", "default": 5},
                    },
                    "required": ["query"],
                },
            },
            {
                "name": "find_similar_issues",
                "description": "Find similar resolved issues",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "issue_id": {"type": "string"},
                        "limit": {"type": "integer", "default": 5},
                    },
                    "required": ["issue_id"],
                },
            },
            {
                "name": "get_issue_history",
                "description": "Get issue activity history and linked PRs",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "issue_id": {"type": "string"},
                    },
                    "required": ["issue_id"],
                },
            },
        ]

    async def _get_api_key(self, workspace_id: UUID | None) -> str:
        """Get Anthropic API key from workspace settings.

        Args:
            workspace_id: Workspace UUID

        Returns:
            Decrypted API key

        Raises:
            ValueError: If API key not found
        """
        if not workspace_id:
            api_key = os.getenv("ANTHROPIC_API_KEY")
            if not api_key:
                msg = "No workspace_id provided and ANTHROPIC_API_KEY not set"
                raise ValueError(msg)
            return api_key

        # TODO: Integrate with SecureKeyStorage when available
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            msg = (
                f"Anthropic API key not found for workspace {workspace_id}. "
                "Please set ANTHROPIC_API_KEY environment variable or "
                "configure in workspace settings."
            )
            raise ValueError(msg)
        return api_key

    def _build_prompt(self, input_data: AIContextInput) -> str:
        """Build AI context prompt from input data.

        Args:
            input_data: AI context input

        Returns:
            Formatted prompt string
        """
        context_types = []
        if input_data.include_code:
            context_types.append("related code snippets")
        if input_data.include_docs:
            context_types.append("related documentation")
        if input_data.include_tasks:
            context_types.append("task breakdown suggestions")

        types_str = ", ".join(context_types) if context_types else "comprehensive context"

        return f"""Build AI context for issue {input_data.issue_id}.

Discover and aggregate: {types_str}

Your goals:
1. Find related notes and documents using semantic search
2. Identify relevant code implementations
3. Suggest actionable task breakdown
4. Identify dependencies and blockers

Use available tools to:
- Search the knowledge base for related content
- Query the codebase for relevant implementations
- Find similar resolved issues for reference
- Retrieve linked PRs and commit history

Format responses with:
- Bullet points for lists
- File paths and line numbers for code references
- Clickable issue/PR references
- Confidence tags: RECOMMENDED | DEFAULT | CURRENT | ALTERNATIVE

Focus on actionable insights that help developers understand and implement this issue."""

    def _create_agent_options(self, context: AgentContext) -> ClaudeAgentOptions:  # noqa: ARG002
        """Create Claude SDK options for AI context.

        Args:
            context: Agent execution context

        Returns:
            ClaudeAgentOptions configured for AI context
        """
        return ClaudeAgentOptions(  # type: ignore[call-arg]
            model=self.DEFAULT_MODEL,
            allowed_tools=[
                "Read",
                "Glob",
                "Grep",
            ],
            setting_sources=["project"],  # type: ignore[call-arg]
        )

    def _transform_sdk_message(
        self, message: Any, context: AgentContext  # noqa: ARG002
    ) -> str | None:
        """Transform Claude SDK message to SSE event.

        Args:
            message: SDK message object
            context: Agent execution context

        Returns:
            SSE-formatted string or None if message should be ignored
        """
        # Handle StreamEvent messages
        if hasattr(message, "type"):
            msg_type = getattr(message, "type", None)

            # Text streaming
            if msg_type == "text_delta" and hasattr(message, "delta"):
                content = message.delta
                content_escaped = content.replace("'", "\\'").replace("\n", "\\n")
                return f"data: {{'type': 'text_delta', 'content': '{content_escaped}'}}\n\n"

            # Tool use
            if msg_type == "tool_use" and hasattr(message, "id"):
                tool_call_id = message.id
                tool_name = getattr(message, "name", "")
                return (
                    f"data: {{'type': 'tool_use', 'tool_call_id': '{tool_call_id}', "
                    f"'tool_name': '{tool_name}'}}\n\n"
                )

            # Tool result
            if msg_type == "tool_result" and hasattr(message, "tool_use_id"):
                tool_call_id = message.tool_use_id
                is_error = getattr(message, "is_error", False)
                status = "failed" if is_error else "completed"
                return (
                    f"data: {{'type': 'tool_result', 'tool_call_id': '{tool_call_id}', "
                    f"'status': '{status}'}}\n\n"
                )

            # Message stop
            if msg_type == "stop":
                return "data: {'type': 'message_stop'}\n\n"

        # Handle AssistantMessage (final response)
        if hasattr(message, "content") and hasattr(message, "role"):
            if message.role == "assistant":
                content = message.content
                if isinstance(content, list):
                    text_content = " ".join(
                        block.get("text", "") for block in content if isinstance(block, dict)
                    )
                else:
                    text_content = str(content)

                text_escaped = text_content.replace("'", "\\'").replace("\n", "\\n")
                return f"data: {{'type': 'text_delta', 'content': '{text_escaped}'}}\n\n"

        return None

    async def stream(
        self,
        input_data: AIContextInput,
        context: AgentContext,
    ) -> AsyncIterator[str]:
        """Execute AI context with streaming.

        Args:
            input_data: AI context input
            context: Agent execution context

        Yields:
            SSE chunks with context discoveries
        """
        try:
            # Get API key from context
            api_key = await self._get_api_key(context.workspace_id)

            # Build prompt specific to AI context
            prompt = self._build_prompt(input_data)

            # Create SDK options
            sdk_options = self._create_agent_options(context)

            # Set context for observability
            set_api_key(api_key)
            set_workspace_context(context.workspace_id, context.user_id)

            # CRITICAL: Acquire lock before setting os.environ
            async with get_api_key_lock():
                original_api_key = os.getenv("ANTHROPIC_API_KEY")
                os.environ["ANTHROPIC_API_KEY"] = api_key

                try:
                    # Stream from Claude SDK
                    async for message in query(prompt=prompt, options=sdk_options):
                        # Transform SDK message to SSE event
                        sse_event = self._transform_sdk_message(message, context)
                        if sse_event:
                            yield sse_event
                finally:
                    # Restore original API key
                    if original_api_key:
                        os.environ["ANTHROPIC_API_KEY"] = original_api_key
                    elif "ANTHROPIC_API_KEY" in os.environ:
                        del os.environ["ANTHROPIC_API_KEY"]
                    clear_context()

        except Exception as e:
            # Error handling
            error_msg = str(e).replace("'", "\\'")
            yield f"data: {{'type': 'error', 'error_type': 'ai_context_error', 'message': '{error_msg}'}}\n\n"
