# 26 — Setting Up Template Agents

Duration target: 15-18 minutes

## Learning Outcomes

- Run a template setup flow.
- Fill tuning knobs without hard-coding private data into public templates.
- Connect templates to each other through handoff workflows.

## Script

Start with the CortextOS Concierge or another starter template. Show the README telling the user to run setup. Explain that setup should gather essentials: owner preferences, tools available, schedule/cadence, privacy boundaries, default outputs, approval rules, and handoff relationships.

Then configure a second template, such as Knowledge Base Librarian or Project Manager. Show how the two can cooperate: Concierge recommends setup, Librarian ingests docs, Project Manager tracks implementation.

Emphasize tool agnosticism. The template should work with any meeting notes tool, calendar, email, ticket system, CRM, local files, MCP server, or CLI bridge as long as the user specifies what is available.

## Screen Plan

| Time | Show On Screen |
|---|---|
| 0:00 | Template README setup instruction. |
| 2:00 | Setup skill with questions/tuning knobs. |
| 5:00 | Fill synthetic setup answers. |
| 8:00 | Updated bootstrap/config docs. |
| 11:00 | Create a task that involves two template agents. |
| 14:00 | Dashboard task/comms showing handoff. |

## Learner Checkpoint

Set up one template agent and document three tuning knobs you customized.
