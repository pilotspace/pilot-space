"""Unit tests for BatchImplHandler.

Tests PR URL regex extraction and subprocess lifecycle mocking.
Uses pytest-asyncio for async tests.

Phase 76 Plan 02 -- BatchImplHandler test suite.
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from pilot_space.infrastructure.queue.handlers.batch_impl_handler import (
    PR_URL_PATTERN,
    BatchImplHandler,
)


# ---------------------------------------------------------------------------
# PR URL regex tests (pure, no async needed)
# ---------------------------------------------------------------------------


class TestPrUrlPattern:
    """Tests for PR_URL_PATTERN regex."""

    def test_pr_url_extraction(self) -> None:
        """Verify regex matches a clean GitHub PR URL."""
        line = "https://github.com/owner/repo/pull/42"
        match = PR_URL_PATTERN.search(line)
        assert match is not None
        assert match.group(0) == "https://github.com/owner/repo/pull/42"

    def test_pr_url_pilotspace_repo(self) -> None:
        """Verify regex matches a pilotspace-specific PR URL."""
        line = "https://github.com/pilotspace/pilot-space/pull/123"
        match = PR_URL_PATTERN.search(line)
        assert match is not None
        assert match.group(0) == "https://github.com/pilotspace/pilot-space/pull/123"

    def test_pr_url_no_match(self) -> None:
        """Random text should not match."""
        line = "No pull request URL here, just random text."
        match = PR_URL_PATTERN.search(line)
        assert match is None

    def test_pr_url_in_rich_output(self) -> None:
        """URL embedded in surrounding text should still be extracted."""
        line = "OK https://github.com/org/repo/pull/99 done"
        match = PR_URL_PATTERN.search(line)
        assert match is not None
        assert match.group(0) == "https://github.com/org/repo/pull/99"

    def test_pr_url_not_gitlab(self) -> None:
        """GitLab URLs should not match (regex anchors to github.com)."""
        line = "https://gitlab.com/org/repo/merge_requests/10"
        match = PR_URL_PATTERN.search(line)
        assert match is None

    def test_pr_url_large_pr_number(self) -> None:
        """Large PR numbers should match."""
        line = "Created PR: https://github.com/company/service/pull/9999"
        match = PR_URL_PATTERN.search(line)
        assert match is not None
        assert "pull/9999" in match.group(0)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_handler(
    active_procs: dict | None = None,
) -> BatchImplHandler:
    """Create a BatchImplHandler with mocked dependencies."""
    session_factory = MagicMock()
    redis_client = AsyncMock()

    if active_procs is None:
        active_procs = {}

    return BatchImplHandler(
        session_factory=session_factory,
        redis_client=redis_client,
        active_procs=active_procs,
    )


def _make_proc(returncode: int = 0, stdout_lines: list[str] | None = None) -> MagicMock:
    """Build a mock asyncio subprocess with configurable stdout."""
    lines = stdout_lines or []
    encoded = [f"{line}\n".encode() for line in lines]

    async def _aiter_stdout() -> asyncio.AsyncGenerator[bytes, None]:
        for chunk in encoded:
            yield chunk

    proc = MagicMock()
    proc.returncode = returncode
    proc.stdout = MagicMock()
    proc.stdout.__aiter__ = lambda self: _aiter_stdout()
    proc.wait = AsyncMock(return_value=returncode)
    proc.terminate = MagicMock()
    proc.kill = MagicMock()
    return proc


# ---------------------------------------------------------------------------
# Subprocess lifecycle tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_timeout_kills_process() -> None:
    """When subprocess times out, terminate() is called."""
    finalize_failure_calls: list[dict] = []
    finalize_success_calls: list[dict] = []

    handler = _make_handler()
    proc = _make_proc(returncode=-1, stdout_lines=[])

    # Make stdout iteration block forever to trigger timeout
    async def _blocking_aiter() -> asyncio.AsyncGenerator[bytes, None]:
        await asyncio.sleep(9999)
        yield b""

    proc.stdout.__aiter__ = lambda self: _blocking_aiter()

    # Replace finalize methods with tracking stubs
    async def _fake_failure(*args: object, **kwargs: object) -> None:
        finalize_failure_calls.append({"args": args, **kwargs})

    async def _fake_success(*args: object, **kwargs: object) -> None:
        finalize_success_calls.append({"args": args, **kwargs})

    handler._finalize_failure = _fake_failure  # type: ignore[method-assign]
    handler._finalize_success = _fake_success  # type: ignore[method-assign]
    handler._update_status = AsyncMock()  # type: ignore[method-assign]
    handler._publish = AsyncMock()  # type: ignore[method-assign]

    with (
        patch(
            "pilot_space.infrastructure.queue.handlers.batch_impl_handler.TIMEOUT_S",
            0.05,
        ),
        patch(
            "pilot_space.infrastructure.queue.handlers.batch_impl_handler._SIGTERM_GRACE_S",
            0.05,
        ),
        patch(
            "asyncio.create_subprocess_exec",
            new=AsyncMock(return_value=proc),
        ),
    ):
        await handler.execute(
            uuid4(), uuid4(), "PS-1", uuid4(), uuid4()
        )

    # terminate() must have been called
    proc.terminate.assert_called_once()
    # failure, not success
    assert len(finalize_failure_calls) == 1
    assert len(finalize_success_calls) == 0


@pytest.mark.asyncio
async def test_failure_cascade() -> None:
    """When subprocess exits with non-zero, _finalize_failure is invoked."""
    finalize_failure_calls: list[dict] = []
    finalize_success_calls: list[dict] = []

    handler = _make_handler()
    proc = _make_proc(returncode=1, stdout_lines=["Starting implementation", "Error occurred"])

    async def _fake_failure(*args: object, **kwargs: object) -> None:
        finalize_failure_calls.append({"args": args, **kwargs})

    async def _fake_success(*args: object, **kwargs: object) -> None:
        finalize_success_calls.append({"args": args, **kwargs})

    handler._finalize_failure = _fake_failure  # type: ignore[method-assign]
    handler._finalize_success = _fake_success  # type: ignore[method-assign]
    handler._update_status = AsyncMock()  # type: ignore[method-assign]
    handler._publish = AsyncMock()  # type: ignore[method-assign]

    with patch(
        "asyncio.create_subprocess_exec",
        new=AsyncMock(return_value=proc),
    ):
        await handler.execute(
            uuid4(), uuid4(), "PS-2", uuid4(), uuid4()
        )

    assert len(finalize_failure_calls) == 1
    assert len(finalize_success_calls) == 0


@pytest.mark.asyncio
async def test_success_with_pr_url() -> None:
    """When subprocess exits 0 with PR URL in stdout, _finalize_success is invoked."""
    finalize_success_kwargs: list[dict] = []

    handler = _make_handler()
    stdout = [
        "Cloning repository...",
        "Setting up worktree...",
        "Analyzing issue...",
        "Implementing changes...",
        "Running tests...",
        "Creating PR: https://github.com/pilotspace/pilot-space/pull/77",
        "Done.",
    ]
    proc = _make_proc(returncode=0, stdout_lines=stdout)

    async def _fake_success(*args: object, **kwargs: object) -> None:
        finalize_success_kwargs.append({"args": args, **kwargs})

    async def _fake_failure(*args: object, **kwargs: object) -> None:
        pytest.fail(f"Expected success but got failure: {kwargs}")

    handler._finalize_success = _fake_success  # type: ignore[method-assign]
    handler._finalize_failure = _fake_failure  # type: ignore[method-assign]
    handler._update_status = AsyncMock()  # type: ignore[method-assign]
    handler._publish = AsyncMock()  # type: ignore[method-assign]

    with patch(
        "asyncio.create_subprocess_exec",
        new=AsyncMock(return_value=proc),
    ):
        await handler.execute(
            uuid4(), uuid4(), "PS-3", uuid4(), uuid4()
        )

    assert len(finalize_success_kwargs) == 1
    # pr_url is passed as keyword arg to _finalize_success
    assert finalize_success_kwargs[0].get("pr_url") == "https://github.com/pilotspace/pilot-space/pull/77"


@pytest.mark.asyncio
async def test_active_procs_cleanup() -> None:
    """active_procs entry is removed after execute completes."""
    from uuid import UUID
    active_procs: dict[UUID, asyncio.subprocess.Process] = {}
    handler = _make_handler(active_procs=active_procs)
    proc = _make_proc(returncode=0, stdout_lines=["https://github.com/org/repo/pull/1"])

    batch_run_issue_id = uuid4()

    handler._update_status = AsyncMock()  # type: ignore[method-assign]
    handler._publish = AsyncMock()  # type: ignore[method-assign]
    handler._finalize_success = AsyncMock()  # type: ignore[method-assign]
    handler._finalize_failure = AsyncMock()  # type: ignore[method-assign]

    with patch(
        "asyncio.create_subprocess_exec",
        new=AsyncMock(return_value=proc),
    ):
        await handler.execute(
            batch_run_issue_id, uuid4(), "PS-4", uuid4(), uuid4()
        )

    # active_procs must be empty after execution
    assert batch_run_issue_id not in active_procs
