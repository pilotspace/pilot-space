"""merge migration heads

Revision ID: 07c394515c6c
Revises: 022_workspace_onboarding, 026_add_role_based_skills
Create Date: 2026-02-07 13:13:43.508321
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


# Revision identifiers, used by Alembic.
revision: str = "07c394515c6c"
down_revision: str | None = ("022_workspace_onboarding", "026_add_role_based_skills")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Apply migration."""
    pass


def downgrade() -> None:
    """Revert migration."""
    pass
