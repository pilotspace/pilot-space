"""Domain-wide constants for Pilot Space."""

from __future__ import annotations

from uuid import UUID

# Sentinel user ID for system-initiated operations (background jobs, proxy
# forwarding, etc.) where no real user is available.
SYSTEM_USER_ID = UUID("00000000-0000-0000-0000-000000000000")
