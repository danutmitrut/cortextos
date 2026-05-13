# 33 — Debugging and System Diagnostics

Duration target: 15-18 minutes

## Learning Outcomes

- Diagnose common agent and daemon issues.
- Know where logs and state live.
- Recover without destructive commands.

## Script

Start with the symptom-based approach. If Telegram is quiet, check comms, heartbeat, agent detail, daemon logs, and `.env` credentials. If tasks are stuck, check blockers and inbox. If crons are stale, check workflow health and last fire logs. If runtime fails, check runtime auth and binary availability.

Show `cortextos doctor`, `cortextos status`, PM2 logs, and relevant state paths. Explain that destructive git or state resets are last resorts and should not be done casually.

Close with an escalation pattern: create a task, capture evidence, mark blocked if needed, create a human task for missing credentials, and attach a diagnostic output.

## Screen Plan

| Time | Show On Screen |
|---|---|
| 0:00 | Symptom checklist. |
| 2:00 | `cortextos doctor`. |
| 4:30 | `cortextos status`. |
| 7:00 | PM2 status/logs. |
| 10:00 | Dashboard heartbeat/task/comms evidence. |
| 14:00 | Diagnostic task with saved output. |

## Learner Checkpoint

When an agent stops answering, write the first five places you will check.
