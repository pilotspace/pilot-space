"""Supporting mock response generators for AI agents.

This module contains generators for supporting agents (documentation, task decomposition, etc.).
Split from mock_generators.py to maintain file size limits.
"""

from __future__ import annotations

from typing import Any

from pilot_space.ai.providers.mock import MockResponseRegistry

# =============================================================================
# Doc Generator Agent
# =============================================================================


@MockResponseRegistry.register("DocGeneratorAgent")
def generate_documentation(input_data: dict[str, Any]) -> str:
    """Generate mock documentation.

    Args:
        input_data: Dict with code_context, doc_type

    Returns:
        Generated documentation string.
    """
    doc_type = input_data.get("doc_type", "api")

    if doc_type == "api":
        return """# Authentication API

## Endpoints

### POST /api/v1/auth/login
Authenticate user and return JWT tokens.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "secure_password"
}
```

**Response:**
```json
{
  "access_token": "eyJ...",  # pragma: allowlist secret
  "refresh_token": "eyJ...",
  "token_type": "bearer",
  "expires_in": 3600
}
```

**Status Codes:**
- 200: Success
- 401: Invalid credentials
- 429: Rate limit exceeded
"""

    return """# Feature Documentation

## Overview
This feature provides comprehensive functionality for the system.

## Usage
See API documentation for specific endpoints and parameters.

## Configuration
Configure settings in .env file.
"""


# =============================================================================
# Task Decomposer Agent
# =============================================================================


@MockResponseRegistry.register("TaskDecomposerAgent")
def generate_task_breakdown(input_data: dict[str, Any]) -> dict[str, Any]:
    """Generate mock task decomposition.

    Args:
        input_data: Dict with feature_description

    Returns:
        Task breakdown dict.
    """
    return {
        "tasks": [
            {
                "id": "task-1",
                "title": "Design database schema",
                "description": "Create migration for auth tables",
                "estimated_hours": 2,
                "dependencies": [],
                "labels": ["database", "backend"],
            },
            {
                "id": "task-2",
                "title": "Implement authentication service",
                "description": "Create UserService with login/logout methods",
                "estimated_hours": 4,
                "dependencies": ["task-1"],
                "labels": ["backend", "service"],
            },
            {
                "id": "task-3",
                "title": "Add API endpoints",
                "description": "Expose auth endpoints in FastAPI router",
                "estimated_hours": 3,
                "dependencies": ["task-2"],
                "labels": ["backend", "api"],
            },
            {
                "id": "task-4",
                "title": "Write unit tests",
                "description": "Test coverage for service and endpoints",
                "estimated_hours": 3,
                "dependencies": ["task-3"],
                "labels": ["testing"],
            },
        ],
        "total_estimated_hours": 12,
        "critical_path": ["task-1", "task-2", "task-3"],
        "parallel_opportunities": [["task-4"]],
    }


# =============================================================================
# Diagram Generator Agent
# =============================================================================


@MockResponseRegistry.register("DiagramGeneratorAgent")
def generate_diagram(input_data: dict[str, Any]) -> str:
    """Generate mock Mermaid diagram.

    Args:
        input_data: Dict with diagram_type, content

    Returns:
        Mermaid diagram string.
    """
    diagram_type = input_data.get("diagram_type", "flowchart")

    if diagram_type == "sequence":
        return """```mermaid
sequenceDiagram
    participant U as User
    participant A as API
    participant S as Service
    participant D as Database

    U->>A: POST /auth/login
    A->>S: authenticate(credentials)
    S->>D: query user by email
    D-->>S: user record
    S->>S: verify password
    S-->>A: JWT tokens
    A-->>U: 200 OK + tokens
```"""

    return """```mermaid
flowchart TD
    A[User Request] --> B{Valid Token?}
    B -->|Yes| C[Process Request]
    B -->|No| D[Return 401]
    C --> E{Success?}
    E -->|Yes| F[Return 200]
    E -->|No| G[Return Error]
```"""


# =============================================================================
# Commit Linker Agent
# =============================================================================


@MockResponseRegistry.register("CommitLinkerAgent")
@MockResponseRegistry.register("CommitLinkerAgentSDK")
def generate_commit_links(input_data: dict[str, Any]) -> dict[str, Any]:
    """Generate mock commit links for issue.

    Args:
        input_data: Dict with issue_id, repo_url

    Returns:
        Commit links dict.
    """
    return {
        "linked_commits": [
            {
                "sha": "a1b2c3d",
                "message": "feat(auth): implement JWT authentication",
                "author": "Alice Chen",
                "date": "2024-01-15T10:30:00Z",
                "url": "https://github.com/org/repo/commit/a1b2c3d",
                "relevance_score": 0.95,
            },
            {
                "sha": "e4f5g6h",
                "message": "test(auth): add unit tests for token validation",
                "author": "Alice Chen",
                "date": "2024-01-15T14:20:00Z",
                "url": "https://github.com/org/repo/commit/e4f5g6h",
                "relevance_score": 0.88,
            },
        ],
        "total_commits": 2,
        "search_query": "authentication JWT",
    }


__all__ = [
    "generate_commit_links",
    "generate_diagram",
    "generate_documentation",
    "generate_task_breakdown",
]
