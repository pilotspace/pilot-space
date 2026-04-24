"""Intent handler modules (Phase 89 Plan 03).

Each handler calls ``@register_intent("tool_name")``; importing the package
via ``pilot_space.ai.proposals._ensure_handlers_imported`` populates the
registry.

Mutations in this package are the ONLY writes the audit gate allows under
``pilot_space.ai.*`` (see ``tests/ai/test_no_unsupervised_writes.py``
allow-list).
"""
