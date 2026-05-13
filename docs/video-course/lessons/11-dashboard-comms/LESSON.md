# 11 — Dashboard Comms Page

Duration target: 10-12 minutes

## Learning Outcomes

- Use the comms page to trace Telegram and agent-to-agent messages.
- Understand reply threading and inbox acknowledgement.
- Diagnose missed-message symptoms.

## Script

Explain that cortextOS agents do not just talk in hidden model sessions. Telegram and agent-to-agent messages are routed through the bus so the dashboard can show what happened.

Show inbound Telegram, outbound Telegram, and an agent-to-agent thread. Explain reply IDs and why agents should preserve them. If a message redelivers, it usually means it was not replied to or acknowledged.

Close with a debugging loop: if a user says "the agent did not answer," check comms, agent detail, heartbeat, and daemon logs in that order.

## Screen Plan

| Time | Show On Screen |
|---|---|
| 0:00 | Comms page message list. |
| 2:00 | Inbound Telegram message. |
| 4:00 | Outbound Telegram response. |
| 6:00 | Agent-to-agent threaded message. |
| 8:30 | Filter/search by agent or message type. |

## Learner Checkpoint

Find one message and identify who sent it, who received it, and whether it was replied to.
