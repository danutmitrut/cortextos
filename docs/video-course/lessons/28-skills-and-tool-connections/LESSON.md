# 28 — Skills and Tool Connections

Duration target: 12-15 minutes

## Learning Outcomes

- Connect skills to repeatable workflows.
- Understand tool-agnostic setup through connectors, MCP, CLIs, env vars, and local files.
- Avoid hard dependencies in reusable agent design.

## Script

Explain that skills tell agents how to perform repeatable work, while tool connections tell them what capabilities are available in this install. A skill should not assume every user has the same CRM, calendar, email client, issue tracker, or meeting-notes tool.

Show a skill with trigger conditions, workflow steps, and references to scripts/templates. Then show a tool connection doc that lists options: native connector, MCP server, CLI, browser automation, API key, export file, or manual handoff.

Close with a pattern: "discover first, then operate." During setup, the agent should ask or inspect which tools exist before writing workflows that depend on them.

## Screen Plan

| Time | Show On Screen |
|---|---|
| 0:00 | `.claude/skills/<skill>/SKILL.md`. |
| 3:00 | Tool connection guidance doc. |
| 5:30 | Example connector/MCP/CLI matrix. |
| 8:30 | Setup flow asking which tools exist. |
| 11:00 | Agent using a tool only after discovery. |

## Learner Checkpoint

For one workflow, list the preferred tool, fallback tool, and manual fallback.
