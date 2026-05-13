# 07 — Dashboard Agents Page

Duration target: 10-12 minutes

## Learning Outcomes

- Interpret the fleet list.
- Identify runtime, status, heartbeat, and action cues.
- Decide when to restart, inspect, or leave an agent alone.

## Script

Explain that the Agents page is the fleet view. It is where operators answer: who exists, who is enabled, what runtime are they on, and are they alive?

Show runtime labels and statuses. Explain that a stale heartbeat is a clue, not always a failure. Combine it with recent activity, task movement, and logs before acting.

Demonstrate selecting an agent to view details. If restart controls are visible, explain the difference between intentional restart and panic-clicking. Agents are persistent, but restarts should preserve work through memory/handoff discipline.

## Screen Plan

| Time | Show On Screen |
|---|---|
| 0:00 | Agents list. |
| 1:30 | Runtime/status columns. |
| 3:30 | Heartbeat or last-seen indicators. |
| 5:30 | Enabled/disabled or control area if present. |
| 8:00 | Click into one agent detail page. |

## Learner Checkpoint

Find one agent and identify its runtime, current status, and last visible activity.
