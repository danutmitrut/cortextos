# 03 — Guided Install and Onboarding

Duration target: 15-20 minutes

## Learning Outcomes

- Install cortextOS from the official installer.
- Create the first org and first agent.
- Understand what onboarding configures.

## Script

Introduce the guided install as the recommended route for most users. Show the install command from the README and explain what it places on disk: repo, state directories, templates, CLI, and bootstrap files.

Open the installed project in the chosen runtime and run onboarding. Explain that onboarding is not decoration; it creates an org, configures agents, validates credentials, sets up the daemon path, and gets the first Telegram-controlled agent online.

Pause on the generated org structure. Show `orgs/<org>/agents/<agent>/config.json`, `.env`, and bootstrap files. Explain that each agent is a folder with identity, goals, guardrails, tools, memory, skills, and runtime configuration.

End by sending one Telegram message to the agent and confirming the response appears through the bus/dashboard, not as an invisible local chat.

## Screen Plan

| Time | Show On Screen |
|---|---|
| 0:00 | README Quick Start command. |
| 1:30 | Terminal running installer in a clean demo directory. |
| 4:00 | Runtime opened in the repo with onboarding command visible. |
| 7:00 | Onboarding prompts with demo org and agent values. |
| 10:00 | File tree: `orgs/demoorg/agents/boss/`. |
| 12:00 | Open `config.json`, `.env.example`, `AGENTS.md`, `TOOLS.md`. |
| 15:00 | Telegram message to the first agent and visible response. |

## Learner Checkpoint

You should have one org, one enabled agent, and a Telegram path that can receive a reply.
