# 30 — Crons, Reminders, and Scheduled Work

Duration target: 12-15 minutes

## Learning Outcomes

- Understand daemon-managed crons.
- Create safe recurring work.
- Know how cron fires are acknowledged and inspected.

## Script

Explain that crons are scheduled prompts managed by the cortextOS daemon. They survive restarts through agent state, and agents do not need to manually restore them at boot.

Show list, add, inspect, and remove flows. Teach prompt design: recurring jobs should inspect state, create/update tasks, report results, and ask approval for external actions. They should not silently perform risky operations.

Show a cron fire and the expected completion update. Explain stuck cron detection: if an agent handles a fire but does not record it, the daemon may think it is stuck.

## Screen Plan

| Time | Show On Screen |
|---|---|
| 0:00 | Workflows page or CLI list-crons output. |
| 2:00 | Add a simple daily review cron. |
| 5:00 | `crons.json` or workflow detail. |
| 7:30 | Test/manual fire in sandbox. |
| 10:00 | Cron completion event/update. |

## Learner Checkpoint

Write one recurring prompt that includes reporting and approval boundaries.
