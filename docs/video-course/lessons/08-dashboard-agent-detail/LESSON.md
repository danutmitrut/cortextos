# 08 — Dashboard Agent Detail Page

Duration target: 10-12 minutes

## Learning Outcomes

- Read one agent's operational state.
- Connect config, heartbeat, logs, tasks, messages, and outputs.
- Know what evidence to collect before troubleshooting.

## Script

Introduce the agent detail page as a single-agent incident and review surface. Use it when the fleet view tells you something needs inspection.

Walk through identity, runtime, status, active work, recent messages, task links, and log/context areas. Explain that good operators avoid guessing. If an agent seems stuck, collect evidence: last heartbeat, last event, active task, inbox state, and recent stderr/stdout if available.

Close by showing how this page supports review after a completed task: you can see what the agent was asked, what it did, and what outputs it attached.

## Screen Plan

| Time | Show On Screen |
|---|---|
| 0:00 | Agent detail page header. |
| 1:30 | Runtime/config/status area. |
| 3:30 | Active tasks or current work section. |
| 5:30 | Messages/events/log references. |
| 8:30 | Output or task link from this agent. |

## Learner Checkpoint

Open an agent detail page and identify the last meaningful thing that agent did.
