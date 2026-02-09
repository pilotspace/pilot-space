"""Unit tests for AIContextAgent.

Tests the AIContextAgent that uses claude_agent_sdk.query() for tool-free
JSON generation and PilotSpaceAgent for refinement streaming.

Covers:
- Data class construction and serialization
- Prompt building (generation vs refinement modes)
- Response parsing into AIContextOutput
- Error handling
- SSE text extraction (for refinement streaming)
- SDK query() execution
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest

from pilot_space.ai.agents.agent_base import AgentContext
from pilot_space.ai.agents.ai_context_agent import (
    AIContextAgent,
    AIContextInput,
    AIContextOutput,
    CodeReference,
    RelatedItem,
)

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def workspace_id() -> UUID:
    return uuid4()


@pytest.fixture
def user_id() -> UUID:
    return uuid4()


@pytest.fixture
def agent_context(workspace_id: UUID, user_id: UUID) -> AgentContext:
    return AgentContext(
        workspace_id=workspace_id,
        user_id=user_id,
        operation_id=None,
        metadata={"correlation_id": "test-123"},
    )


@pytest.fixture
def sample_input(workspace_id: UUID) -> AIContextInput:
    return AIContextInput(
        issue_id=str(uuid4()),
        issue_title="Implement rate limiting",
        issue_description="Add rate limiting middleware to API endpoints",
        issue_identifier="PILOT-42",
        workspace_id=str(workspace_id),
        project_name="Backend",
        related_issues=[
            RelatedItem(
                id=str(uuid4()),
                type="issue",
                title="Add Redis caching",
                relevance_score=0.8,
                excerpt="Implement Redis-based caching for API responses",
                identifier="PILOT-40",
                state="Done",
            ),
        ],
        related_notes=[
            RelatedItem(
                id=str(uuid4()),
                type="note",
                title="Architecture Notes",
                relevance_score=0.6,
                excerpt="Rate limiting design discussion",
            ),
        ],
        code_references=[
            CodeReference(
                file_path="backend/src/middleware/auth.py",
                description="Existing middleware pattern",
                relevance="high",
            ),
        ],
    )


@pytest.fixture
def mock_pilotspace_agent() -> MagicMock:
    agent = MagicMock()
    agent.execute = AsyncMock()
    agent.stream = AsyncMock()
    agent._get_api_key = AsyncMock(return_value="test-api-key")
    return agent


@pytest.fixture
def mock_deps() -> dict[str, MagicMock]:
    return {
        "tool_registry": MagicMock(),
        "provider_selector": MagicMock(),
        "cost_tracker": MagicMock(),
        "resilient_executor": MagicMock(),
    }


@pytest.fixture
def agent(mock_pilotspace_agent: MagicMock, mock_deps: dict[str, MagicMock]) -> AIContextAgent:
    return AIContextAgent(
        pilotspace_agent=mock_pilotspace_agent,
        **mock_deps,
    )


# =============================================================================
# Data Class Tests
# =============================================================================


class TestRelatedItem:
    """Test RelatedItem data class."""

    def test_minimal_construction(self) -> None:
        item = RelatedItem(id="123", type="issue", title="Test", relevance_score=0.5)
        assert item.id == "123"
        assert item.type == "issue"
        assert item.excerpt == ""
        assert item.identifier is None
        assert item.state is None

    def test_full_construction(self) -> None:
        item = RelatedItem(
            id="456",
            type="note",
            title="Design Doc",
            relevance_score=0.9,
            excerpt="Important notes",
            identifier="PILOT-10",
            state="In Progress",
        )
        assert item.identifier == "PILOT-10"
        assert item.state == "In Progress"


class TestCodeReference:
    """Test CodeReference data class."""

    def test_minimal_construction(self) -> None:
        ref = CodeReference(file_path="src/main.py")
        assert ref.file_path == "src/main.py"
        assert ref.description == ""
        assert ref.line_range is None
        assert ref.relevance == "medium"

    def test_with_line_range(self) -> None:
        ref = CodeReference(
            file_path="src/api.py",
            description="API handler",
            line_range=(10, 50),
            relevance="high",
        )
        assert ref.line_range == (10, 50)


class TestAIContextInput:
    """Test AIContextInput data class."""

    def test_minimal_construction(self) -> None:
        inp = AIContextInput(
            issue_id="123",
            issue_title="Test",
            issue_description=None,
            issue_identifier="PS-1",
            workspace_id="ws-1",
        )
        assert inp.related_issues == []
        assert inp.related_notes == []
        assert inp.code_references == []
        assert inp.conversation_history == []
        assert inp.refinement_query is None

    def test_refinement_mode(self) -> None:
        inp = AIContextInput(
            issue_id="123",
            issue_title="Test",
            issue_description="Desc",
            issue_identifier="PS-1",
            workspace_id="ws-1",
            refinement_query="How long would this take?",
            conversation_history=[
                {"role": "assistant", "content": "Previous answer"},
            ],
        )
        assert inp.refinement_query is not None


class TestAIContextOutput:
    """Test AIContextOutput data class."""

    def test_to_content_dict(self) -> None:
        output = AIContextOutput(
            summary="Test summary",
            analysis="Test analysis",
            complexity="medium",
            estimated_effort="M",
            tasks_checklist=[{"id": "task-1", "description": "Do thing"}],
            related_issues=[],
            related_notes=[],
        )
        content = output.to_content_dict()
        assert content == {
            "summary": "Test summary",
            "analysis": "Test analysis",
            "complexity": "medium",
            "estimated_effort": "M",
        }

    def test_defaults(self) -> None:
        output = AIContextOutput(
            summary="s",
            analysis="a",
            complexity="low",
            estimated_effort="S",
            tasks_checklist=[],
            related_issues=[],
            related_notes=[],
        )
        assert output.related_pages == []
        assert output.code_references == []
        assert output.conversation_history == []
        assert output.claude_code_prompt is None


# =============================================================================
# Prompt Building Tests
# =============================================================================


class TestPromptBuilding:
    """Test prompt construction for generation and refinement modes."""

    def test_generation_prompts_include_system_instructions(
        self, agent: AIContextAgent, sample_input: AIContextInput
    ) -> None:
        system_prompt, user_prompt = agent._build_prompts(sample_input)
        assert "JSON" in system_prompt or "json" in system_prompt
        assert "software architect" in system_prompt.lower()

    def test_generation_prompts_include_issue_details(
        self, agent: AIContextAgent, sample_input: AIContextInput
    ) -> None:
        _system, user_prompt = agent._build_prompts(sample_input)
        assert "PILOT-42" in user_prompt
        assert "Implement rate limiting" in user_prompt

    def test_generation_prompts_include_related_issues(
        self, agent: AIContextAgent, sample_input: AIContextInput
    ) -> None:
        _system, user_prompt = agent._build_prompts(sample_input)
        assert "PILOT-40" in user_prompt
        assert "Add Redis caching" in user_prompt

    def test_generation_prompts_include_code_files(
        self, agent: AIContextAgent, sample_input: AIContextInput
    ) -> None:
        _system, user_prompt = agent._build_prompts(sample_input)
        assert "backend/src/middleware/auth.py" in user_prompt

    def test_refinement_prompts_use_query(
        self, agent: AIContextAgent, sample_input: AIContextInput
    ) -> None:
        sample_input.refinement_query = "How long would this take?"
        sample_input.conversation_history = [
            {"role": "assistant", "content": "Previous context generated."},
        ]
        system_prompt, user_prompt = agent._build_prompts(sample_input)
        assert "How long would this take?" in user_prompt
        # System prompt should be refinement-specific, not generation
        assert "refinement" in system_prompt.lower() or "refine" in system_prompt.lower()

    def test_refinement_with_empty_history(
        self, agent: AIContextAgent, sample_input: AIContextInput
    ) -> None:
        sample_input.refinement_query = "More details?"
        sample_input.conversation_history = []
        _system, user_prompt = agent._build_prompts(sample_input)
        assert "More details?" in user_prompt


# =============================================================================
# Response Parsing Tests
# =============================================================================


class TestResponseParsing:
    """Test parsing response into AIContextOutput."""

    def test_parse_valid_json_response(
        self, agent: AIContextAgent, sample_input: AIContextInput
    ) -> None:
        response = """Here is the context:
