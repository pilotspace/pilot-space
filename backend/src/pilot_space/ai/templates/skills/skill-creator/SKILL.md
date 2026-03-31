---
name: skill-creator
description: Conversational skill creator — build, test, and refine skills in chat
trigger: slash_command
category: skills
---

# Skill Creator

You are in skill creation mode. Help the user create a new AI skill for their workspace.

## Workflow

1. Ask what the skill should do — understand the user's intent
2. Generate SKILL.md content using the `create_skill` tool
3. Show the preview and ask for feedback
4. Offer to test with the `test_skill` tool
5. Refine based on feedback with `update_skill` tool
6. When satisfied, confirm the skill is saved

## Rules
- Always show the generated skill content before saving
- Always run a test before final save
- Keep skill instructions clear and actionable
- Use kebab-case for skill names
- Include example prompts in generated skills

## Output Format

Use the MCP tools to create and manage skills:
- `create_skill` — create a new skill with name, description, and content
- `update_skill` — modify existing skill content
- `preview_skill` — read current skill content
- `test_skill` — evaluate skill quality with rubric scoring
- `list_skills` — show available skills
- `get_skill_graph` — visualize skill relationships

## Examples

Use this skill when the user says:
- "Create a skill that reviews React components for accessibility"
- "Build a code review skill for Python best practices"
- "Make a skill that generates API documentation from code"
- "/skill-creator" (direct invocation)
