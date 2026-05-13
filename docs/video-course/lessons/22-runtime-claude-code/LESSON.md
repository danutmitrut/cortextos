# 22 — Runtime: Claude Code

Duration target: 10-12 minutes

## Learning Outcomes

- Understand the Claude Code runtime's role in cortextOS.
- Know when to choose it.
- Identify the files and skills that matter for Claude-style agents.

## Script

Explain that `claude-code` is the default runtime for many cortextOS agents. It runs an interactive Claude Code session under the daemon's supervision, with the bus and bootstrap files shaping behavior.

Show an agent `config.json` with `runtime: "claude-code"`. Open `.claude/skills/` and the main bootstrap files. Explain that Claude Code is strong for repo work, agentic coding, docs, long workflows, and tool-heavy local operations when authenticated and installed correctly.

Close with setup expectations: login to Claude Code, confirm the binary works, configure the agent, restart intentionally, and verify dashboard/Telegram behavior.

## Screen Plan

| Time | Show On Screen |
|---|---|
| 0:00 | Runtime table from README. |
| 2:00 | `templates/agent/config.json` or demo agent config. |
| 4:00 | `.claude/skills/` folder. |
| 6:00 | Claude Code terminal session under daemon control. |
| 9:00 | Dashboard agent runtime badge/status. |

## Learner Checkpoint

Find one Claude Code agent and identify its config, skills folder, and current runtime status.
