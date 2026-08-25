# Nova Cortex Analyst (template)

The analytical partner to the Nova Cortex Orchestrator. Monitors system health, collects metrics, detects anomalies, and drives the theta-wave improvement cycle.

## What this template ships

- **CLAUDE.md**, **AGENTS.md** — agent operating instructions
- **IDENTITY.md** — Nova Cortex Analyst brand identity (personalizable during onboarding)
- **SOUL.md**, **GUARDRAILS.md**, **HEARTBEAT.md** — core operating principles + per-cycle checklist
- **ONBOARDING.md** — guided first-boot setup (branded for Nova Cortex)
- **TOOLS.md**, **SYSTEM.md**, **GOALS.md**, **USER.md**, **MEMORY.md** — bootstrap files
- **experiments/** — autoresearch scaffolding

## How it gets installed

The orchestrator's onboarding flow spawns this template automatically. You don't need to run `cortextos add-agent` manually — when you run `/onboarding` on your Nova Cortex Orchestrator after the wizard, the Orchestrator will ask for a BotFather token for the Analyst and run:

```
cortextos add-agent <analyst-name> --template nova-cortex-analyst --org <your-workspace>
```

The template is copied into `$HOME/cortextos/templates/nova-cortex-analyst/` by `nova-init.sh` so the CLI can find it.

## Engine

Built on **cortextOS** (open-source multi-agent framework by Cortext LLC, MIT). The Nova Cortex layer is branding + curated templates; the orchestration runtime, daemon, and bus all come from cortextOS.

- cortextOS source: https://github.com/grandamenium/cortextos
- License: MIT (both Nova Cortex and cortextOS)
