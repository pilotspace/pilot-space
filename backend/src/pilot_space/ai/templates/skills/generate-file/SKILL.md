---
name: generate-file
description: Generate downloadable Markdown or HTML files (reports, summaries, styled docs)
feature_module: null
---

# Generate File Skill

Produce a downloadable file artifact from chat. The agent picks the format
(Markdown for portable text, HTML for styled / print-ready output), drafts the
content, then calls the `create_file` tool. The file appears in chat as an
inline download card and can be previewed via the Peek panel.

Phase: 87.1 (foundation — MD + HTML only). DOCX / XLSX land in 87.2; PDF in
87.3.

## Quick Start

Use this skill when the user asks for any of:

- A file, an export, a download
- A "report", "summary", "doc", "spec", "README"
- A styled / printable / formatted document
- "Save this as a file" / "give me a downloadable version"
- A standalone deliverable (resume, proposal, meeting notes, retro doc)

## Format Choice

**Strict decision rule** — pick exactly one based on intent:

| Use `md` when… | Use `html` when… |
|----------------|------------------|
| Content is editable / portable plain text | Output needs visual styling or layout |
| User will paste into another markdown surface (notes, GitHub, Slack) | User wants a print-ready or shareable rendered doc |
| Headings, bullet lists, code blocks are enough | Tables need cell styling, page breaks, color, custom fonts |
| Examples: specs, READMEs, summaries, meeting notes, brain-dump exports | Examples: status report, formatted retrospective, styled receipt, dashboard snapshot |

When uncertain, prefer `md` — it is portable and the user can always export to
HTML later. Do not invent other formats; this phase only supports `md` and
`html`.

## Tool Reference

```
create_file(
  filename: string,    # suggested name; sanitised server-side
  content: string,     # UTF-8 body, must be non-empty and ≤ 10 MB encoded
  format: "md" | "html"
)
```

Returns: `{ artifact_id, filename, mime_type, size_bytes, format }`.

## Constraints

- **Max 10 MB per file.** Content over the limit is rejected with
  `FILE_TOO_LARGE` before any storage I/O.
- **Filename is sanitised server-side.** Path components (`../etc/...`),
  control characters, and unsafe characters are stripped. The extension is
  forced to match `format`, so the agent cannot smuggle e.g. `report.exe.md`.
- **Empty content is rejected** with `EMPTY_FILE`.
- **MIME map is server-controlled.** `format='md'` maps to `text/markdown`,
  `format='html'` to `text/html`. The model cannot override the MIME type.
- **Auto-executes without approval prompt.** This is an intentional UX
  deviation from `create_note` / `create_issue` (which require approval).
  Rationale: file generation is non-destructive content creation the user
  explicitly requested in conversation; the file is private to the requester
  until they share it. Document this when explaining the action to the user
  ("I generated the file — here's the download").
- **HTML rendered in a sandboxed iframe** on preview. Do NOT include
  `<script>` tags, external script references, or `javascript:` URLs in HTML
  content — the preview iframe explicitly does not allow scripts.

## Examples

### Example 1 — Markdown spec

User: "Write me a one-pager for the new auth migration and save it as a
file."

Agent reasoning: portable, editable, plain-text → `md`.

Tool call:

```json
{
  "filename": "auth-migration-one-pager",
  "format": "md",
  "content": "# Auth Migration One-Pager\n\n## Goal\nReplace session cookies with JWT…\n\n## Scope\n- Backend: token mint + refresh\n- Frontend: token store + 401 retry\n\n## Risks\n…\n"
}
```

Result: `{ artifact_id: "...", filename: "auth-migration-one-pager.md",
mime_type: "text/markdown", size_bytes: 412, format: "md" }`.

### Example 2 — Styled HTML report

User: "Give me a print-ready weekly status report I can hand to leadership."

Agent reasoning: styled, print-ready, tabular layout → `html`.

Tool call:

```json
{
  "filename": "weekly-status-2026-W17",
  "format": "html",
  "content": "<!doctype html><html><head><meta charset=\"utf-8\"><style>body{font-family:system-ui;max-width:720px;margin:2rem auto;color:#1a1a1a}h1{border-bottom:2px solid #1a1a1a;padding-bottom:.25rem}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:.5rem .75rem;text-align:left}</style></head><body><h1>Weekly Status — Week 17</h1><h2>Highlights</h2><ul><li>Auth migration shipped</li><li>Onboarding redesign in review</li></ul><h2>Metrics</h2><table><tr><th>Metric</th><th>Value</th></tr><tr><td>P0 incidents</td><td>0</td></tr><tr><td>Releases</td><td>4</td></tr></table></body></html>"
}
```

Result: `{ artifact_id: "...", filename: "weekly-status-2026-W17.html",
mime_type: "text/html", size_bytes: …, format: "html" }`.

## Integration Points

- **PilotSpaceAgent** — Orchestrator routes here on file / export / report
  / styled-doc intent.
- **MCP Server** — `pilot-files` (see `ai/mcp/file_server.py`).
- **Approval Flow** — AUTO_EXECUTE per `TOOL_APPROVAL_MAP`. No approval
  prompt; structured telemetry is logged for every invocation.
- **Storage** — `ArtifactUploadService` writes to the `note-artifacts`
  Supabase bucket with storage key
  `{workspace_id}/ai-generated/{artifact_id}/{filename}`. The artifact row
  has `project_id = NULL` (Phase 87.1-01 enabled this).
- **Frontend Preview** — Inline download card from Phase 87 / CHAT-04;
  Peek panel renders MD via `MarkdownContent` and HTML via sandboxed
  `<iframe srcDoc>` (no scripts allowed).

## References

- Phase Plan: `.planning/phases/87.1-.../87.1-02-create-file-tool-and-skill-PLAN.md`
- Phase Context: `.planning/phases/87.1-.../87.1-CONTEXT.md`
- Design Decision: DD-003 (Human-in-the-Loop Approval; this skill is a
  documented exception)
- Design Decision: DD-086 (Centralized Agent Architecture)
