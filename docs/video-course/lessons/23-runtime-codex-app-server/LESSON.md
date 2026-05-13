# 23 — Runtime: Codex App Server

Duration target: 10-12 minutes

## Learning Outcomes

- Understand how the Codex app server runtime differs from Claude Code.
- Know when Codex is a good fit.
- Understand context handoff and Telegram reply discipline for Codex agents.

## Script

Introduce `codex-app-server` as another runtime behind the same cortextOS bus. The user still gets tasks, crons, dashboard, Telegram, approvals, and saved outputs; the difference is the model/session adapter that performs the work.

Show `templates/agent-codex/` and a `runtime: "codex-app-server"` config. Explain skill location differences and the importance of bus-visible replies. For Codex agents, Telegram-shaped messages must be answered through the bus, and context handoff is managed by the daemon through status files and restart prompts.

Close with when to use it: coding-heavy work, OpenAI-model workflows, comparison against Claude agents, and multi-runtime fleets.

## Screen Plan

| Time | Show On Screen |
|---|---|
| 0:00 | README runtime table. |
| 2:00 | `templates/agent-codex/config.json`. |
| 4:00 | `src/pty/codex-app-server-pty.ts` or runtime path in file tree. |
| 6:00 | Codex agent dashboard detail page. |
| 8:30 | Example Telegram inject/reply path in docs or logs. |

## Learner Checkpoint

Explain what stays the same between Claude and Codex agents, and what changes.
