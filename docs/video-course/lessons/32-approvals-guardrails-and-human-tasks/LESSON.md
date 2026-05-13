# 32 — Approvals, Guardrails, and Human Tasks

Duration target: 12-15 minutes

## Learning Outcomes

- Distinguish approvals, human tasks, and blocked tasks.
- Use guardrails to prevent unsafe automation.
- Keep humans in the loop where judgment or access is required.

## Script

Explain the three cases. Approval means the agent can do the action but needs permission. Human task means only a human can complete the dependency, such as payment, credentials, or physical access. Blocked task means work depends on another task or agent.

Open `GUARDRAILS.md` and show approval examples. Then show a demo approval and a demo human task. Explain that production systems fail when blockers are invisible; cortextOS expects blockers to be explicit.

Close with a rule: if an action affects the outside world or cannot be undone, route it through approval.

## Screen Plan

| Time | Show On Screen |
|---|---|
| 0:00 | `GUARDRAILS.md`. |
| 3:00 | Dashboard approval example. |
| 5:30 | Human task example. |
| 8:00 | Blocked task linked to approval/human task. |
| 11:00 | Activity feed showing the chain. |

## Learner Checkpoint

Classify three scenarios as approval, human task, or blocked task.
