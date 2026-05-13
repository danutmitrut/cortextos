# 24 — Runtime: Hermes

Duration target: 10-12 minutes

## Learning Outcomes

- Understand Hermes as an experimental/advanced runtime option.
- Know the current integration shape.
- Explain why runtime parity matters.

## Script

Introduce Hermes as a runtime path being integrated into cortextOS for agents that use Hermes-native capabilities while still participating in cortextOS tasks, crons, Telegram, dashboard, and bus workflows.

Show `templates/hermes/` and `src/pty/hermes-pty.ts`. Explain that the cortextOS layer should remain authoritative for dashboard-visible tasks, outputs, approvals, agent messaging, and daemon-managed crons. Hermes-native features are valuable, but overlapping behavior must be bridged so work remains visible.

Close with a practical recommendation: use Hermes when the binary/auth path is installed and when the team is comfortable with runtime-specific caveats; otherwise start with Claude or Codex.

## Screen Plan

| Time | Show On Screen |
|---|---|
| 0:00 | Runtime table mentioning Hermes. |
| 2:00 | `templates/hermes/` folder. |
| 4:00 | `src/pty/hermes-pty.ts` file tree. |
| 6:00 | Diagram: Hermes native features bridged into cortextOS bus. |
| 9:00 | Dashboard agent runtime badge for Hermes if available, otherwise config example. |

## Learner Checkpoint

Name two cortextOS behaviors that should stay authoritative even when using Hermes.
