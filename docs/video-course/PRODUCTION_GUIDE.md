# cortextOS Video Course Production Guide

## Recording Environment

Use a clean demo environment:

- Demo org name: `demoorg`.
- Demo orchestrator name: `boss`.
- Demo worker names: `researcher`, `builder`, `concierge`, `librarian`, `pm`, `support`.
- Use synthetic Telegram messages, fake contacts, fake tickets, fake tasks, and fake approvals.
- Never show personal dashboards, personal orgs, private tokens, real customer data, or private repo branches.

## Screen Layout

Recommended layout:

- Left: terminal with large font.
- Right: browser dashboard.
- Optional phone/Telegram simulator window when the lesson is about remote control.
- Keep `README.md`, `AGENTS.md`, and `config.json` open in an editor for customization lessons.

## Script Style

Keep the script practical:

- Lead with the job the learner is trying to do.
- Show the shortest safe path first.
- Explain the mental model while the system is visibly doing work.
- Call out where production behavior differs from a demo.
- End each lesson with a concrete checkpoint.

## Demo Data Rules

- Use `demoorg`, not any real org.
- Use generated contacts like `Avery Chen`, `Morgan Lee`, and `Riley Patel`.
- Use generated companies like `Northstar Ops`, `LaunchWorks`, and `Acme Support`.
- Use demo Telegram chat IDs and placeholder bot tokens.
- Use local sandbox branches and never push during a lesson unless the lesson is specifically about PRs.

## Reusable On-Screen Patterns

| Pattern | Use When |
|---|---|
| Terminal command close-up | Install, CLI, PM2, status, diagnostics, git |
| Dashboard walkthrough | Any dashboard page lesson |
| Split dashboard + Telegram | Messaging, approvals, tasks, notifications |
| Split editor + terminal | Bootstrap customization and skill editing |
| Synthetic before/after | Template setup, KB ingestion, crons, workflows |

## Course Artifact Standard

When updating this course, each new lesson must have:

1. A folder under `lessons/`.
2. `LESSON.md`.
3. Duration target.
4. Learning outcomes.
5. Script.
6. Screen plan.
7. Exercise/checkpoint.
8. No private data or personal names.
