# 29 — Bus: Tasks, Messages, and Outputs

Duration target: 15-18 minutes

## Learning Outcomes

- Understand the cortextOS bus as the coordination API.
- Use tasks, messages, and saved outputs correctly.
- Preserve reviewability across agents and sessions.

## Script

Define the bus as the shared system layer. Agents use it to create tasks, update status, send Telegram messages, message other agents, attach outputs, log events, query KB, and manage approvals.

Show a minimal workflow with commands: create task, update in progress, send a message to another agent, save an output file, complete the task, and log completion. Explain that saved outputs are especially important because task completion without a file deliverable is not reviewable enough for substantial work.

Close by showing the same workflow in the dashboard: task, comms, output, and activity should all line up.

## Screen Plan

| Time | Show On Screen |
|---|---|
| 0:00 | `TOOLS.md` or bus reference. |
| 2:00 | Create/update task commands. |
| 5:00 | Agent-to-agent message command. |
| 8:00 | Save-output command with descriptive label. |
| 11:00 | Dashboard task with deliverable. |
| 14:00 | Activity feed events. |

## Learner Checkpoint

Complete a demo task with one saved output and verify it appears on the dashboard.
