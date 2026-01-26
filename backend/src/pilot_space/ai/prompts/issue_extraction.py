"""Issue extraction prompt templates.

Prompts for extracting structured issues from note content.
Includes confidence scoring and issue categorization.

T089: Issue extraction prompt template.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class ConfidenceTag(Enum):
    """Confidence tags for extracted issues (DD-048).

    Attributes:
        RECOMMENDED: AI strongly suggests (>0.8).
        DEFAULT: Standard choice (0.6-0.8).
        CURRENT: Matches existing patterns (0.5-0.7).
        ALTERNATIVE: Valid but less preferred (<0.6).
    """

    RECOMMENDED = "recommended"
    DEFAULT = "default"
    CURRENT = "current"
    ALTERNATIVE = "alternative"


class IssuePriority(Enum):
    """Issue priority levels."""

    URGENT = "urgent"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    NONE = "none"


# System prompt for issue extraction (DD-048)
ISSUE_EXTRACTION_SYSTEM_PROMPT = """You are an expert at analyzing technical notes and extracting actionable issues.

Your task is to identify potential issues, tasks, bugs, and improvements from the note content.

## Confidence Tag Definitions (DD-048)

When extracting issues, assign one of these confidence tags:

### RECOMMENDED (confidence_score >= 0.8)
- Clear bug report or error description
- Explicit TODO or action item
- Direct feature request with specific requirements
- Security or performance concern with evidence

### DEFAULT (confidence_score 0.6-0.8)
- Implied improvement opportunity
- Pattern suggesting potential issue
- Discussion point that needs resolution
- Technical debt indication

### CURRENT (confidence_score 0.5-0.7)
- Matches existing issue patterns in the project
- Similar to previously extracted issues
- Follows established conventions

### ALTERNATIVE (confidence_score 0.4-0.6)
- Possible issue requiring human judgment
- Ambiguous requirement
- Opinion or suggestion that may not need tracking
- Question that could become an issue

## Output Format

Return valid JSON matching this schema:
{{
  "issues": [
    {{
      "title": "Imperative action title",
      "description": "Detailed description with context",
      "priority": "urgent|high|medium|low|none",
      "labels": ["bug", "enhancement", etc.],
      "confidence": 0.0-1.0,
      "confidence_tag": "recommended|default|current|alternative",
      "source_block_ids": ["block-uuid-1"],
      "source_text": "The original text this issue was extracted from"
    }}
  ]
}}

Example output:
{{
  "issues": [
    {{
      "title": "Implement user authentication flow",
      "description": "Add login/logout functionality with OAuth2 support...",
      "priority": "high",
      "labels": ["feature", "auth"],
      "confidence": 0.9,
      "confidence_tag": "recommended",
      "source_block_ids": ["block-1", "block-2"],
      "source_text": "We need to implement user authentication..."
    }}
  ]
}}

GUIDELINES:
1. Extract concrete, actionable items only
2. Don't create issues for vague ideas unless marked as ALTERNATIVE
3. Preserve context from the original text
4. Suggest appropriate labels based on content
5. Return empty "issues" array if no valid issues found"""

# User prompt for issue extraction
ISSUE_EXTRACTION_USER_PROMPT = """Extract issues from this note content:

Note Title: {note_title}

Project Context: {project_context}

Note Content:
{note_content}

{selection_instruction}

Return your analysis as a JSON object with an "issues" array."""


@dataclass
class IssueExtractionPromptConfig:
    """Configuration for issue extraction prompts.

    Attributes:
        max_content_chars: Maximum note content characters.
        include_project_context: Whether to include project info.
        available_labels: Labels available in the project.
    """

    max_content_chars: int = 10000
    include_project_context: bool = True
    available_labels: list[str] | None = None


def build_issue_extraction_prompt(
    note_title: str,
    note_content: str,
    project_context: str | None = None,
    selected_text: str | None = None,
    available_labels: list[str] | None = None,
    config: IssueExtractionPromptConfig | None = None,
) -> tuple[str, str]:
    """Build system and user prompts for issue extraction.

    Args:
        note_title: Title of the note.
        note_content: Full note content.
        project_context: Optional project description.
        selected_text: Optional user-selected text to focus on.
        available_labels: Labels available in the project.
        config: Prompt configuration.

    Returns:
        Tuple of (system_prompt, user_prompt).
    """
    config = config or IssueExtractionPromptConfig()

    # Truncate content if needed
    truncated_content = note_content
    if len(note_content) > config.max_content_chars:
        truncated_content = note_content[: config.max_content_chars] + "\n...(truncated)"

    # Build selection instruction
    selection_instruction = ""
    if selected_text:
        selection_instruction = f"""
