"""Test script for extract-issues functionality.

Demonstrates correct usage through conversational agent architecture.
Compares old (deprecated) endpoint vs new (correct) approach.

Usage:
    uv run python -m scripts.test_extract_issues
"""

from __future__ import annotations

import asyncio
import logging
from uuid import UUID

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


async def test_deprecated_endpoint() -> None:
    """Test the deprecated /extract-issues endpoint (should return NOT_IMPLEMENTED)."""
    import httpx

    logger.info("[Test] Trying deprecated endpoint: POST /api/v1/notes/{note_id}/extract-issues")

    async with httpx.AsyncClient(base_url="http://localhost:8000") as client:
        try:
            # This endpoint is deprecated and returns NOT_IMPLEMENTED
            response = await client.post(
                "/api/v1/notes/00000000-0000-0000-0000-000000000001/extract-issues",
                json={
                    "note_id": "00000000-0000-0000-0000-000000000001",
                    "note_title": "Test Note",
                    "note_content": {"type": "doc", "content": []},
                },
                timeout=5.0,
            )

            logger.info(f"  Status: {response.status_code}")

            # Should be SSE stream with error event
            if response.status_code == 200:
                content = response.text
                logger.info(f"  Response: {content}")

                if "NOT_IMPLEMENTED" in content:
                    logger.warning("  ⚠️  Endpoint returns NOT_IMPLEMENTED (as expected)")
                    logger.info("  ℹ️  This endpoint has been deprecated")
            else:
                logger.error(f"  Unexpected status: {response.status_code}")

        except Exception as e:
            logger.error(f"  Error: {e}")


async def test_correct_approach() -> None:
    """Test the correct approach: POST /ai/chat with extraction instructions."""
    logger.info("[Test] Using correct approach: POST /api/v1/ai/chat")

    from pilot_space.ai.agents.agent_base import AgentContext
    from pilot_space.ai.agents.pilotspace_agent import ChatInput, PilotSpaceAgent
    from pilot_space.container import AppContainer

    # Initialize container
    container = AppContainer()
    container.config.from_dict(
        {
            "database_url": "sqlite+aiosqlite:///./test.db",
            "redis_url": None,  # Optional
        }
    )

    try:
        await container.init_resources()

        # Get agent
        agent: PilotSpaceAgent = container.pilot_space_agent()

        workspace_id = UUID("00000000-0000-0000-0000-000000000001")
        user_id = UUID("00000000-0000-0000-0000-000000000001")

        # Create chat input with extraction instruction
        chat_input = ChatInput(
            message=(
                "Extract actionable issues from this note:\n\n"
                "# Project Planning\n\n"
                "- TODO: Implement user authentication\n"
                "- BUG: Login form validation not working\n"
                "- Feature idea: Add dark mode toggle\n"
            ),
            context={
                "note_id": str(workspace_id),  # Mock note ID
            },
            user_id=user_id,
            workspace_id=workspace_id,
        )

        context = AgentContext(
            workspace_id=workspace_id,
            user_id=user_id,
        )

        logger.info("  Sending message to PilotSpaceAgent...")

        # Stream response
        chunk_count = 0
        async for chunk in agent.stream(chat_input, context):
            chunk_count += 1
            logger.debug(f"  Chunk {chunk_count}: {chunk[:100]}...")

            # In a real scenario, these chunks would be SSE events
            # containing extracted issues

        logger.info(f"  ✅ Received {chunk_count} chunks")

    except Exception as e:
        logger.error(f"  ❌ Error: {e}", exc_info=True)
        logger.info("\n  Possible causes:")
        logger.info("    1. Missing ANTHROPIC_API_KEY")
        logger.info("    2. Claude binary not in PATH")
        logger.info("    3. SDK configuration issue")
        logger.info("\n  Run diagnostics: uv run python -m scripts.diagnose_sdk_issues")

    finally:
        await container.shutdown_resources()


async def main() -> None:
    """Run tests."""
    print("\n" + "=" * 80)
    print("EXTRACT-ISSUES FUNCTIONALITY TEST")
    print("=" * 80)
    print("\nThis script tests two approaches:")
    print("  1. Deprecated endpoint (returns NOT_IMPLEMENTED)")
    print("  2. Correct approach (conversational agent)")
    print("\n" + "=" * 80 + "\n")

    # Test 1: Deprecated endpoint
    print("\n[Test 1] Deprecated Endpoint")
    print("-" * 80)
    try:
        await test_deprecated_endpoint()
    except Exception as e:
        logger.error(f"Test 1 failed: {e}")

    await asyncio.sleep(1)

    # Test 2: Correct approach
    print("\n[Test 2] Correct Approach (Conversational Agent)")
    print("-" * 80)
    try:
        await test_correct_approach()
    except Exception as e:
        logger.error(f"Test 2 failed: {e}")

    print("\n" + "=" * 80)
    print("RECOMMENDATIONS")
    print("=" * 80)
    print("\n✅ Use: POST /api/v1/ai/chat")
    print("   - Message: Natural language extraction instruction")
    print("   - Context: {note_id: '...'}")
    print("   - Or use slash command: /extract-issues")
    print("\n❌ Don't use: POST /api/v1/notes/{note_id}/extract-issues")
    print("   - This endpoint is deprecated")
    print("   - Returns NOT_IMPLEMENTED error")
    print("\n" + "=" * 80 + "\n")


if __name__ == "__main__":
    asyncio.run(main())
