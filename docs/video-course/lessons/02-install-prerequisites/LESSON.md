# 02 — Install Prerequisites

Duration target: 12-15 minutes

## Learning Outcomes

- Verify the local machine can run cortextOS.
- Understand which credentials are needed and why.
- Avoid exposing tokens or real personal data during setup.

## Script

Start with the minimum stack: Node.js 20+, a supported OS, PM2, at least one runtime login, and a Telegram bot token. Explain that cortextOS can run many things locally, but the agent runtime still needs its own model/provider setup.

Run quick checks for Node, npm, PM2, git, and the desired runtime CLI. Explain PM2 as the process supervisor that keeps the daemon alive across terminal closes and reboots. Explain Telegram credentials as the path for user control and approval messages.

Clarify runtime prerequisites. Claude Code requires Claude Code installed and authenticated. Codex app server requires the Codex runtime dependencies and authentication. Hermes is currently more advanced/experimental and should be used when the Hermes binary/auth path is available.

End by creating a setup checklist: runtime login completed, Telegram bot created, chat ID known, repo installed, and a safe demo org name chosen.

## Screen Plan

| Time | Show On Screen |
|---|---|
| 0:00 | Requirements table from README. |
| 1:30 | Terminal: `node --version`, `npm --version`, `git --version`. |
| 3:00 | Terminal: `pm2 --version` or install command if missing. |
| 4:30 | Runtime checks: `claude --version`, Codex/Hermes checks if present. |
| 7:00 | Browser or Telegram app showing BotFather flow with placeholder values only. |
| 10:00 | A local note/checklist with required credentials and fake demo values. |
| 12:00 | Warning callout: never record real tokens, private orgs, or personal dashboards. |

## Learner Checkpoint

Confirm your machine has Node 20+, git, PM2, and at least one authenticated runtime before continuing.
