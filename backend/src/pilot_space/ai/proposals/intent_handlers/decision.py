"""Decision intent handlers (Phase 89 Plan 03).

The ``decisions`` table does not exist in the current schema (deferred per
CONTEXT §2 line 103). No handlers registered — any AI tool invoking a
decision intent will surface ``IntentNotRegisteredError`` through the bus.

When decisions land (future plan), register handlers here following the
``issue.py`` pattern.
"""

from __future__ import annotations

# Intentionally empty — see module docstring.
