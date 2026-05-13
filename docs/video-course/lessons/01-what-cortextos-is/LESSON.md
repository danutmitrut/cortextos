# 01 — What cortextOS Is

Duration target: 10-12 minutes

## Learning Outcomes

- Explain cortextOS as a persistent agent operating system, not just a chatbot.
- Describe the relationship between agents, the daemon, Telegram, dashboard, tasks, approvals, crons, memory, and outputs.
- Identify the kinds of workflows cortextOS is good for.

## Script

Open by saying: "cortextOS is for people who want AI agents to keep working after a chat window closes." Then contrast a normal AI chat with a persistent agent: a chat answers one prompt, while a cortextOS agent has a role, memory, tools, a schedule, tasks, and a dashboard-visible work trail.

Walk through the mental model. The daemon keeps agents alive. Agents use runtimes like Claude Code, Codex app server, or Hermes. The bus is the shared coordination layer: it carries tasks, messages, approvals, saved outputs, crons, heartbeats, events, and knowledge-base commands. Telegram is the remote-control surface. The dashboard is the operating room where a human can inspect what happened.

Use three examples: a solo founder with a personal assistant agent, a team with project-manager and coding agents, and a business running support and sales follow-up agents. Emphasize that the same primitives show up in each: agents receive work, create tasks, ask approval before risky external action, save outputs, and report progress.

Close with the promise of the course: by the end, the learner will install cortextOS, run a working agent, understand every dashboard page, customize agents, choose templates, and contribute safely.

## Screen Plan

| Time | Show On Screen |
|---|---|
| 0:00 | Course title and repo README header. |
| 0:45 | README feature list: persistent agents, multi-agent orchestration, runtimes, Telegram, dashboard. |
| 2:00 | Architecture diagram from README. Zoom into daemon, agents, dashboard, Telegram. |
| 4:00 | A clean dashboard home page with demo agents visible. |
| 6:00 | A demo Telegram conversation showing task request, approval, and completion. |
| 8:30 | A task detail or output artifact showing that work is persisted after the chat. |
| 10:00 | Course manifest showing upcoming modules. |

## Learner Checkpoint

Write a one-sentence answer to: "What ongoing job do I want my first cortextOS agent to own?"
