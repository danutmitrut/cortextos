# cortextOS Video Course Manifest

## Course Structure

### Module 1 — Fundamentals and First Run

1. `01-what-cortextos-is` — what cortextOS is for and how to think about persistent agents.
2. `02-install-prerequisites` — install requirements, accounts, and local environment checks.
3. `03-guided-install-and-onboarding` — install flow, org creation, first agent, and onboarding.
4. `04-daemon-pm2-and-telegram-control` — daemon lifecycle, PM2, Telegram control loop, and status checks.
5. `05-first-useful-agent-workflow` — create a task, receive a Telegram update, attach an output, and close the loop.

### Module 2 — Dashboard Pages

6. `06-dashboard-home` — dashboard home and system overview.
7. `07-dashboard-agents` — agent fleet list, runtime/status interpretation, and action patterns.
8. `08-dashboard-agent-detail` — individual agent page, context, logs, and operational reading.
9. `09-dashboard-tasks` — task queues, statuses, blockers, deliverables, and review posture.
10. `10-dashboard-approvals` — approval gates, external action safety, and decision flow.
11. `11-dashboard-comms` — Telegram and agent-to-agent message visibility.
12. `12-dashboard-activity` — event stream, audit trail, and operational observability.
13. `13-dashboard-analytics` — performance, trends, throughput, and practical interpretation.
14. `14-dashboard-knowledge-base` — KB ingestion, querying, source quality, and memory use.
15. `15-dashboard-skills` — skill discovery, skill files, and when to create a reusable skill.
16. `16-dashboard-strategy` — goals, strategy pages, and long-running objective management.
17. `17-dashboard-workflows` — workflow/crons overview and recurring automation management.
18. `18-dashboard-workflow-health` — workflow health, stuck cron diagnosis, and recovery.
19. `19-dashboard-new-workflow` — creating a workflow safely from the dashboard.
20. `20-dashboard-experiments` — autoresearch/theta-wave experiments and scoring.
21. `21-dashboard-settings-and-login` — settings, auth/login, secrets posture, and safe configuration.

### Module 3 — Runtimes and Agent Types

22. `22-runtime-claude-code` — Claude Code runtime model, strengths, and setup.
23. `23-runtime-codex-app-server` — Codex app server runtime model, strengths, setup, and differences.
24. `24-runtime-hermes` — Hermes runtime status, architecture, caveats, and future direction.
25. `25-template-agents-and-community-catalog` — starter templates, community catalog, and choosing first agents.
26. `26-setting-up-template-agents` — setting up Concierge, CRM, PM, KB, automation, and specialist agents.

### Module 4 — Core Operating Skills

27. `27-customizing-bootstrap-files` — bootstrap file map and safe customization.
28. `28-skills-and-tool-connections` — skills, connectors, MCP, CLI tools, and tool-agnostic practices.
29. `29-bus-tasks-messages-and-outputs` — bus primitives for tasks, inbox, messages, and saved outputs.
30. `30-crons-reminders-and-scheduled-work` — daemon-managed crons, reminders, and recurring jobs.
31. `31-memory-and-knowledge-workflows` — daily memory, long-term memory, KB, and handoff discipline.
32. `32-approvals-guardrails-and-human-tasks` — safety gates, human blockers, and escalation.

### Module 5 — Building, Troubleshooting, and Contributing

33. `33-debugging-and-system-diagnostics` — doctor, logs, heartbeats, stuck agents, and common failures.
34. `34-contributing-and-git-model` — upstream/personal branches, PR hygiene, and contribution flow.
35. `35-course-capstone-build-your-first-agent-system` — capstone: install, configure starter agents, run a workflow, and review results.

## Coverage Checklist

| Requirement | Evidence |
|---|---|
| Fundamentals of install | Lessons 02 and 03 |
| What the system is for | Lesson 01 |
| Getting it running | Lessons 03 and 04 |
| Customizing it | Lessons 26, 27, 28, 30, 31 |
| Setting up template agents | Lessons 25 and 26 |
| Each dashboard page has a lesson | Lessons 06-21 cover every `dashboard/src/app/(dashboard)` page plus auth/login |
| Each agent runtime has a lesson | Lessons 22-24 cover Claude Code, Codex app server, and Hermes |
| Basic/fundamental topics | Modules 1 and 4 |
| Contributing and git treatment | Lesson 34 |
| Each lesson has its own folder | `lessons/<nn>-<slug>/` |
| Each lesson has script and screen plan | Every `LESSON.md` includes `Script` and `Screen Plan` sections |

## Suggested Course Length

- Short cut: record only Modules 1, 3, and 4 for a 2-3 hour starter course.
- Full course: record all lessons for a 6-8 hour guided implementation course.
- Community onboarding track: emphasize lessons 01-05, 21, 25-32, and 35.
