# 17 — Dashboard Workflows Page

Duration target: 10-12 minutes

## Learning Outcomes

- Understand workflows as scheduled or repeatable operations.
- Inspect daemon-managed crons.
- Know what belongs in a workflow versus an ad hoc task.

## Script

Introduce workflows as recurring work: morning briefings, inbox reviews, weekly reporting, KB maintenance, stale task checks, or relationship follow-ups.

Show the workflows page. Explain interval, next fire time, owner agent, enabled state, and prompt. Emphasize that cortextOS crons are daemon-managed and survive restarts through `crons.json`.

Close with the design rule: automate the cadence, not the judgment. Workflows should prompt agents to inspect and decide, not blindly take risky external actions.

## Screen Plan

| Time | Show On Screen |
|---|---|
| 0:00 | Workflows page. |
| 2:00 | Existing cron/workflow row. |
| 4:00 | Open details: schedule, prompt, next fire. |
| 6:30 | Show related `crons.json` or CLI list output. |
| 9:00 | Navigate to new workflow page. |

## Learner Checkpoint

Choose one recurring review your agent should run every day or week.
