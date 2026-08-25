# Nova Cortex Orchestrator (template)

The chief-of-staff agent at the center of every Nova Cortex workspace. Coordinates a multi-agent business team, sends daily briefings, cascades goals, monitors fleet health, and surfaces approvals to the user.

## What this template ships

- **CLAUDE.md**, **AGENTS.md** — agent operating instructions (session start, task workflow, memory, event logging, cron, restart)
- **IDENTITY.md** — Nova Cortex Orchestrator brand identity (personalizable during onboarding)
- **SOUL.md** — core principles (system-first, memory discipline, autonomy rules)
- **GUARDRAILS.md** — red-flag patterns to avoid mid-cycle
- **HEARTBEAT.md** — per-cycle checklist (every 4 hours by default)
- **ONBOARDING.md** — guided first-boot setup (27 steps, branded for Nova Cortex)
- **TOOLS.md**, **SYSTEM.md**, **GOALS.md**, **USER.md**, **MEMORY.md** — bootstrap files
- **.claude/skills/** — full library of orchestrator skills (morning-review, evening-review, goal-management, theta-wave, agent-management, etc.)
- **experiments/** — autoresearch scaffolding

## How it gets installed

`nova-init.sh` copies this directory into `$HOME/cortextos/templates/nova-cortex-orchestrator/` so the cortextOS CLI can find it when you run:

```
cortextos add-agent boss --template nova-cortex-orchestrator --org <your-workspace>
```

## Customizing

If you want to fork the orchestrator for your own org:
1. Copy this directory and rename it (e.g. `your-brand-orchestrator`).
2. Patch the brand surfaces: `IDENTITY.md`, `CLAUDE.md` header, `ONBOARDING.md` Step 1 boot message, and Step 18 identity template.
3. Drop the new template into `$HOME/cortextos/templates/` and pass it to `cortextos add-agent --template <your-name>`.

## Engine

Built on **cortextOS** (open-source multi-agent framework by Cortext LLC, MIT). The Nova Cortex layer is branding + curated templates; the orchestration runtime, daemon, and bus all come from cortextOS.

- cortextOS source: https://github.com/grandamenium/cortextos
- License: MIT (both Nova Cortex and cortextOS)
