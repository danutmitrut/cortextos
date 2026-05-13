# cortextOS Video Course

This folder is a production-ready course plan for teaching new users how to install, run, customize, operate, and contribute to cortextOS.

The course is built as a recording package:

- `COURSE_MANIFEST.md` gives the module map, lesson order, target outcome, and coverage checklist.
- `PRODUCTION_GUIDE.md` gives recording conventions, screen setup, demo-data rules, and reuse guidance.
- `lessons/<nn>-<slug>/LESSON.md` is one folder per lesson, with a script and the screen plan for that lesson.

## Course Goal

By the end of the course, a learner should be able to:

1. Explain what cortextOS is and when to use it.
2. Install cortextOS and run the first org/agent safely.
3. Use Telegram, the daemon, PM2, the CLI, and the dashboard together.
4. Understand the core dashboard pages as operational surfaces.
5. Pick and configure agent runtimes.
6. Customize agents through bootstrap files, skills, crons, memory, and templates.
7. Set up useful starter template agents.
8. Use tasks, approvals, saved outputs, knowledge base, events, crons, and agent-to-agent messaging.
9. Debug common setup/runtime issues.
10. Contribute changes through the upstream git/PR workflow without polluting public branches.

## Intended Audience

The course is for new cortextOS users ranging from solo operators to teams installing an AI-agent operating system for their business. It assumes basic terminal comfort but does not assume deep TypeScript, daemon, or agent-runtime knowledge.

## Recording Rule

Every lesson should show the actual system or a faithful local sandbox. Avoid slides unless they clarify a concept that cannot be shown directly. Use demo orgs, demo agents, and synthetic data only.

## Folder Contract

Each lesson folder must include:

- A single `LESSON.md`.
- A clear title and duration target.
- Learning outcomes.
- A spoken script.
- A timestamped screen plan describing what the viewer sees while the script is delivered.
- Demo commands or dashboard paths where relevant.
- A learner exercise or checkpoint.