```json
{
  "summary": "Rate limiting implementation required",
  "analysis": "Need middleware with Redis backend",
  "complexity": "medium",
  "estimated_effort": "M",
  "key_considerations": ["Redis availability"],
  "suggested_approach": "Sliding window pattern",
  "potential_blockers": ["Redis not configured"],
  "tasks": [
    {"id": "task-1", "description": "Create limiter class", "order": 1, "estimated_effort": "M", "dependencies": []}
  ],
  "claude_code_sections": {
    "context": "Adding rate limiting",
    "code_references": ["src/middleware/"],
    "instructions": "Implement sliding window",
    "constraints": "Follow existing patterns"
  }
}
```"""
        output = agent._parse_response(response, sample_input)
        assert output.summary == "Rate limiting implementation required"
        assert output.complexity == "medium"
        assert len(output.tasks_checklist) == 1
        assert output.tasks_checklist[0]["id"] == "task-1"
        assert output.claude_code_prompt is not None
        assert "PILOT-42" in output.claude_code_prompt

    def test_parse_response_preserves_related_items(
        self, agent: AIContextAgent, sample_input: AIContextInput
    ) -> None:
        response = '{"summary": "Test", "analysis": "", "complexity": "low", "estimated_effort": "S", "tasks": [], "claude_code_sections": {}}'
        output = agent._parse_response(response, sample_input)
        assert len(output.related_issues) == 1
        assert output.related_issues[0]["identifier"] == "PILOT-40"
        assert len(output.related_notes) == 1
        assert len(output.code_references) == 1

    def test_parse_response_fallback_on_bad_json(
        self, agent: AIContextAgent, sample_input: AIContextInput
    ) -> None:
        response = "This is just plain text with no JSON at all."
        output = agent._parse_response(response, sample_input)
        assert output.summary == "Unable to generate summary."
        assert output.complexity == "medium"


# =============================================================================
# SSE Text Extraction Tests (for refinement streaming)
# =============================================================================


class TestSSEExtraction:
    """Test extracting text from SSE event chunks."""

    def test_extract_text_delta(self) -> None:
        chunk = 'event: text_delta\ndata: {"delta": "Hello world"}\n\n'
        assert AIContextAgent._extract_text_from_sse(chunk) == "Hello world"

    def test_extract_plain_data(self) -> None:
        chunk = "data: Some plain text\n\n"
        assert AIContextAgent._extract_text_from_sse(chunk) == "Some plain text"

    def test_extract_from_error_event(self) -> None:
        chunk = 'event: error\ndata: {"errorCode": "sdk_error", "message": "fail"}\n\n'
        assert AIContextAgent._extract_text_from_sse(chunk) is None  # No delta or text key

    def test_extract_from_message_stop(self) -> None:
        chunk = 'event: message_stop\ndata: {"stopReason": "end_turn"}\n\n'
        assert AIContextAgent._extract_text_from_sse(chunk) is None

    def test_extract_empty_chunk(self) -> None:
        assert AIContextAgent._extract_text_from_sse("") is None

    def test_extract_multi_event_chunk(self) -> None:
        """DeltaBuffer flush can return multiple SSE events concatenated."""
        chunk = (
            'event: content_block_start\ndata: {"blockIndex": 0}\n\n'
            'event: text_delta\ndata: {"delta": "Hello "}\n\n'
            'event: text_delta\ndata: {"delta": "world"}\n\n'
        )
        assert AIContextAgent._extract_text_from_sse(chunk) == "Hello world"

    def test_extract_skips_non_text_in_multi_event(self) -> None:
        """Non-text events (thinking, tool_input, message_stop) should be skipped."""
        chunk = (
            'event: thinking_delta\ndata: {"delta": "thinking..."}\n\n'
            'event: text_delta\ndata: {"delta": "visible text"}\n\n'
            'event: tool_input_delta\ndata: {"delta": "partial json"}\n\n'
            'event: message_stop\ndata: {"stopReason": "end_turn"}\n\n'
        )
        assert AIContextAgent._extract_text_from_sse(chunk) == "visible text"

    def test_extract_text_field_variant(self) -> None:
        """Some events use 'text' instead of 'delta'."""
        chunk = 'event: text_delta\ndata: {"text": "from text field"}\n\n'
        assert AIContextAgent._extract_text_from_sse(chunk) == "from text field"


# =============================================================================
# SDK Query Execution Tests
# =============================================================================


class TestExecuteQuery:
    """Test _execute_query using claude_agent_sdk.query()."""

    @pytest.mark.asyncio
    async def test_execute_query_extracts_text_blocks(
        self,
        agent: AIContextAgent,
        agent_context: AgentContext,
    ) -> None:
        """query() should extract TextBlock content from AssistantMessage."""
        from claude_agent_sdk import AssistantMessage, ResultMessage, TextBlock

        json_text = '{"summary": "Test summary", "analysis": "Analysis", "complexity": "low", "estimated_effort": "S", "tasks": [], "claude_code_sections": {}}'

        assistant_msg = AssistantMessage(
            content=[TextBlock(text=json_text)],
            model="claude-sonnet-4-20250514",
        )
        result_msg = ResultMessage(
            subtype="result",
            duration_ms=1000,
            duration_api_ms=800,
            is_error=False,
            num_turns=1,
            session_id="test-session",
            total_cost_usd=0.01,
        )

        async def mock_query(*, prompt: str, options: Any, **kwargs: Any):  # type: ignore[no-untyped-def]
            yield assistant_msg
            yield result_msg

        with patch("claude_agent_sdk.query", side_effect=mock_query):
            result = await agent._execute_query(
                "system prompt",
                "user prompt",
                agent_context,
            )

        assert "Test summary" in result

    @pytest.mark.asyncio
    async def test_execute_query_handles_empty_response(
        self,
        agent: AIContextAgent,
        agent_context: AgentContext,
    ) -> None:
        """Empty response from query() should return empty string."""
        from claude_agent_sdk import ResultMessage

        result_msg = ResultMessage(
            subtype="result",
            duration_ms=100,
            duration_api_ms=50,
            is_error=False,
            num_turns=1,
            session_id="test-session",
        )

        async def mock_query(*, prompt: str, options: Any, **kwargs: Any):  # type: ignore[no-untyped-def]
            yield result_msg

        with patch("claude_agent_sdk.query", side_effect=mock_query):
            result = await agent._execute_query(
                "system prompt",
                "user prompt",
                agent_context,
            )

        assert result == ""


# =============================================================================
# Agent Run Tests
# =============================================================================


class TestAgentRun:
    """Test AIContextAgent.run() end-to-end."""

    @pytest.mark.asyncio
    async def test_run_success(
        self,
        agent: AIContextAgent,
        sample_input: AIContextInput,
        agent_context: AgentContext,
    ) -> None:
        json_response = '{"summary": "Test", "analysis": "Analysis", "complexity": "low", "estimated_effort": "S", "tasks": [], "claude_code_sections": {}}'

        with patch.object(agent, "_execute_query", new_callable=AsyncMock) as mock_exec:
            mock_exec.return_value = json_response

            result = await agent.run(sample_input, agent_context)

        assert result.success is True
        assert result.output is not None
        assert result.output.summary == "Test"
        assert result.output.complexity == "low"

    @pytest.mark.asyncio
    async def test_run_failure_returns_error(
        self,
        agent: AIContextAgent,
        sample_input: AIContextInput,
        agent_context: AgentContext,
    ) -> None:
        with patch.object(agent, "_execute_query", new_callable=AsyncMock) as mock_exec:
            mock_exec.side_effect = RuntimeError("SDK connection failed")

            result = await agent.run(sample_input, agent_context)

        assert result.success is False
        assert result.error is not None
        assert "SDK connection failed" in result.error


class TestAgentRunStream:
    """Test AIContextAgent.run_stream() SSE streaming delegation."""

    @pytest.mark.asyncio
    async def test_stream_yields_text_chunks(
        self,
        agent: AIContextAgent,
        mock_pilotspace_agent: MagicMock,
        sample_input: AIContextInput,
        agent_context: AgentContext,
    ) -> None:
        sample_input.refinement_query = "Tell me more"
        sample_input.conversation_history = [
            {"role": "assistant", "content": "Previous answer"},
        ]

        async def mock_stream(*_args: Any, **_kwargs: Any):  # type: ignore[no-untyped-def]
            yield 'event: text_delta\ndata: {"delta": "Here "}\n\n'
            yield 'event: text_delta\ndata: {"delta": "you go"}\n\n'
            yield 'event: message_stop\ndata: {"stopReason": "end_turn"}\n\n'

        mock_pilotspace_agent.stream = mock_stream

        chunks: list[str] = []
        async for chunk in agent.run_stream(sample_input, agent_context):
            chunks.append(chunk)

        assert chunks == ["Here ", "you go"]

    @pytest.mark.asyncio
    async def test_stream_filters_non_text_events(
        self,
        agent: AIContextAgent,
        mock_pilotspace_agent: MagicMock,
        sample_input: AIContextInput,
        agent_context: AgentContext,
    ) -> None:
        sample_input.refinement_query = "More details"

        async def mock_stream(*_args: Any, **_kwargs: Any):  # type: ignore[no-untyped-def]
            yield 'event: message_start\ndata: {"sessionId": "abc"}\n\n'
            yield 'event: text_delta\ndata: {"delta": "Content"}\n\n'
            yield 'event: tool_use\ndata: {"toolName": "search"}\n\n'

        mock_pilotspace_agent.stream = mock_stream

        chunks: list[str] = []
        async for chunk in agent.run_stream(sample_input, agent_context):
            chunks.append(chunk)

        assert chunks == ["Content"]
