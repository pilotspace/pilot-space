"""Spec intent handlers (Phase 89 Plan 03).

The ``specs`` table does not exist in the current schema (deferred per
Plan 01 D-89-01-02 / CONTEXT §2 line 103). No handlers registered — any
AI tool invoking a spec intent will surface ``IntentNotRegisteredError``
through the bus, which propagates as RFC 7807 500. That's the right
failure mode until the table lands.

When specs land (future plan), register handlers here following the
``issue.py`` pattern.
"""

from __future__ import annotations

# Intentionally empty — see module docstring.