FOCUS ON SELECTED TEXT:
The user has selected the following text - prioritize extracting issues from this selection:
---
{selected_text}
---
"""

    # Build label guidance if available
    system_prompt = ISSUE_EXTRACTION_SYSTEM_PROMPT
    if available_labels:
        label_list = ", ".join(available_labels[:20])  # Limit to 20 labels
        system_prompt += f"\n\nAVAILABLE LABELS: {label_list}\nPrefer using these existing labels when applicable."

    # Build user prompt
    user_prompt = ISSUE_EXTRACTION_USER_PROMPT.format(
        note_title=note_title,
        project_context=project_context or "(No project context provided)",
        note_content=truncated_content,
        selection_instruction=selection_instruction,
    )

    return system_prompt, user_prompt


def get_confidence_tag(confidence: float) -> ConfidenceTag:
    """Determine confidence tag from confidence score per DD-048.

    Args:
        confidence: Confidence score 0.0-1.0.

    Returns:
        Appropriate ConfidenceTag.
    """
    if confidence >= 0.8:
        return ConfidenceTag.RECOMMENDED
    if confidence >= 0.6:
        return ConfidenceTag.DEFAULT
    if confidence >= 0.4:
        return ConfidenceTag.CURRENT
    return ConfidenceTag.ALTERNATIVE


# Prompt for refining extracted issues
ISSUE_REFINEMENT_SYSTEM_PROMPT = """You are an AI assistant helping to refine an extracted issue.
Given the original extraction and user feedback, improve the issue.

OUTPUT FORMAT:
Return a JSON object with the refined issue:
{{
  "title": "Improved title",
  "description": "Improved description",
  "priority": "urgent|high|medium|low|none",
  "labels": ["label1"],
  "changes_made": ["List of changes you made"]
}}"""

ISSUE_REFINEMENT_USER_PROMPT = """Refine this extracted issue based on feedback:

Original Issue:
Title: {title}
Description: {description}
Priority: {priority}
Labels: {labels}

User Feedback: {feedback}

Source Context: {source_context}

Return the refined issue as JSON."""


def build_issue_refinement_prompt(
    title: str,
    description: str,
    priority: str,
    labels: list[str],
    feedback: str,
    source_context: str | None = None,
) -> tuple[str, str]:
    """Build prompts for refining an extracted issue.

    Args:
        title: Current issue title.
        description: Current description.
        priority: Current priority.
        labels: Current labels.
        feedback: User feedback for refinement.
        source_context: Original source text.

    Returns:
        Tuple of (system_prompt, user_prompt).
    """
    user_prompt = ISSUE_REFINEMENT_USER_PROMPT.format(
        title=title,
        description=description,
        priority=priority,
        labels=", ".join(labels),
        feedback=feedback,
        source_context=source_context or "(Not available)",
    )

    return ISSUE_REFINEMENT_SYSTEM_PROMPT, user_prompt


__all__ = [
    "ISSUE_EXTRACTION_SYSTEM_PROMPT",
    "ISSUE_EXTRACTION_USER_PROMPT",
    "ISSUE_REFINEMENT_SYSTEM_PROMPT",
    "ISSUE_REFINEMENT_USER_PROMPT",
    "ConfidenceTag",
    "IssueExtractionPromptConfig",
    "IssuePriority",
    "build_issue_extraction_prompt",
    "build_issue_refinement_prompt",
    "get_confidence_tag",
]
