# 18 — Dashboard Workflow Health

Duration target: 8-10 minutes

## Learning Outcomes

- Diagnose stuck or unhealthy workflows.
- Use cron fire logs and heartbeat context.
- Decide whether to wait, retry, pause, or remove a workflow.

## Script

Explain that scheduled work needs health monitoring. A cron can be healthy, overdue, paused, blocked by an offline agent, or repeatedly failing because the prompt is unclear or dependencies are missing.

Show workflow health. Walk through last fire time, expected interval, execution history, and any error state. Explain the operator decision tree: if the agent is offline, fix the agent; if the cron prompt is bad, revise it; if the work is obsolete, remove it.

## Screen Plan

| Time | Show On Screen |
|---|---|
| 0:00 | Workflow health page. |
| 2:00 | Healthy workflow example. |
| 4:00 | Overdue or failed workflow example. |
| 6:00 | Execution log or related activity. |
| 8:00 | Decision: retry, edit, pause, or remove. |

## Learner Checkpoint

Find one workflow and explain why it is healthy or unhealthy.
