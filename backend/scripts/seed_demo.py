"""Seed demo data for development testing.

Creates:
- Demo user
- Demo workspace with membership
- Sample project with states
- Sample note for AI testing
- Sample issue for AI context testing
"""

import asyncio
import uuid

from sqlalchemy import text

from pilot_space.infrastructure.database.engine import get_db_session


async def seed_demo_data() -> None:
    """Seed demo data into the database."""
    async with get_db_session() as session:
        # Demo user ID (matches DEMO_USER_ID in dependencies.py)
        demo_user_id = uuid.UUID("00000000-0000-0000-0000-000000000001")
        demo_workspace_id = uuid.UUID("00000000-0000-0000-0000-000000000002")

        # Check if demo user already exists
        result = await session.execute(
            text("SELECT id FROM users WHERE id = :id"),
            {"id": demo_user_id},
        )
        if result.scalar_one_or_none():
            print("Demo data already exists. Skipping seed.")
            return

        # Create demo user
        await session.execute(
            text("""
                INSERT INTO users (id, email, full_name, avatar_url, created_at, updated_at, is_deleted)
                VALUES (:id, :email, :full_name, :avatar_url, NOW(), NOW(), false)
            """),
            {
                "id": demo_user_id,
                "email": "demo@pilot-space.dev",
                "full_name": "Demo User",
                "avatar_url": None,
            },
        )
        print(f"Created demo user: {demo_user_id}")

        # Create demo workspace
        await session.execute(
            text("""
                INSERT INTO workspaces (id, name, slug, description, owner_id, settings, created_at, updated_at, is_deleted)
                VALUES (:id, :name, :slug, :description, :owner_id, :settings, NOW(), NOW(), false)
            """),
            {
                "id": demo_workspace_id,
                "name": "Pilot Space Demo",
                "slug": "pilot-space-demo",
                "description": "Demo workspace for development testing",
                "owner_id": demo_user_id,
                "settings": "{}",
            },
        )
        print(f"Created demo workspace: {demo_workspace_id}")

        # Add user as workspace member (using correct enum: OWNER)
        await session.execute(
            text("""
                INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at, updated_at, is_deleted)
                VALUES (:id, :workspace_id, :user_id, 'OWNER', NOW(), NOW(), false)
            """),
            {
                "id": uuid.uuid4(),
                "workspace_id": demo_workspace_id,
                "user_id": demo_user_id,
            },
        )
        print("Added user as workspace owner")

        # Create a project for the workspace
        project_id = uuid.uuid4()
        await session.execute(
            text("""
                INSERT INTO projects (id, workspace_id, name, identifier, description, lead_id, created_at, updated_at, is_deleted)
                VALUES (:id, :workspace_id, :name, :identifier, :description, :lead_id, NOW(), NOW(), false)
            """),
            {
                "id": project_id,
                "workspace_id": demo_workspace_id,
                "name": "Demo Project",
                "identifier": "DEMO",
                "description": "Default project for demo workspace",
                "lead_id": demo_user_id,
            },
        )
        print(f"Created demo project: {project_id}")

        # Create workflow states for the project (using state_group enum: unstarted, started, completed, cancelled)
        backlog_state_id = uuid.uuid4()
        await session.execute(
            text("""
                INSERT INTO states (id, workspace_id, project_id, name, color, "group", sequence, created_at, updated_at, is_deleted) VALUES
                (:s1, :ws, :proj, 'Backlog', '#94a3b8', 'unstarted', 0, NOW(), NOW(), false),
                (:s2, :ws, :proj, 'To Do', '#3b82f6', 'unstarted', 1, NOW(), NOW(), false),
                (:s3, :ws, :proj, 'In Progress', '#f59e0b', 'started', 2, NOW(), NOW(), false),
                (:s4, :ws, :proj, 'Done', '#22c55e', 'completed', 3, NOW(), NOW(), false),
                (:s5, :ws, :proj, 'Cancelled', '#ef4444', 'cancelled', 4, NOW(), NOW(), false)
            """),
            {
                "s1": backlog_state_id,
                "s2": uuid.uuid4(),
                "s3": uuid.uuid4(),
                "s4": uuid.uuid4(),
                "s5": uuid.uuid4(),
                "ws": demo_workspace_id,
                "proj": project_id,
            },
        )
        print("Created workflow states")

        # Create a sample note (content is JSONB - TipTap document format)
        note_id = uuid.uuid4()
        await session.execute(
            text("""
                INSERT INTO notes (id, workspace_id, title, content, owner_id, project_id, created_at, updated_at, is_deleted)
                VALUES (:id, :workspace_id, :title, '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"This is a demo note for testing AI features."}]},{"type":"paragraph","content":[{"type":"text","text":"We need to implement user authentication."}]}]}'::jsonb, :owner_id, :project_id, NOW(), NOW(), false)
            """),
            {
                "id": note_id,
                "workspace_id": demo_workspace_id,
                "title": "AI Testing Note",
                "owner_id": demo_user_id,
                "project_id": project_id,
            },
        )
        print(f"Created demo note: {note_id}")

        # Create a sample issue (using name instead of title, and issue_priority enum)
        issue_id = uuid.uuid4()
        await session.execute(
            text("""
                INSERT INTO issues (id, workspace_id, project_id, state_id, name, description, sequence_id, priority, reporter_id, created_at, updated_at, is_deleted)
                VALUES (:id, :workspace_id, :project_id, :state_id, :name, :description, :sequence_id, 'high', :reporter_id, NOW(), NOW(), false)
            """),
            {
                "id": issue_id,
                "workspace_id": demo_workspace_id,
                "project_id": project_id,
                "state_id": backlog_state_id,
                "name": "Implement user authentication",
                "description": "Add OAuth2 login with Google and GitHub providers. Include session management and JWT token handling.",
                "sequence_id": 1,
                "reporter_id": demo_user_id,
            },
        )
        print(f"Created demo issue: {issue_id}")

        await session.commit()
        print("\n" + "=" * 50)
        print("Demo data seeded successfully!")
        print("=" * 50)
        print(f"\nWorkspace ID: {demo_workspace_id}")
        print("Workspace slug: pilot-space-demo")
        print(f"Demo Note ID: {note_id}")
        print(f"Demo Issue ID: {issue_id}")
        print("\nYou can now test AI features in the frontend!")


if __name__ == "__main__":
    asyncio.run(seed_demo_data())
