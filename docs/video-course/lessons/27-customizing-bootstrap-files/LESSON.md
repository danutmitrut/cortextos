# 27 — Customizing Bootstrap Files

Duration target: 15-18 minutes

## Learning Outcomes

- Understand each major bootstrap file's purpose.
- Customize agent behavior without breaking system rules.
- Keep personal data out of reusable templates.

## Script

Open a demo agent folder and walk file by file: `IDENTITY.md` says who the agent is, `GOALS.md` says what it optimizes for, `GUARDRAILS.md` defines safety boundaries, `TOOLS.md` lists usable commands, `SYSTEM.md` and `USER.md` add context, `MEMORY.md` holds long-term memory, and `AGENTS.md` defines runtime-critical operating rules.

Explain what not to edit casually. Do not remove Telegram reply rules, task/deliverable standards, approval gates, daemon-cron rules, or context handoff instructions. Customization belongs in role, goals, preferences, tool connections, and workflow skills.

End by making one safe edit: add a domain preference to a demo agent's goals and show how future tasks should reflect it.

## Screen Plan

| Time | Show On Screen |
|---|---|
| 0:00 | Agent folder file tree. |
| 2:00 | `IDENTITY.md` and `GOALS.md`. |
| 5:00 | `GUARDRAILS.md` and approval language. |
| 8:00 | `TOOLS.md` and `TOOL_CONNECTIONS.md` if present. |
| 11:00 | `AGENTS.md` non-negotiable runtime rules. |
| 14:00 | Safe customization example in demo file. |

## Learner Checkpoint

Identify one bootstrap file you would customize and one you would avoid changing without understanding the runtime implications.
