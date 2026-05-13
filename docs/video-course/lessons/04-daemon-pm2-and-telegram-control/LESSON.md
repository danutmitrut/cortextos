# 04 — Daemon, PM2, and Telegram Control

Duration target: 12-15 minutes

## Learning Outcomes

- Explain what the daemon does.
- Start and inspect the PM2-managed cortextOS daemon.
- Use Telegram as the first response path for remote control.

## Script

Explain that the daemon is the always-on supervisor. It starts agent runtimes, polls Telegram/inbox events, injects messages, runs crons, watches heartbeats, and handles restarts. PM2 keeps the daemon itself alive.

Show `cortextos ecosystem`, `pm2 start`, `pm2 status`, and `cortextos status`. Do not over-index on every flag; teach the operator loop: start, verify, inspect logs, restart when intentional.

Then show Telegram control. Send a simple message, an approval-shaped request, and a status question. Explain that the agent must answer through `cortextos bus send-telegram`, which is why messages show in the dashboard and audit trail.

Close with crash/restart expectations: agents are designed to be persistent, but users should still inspect heartbeat, logs, and task state when something feels stuck.

## Screen Plan

| Time | Show On Screen |
|---|---|
| 0:00 | Architecture diagram focusing on daemon. |
| 2:00 | Terminal: `cortextos ecosystem`, then PM2 status. |
| 4:00 | Terminal: `cortextos status`. |
| 6:00 | PM2 logs or daemon log path with non-secret output. |
| 8:00 | Telegram request and response. |
| 10:30 | Dashboard activity showing the same exchange. |

## Learner Checkpoint

Run `cortextos status` and confirm the first agent is alive before recording later lessons.
