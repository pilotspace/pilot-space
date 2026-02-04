"""Middleware for API v1."""

from pilot_space.api.v1.middleware.ai_context import extract_ai_context

__all__ = ["extract_ai_context"]
