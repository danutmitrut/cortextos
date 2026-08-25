# Active Fleets - Local Machine

Last updated: 2026-06-22

This file is the local source of truth for Dan's active cortextOS/Nova Cortex entities on this machine.

## Production

### Mister O

- Path: `/Users/danmitrut/PROIECTE AI/open-clawd-agent`
- Type: standalone Claude agent, outside cortextOS
- Channel: Telegram
- Status: active production
- Notes: separate Telegram bot from Nova Cortex course orchestrator.

### DM Brain Orchestra

- Org: `/Users/danmitrut/cortextos/orgs/dm-brain-orchestra`
- Channel: Slack
- Status: active production
- Active agents:
  - `maestro`
  - `analist`
  - `deker`
  - `dm-copyteller`
  - `imager`
  - `youtuber-scout`
- Rule: do not use Telegram credentials in this org.

## Course / Demo

### Telegram Course Demo

- Org: `/Users/danmitrut/cortextos/orgs/nova-danut-mitrut`
- Active agents:
  - `orchestrator`
  - `telegram-analyst`
- Runtime: Claude Code by default, with Codex fallback available
- Channel: Telegram
- Status: active course/demo
- Important: the analyst in this org is named `telegram-analyst` because the global name `analyst` is used by the Slack demo org.

### Slack Course Demo

- Org: `/Users/danmitrut/cortextos/orgs/nova-mitrut-danut`
- Active agents:
  - `boss`
  - `analyst`
- Runtime: Codex
- Channel: Slack
- Status: active course/demo

## Inactive / Historical

Archived inactive folders live under:

`/Users/danmitrut/cortextos/_inactive-archives/2026-06-22-demo-cleanup`

### nova-danut

- Former org path: `/Users/danmitrut/cortextos/orgs/nova-danut`
- Archived path: `/Users/danmitrut/cortextos/_inactive-archives/2026-06-22-demo-cleanup/nova-danut`
- Status: inactive historical demo
- Agents:
  - `boss`
  - `analyst`
- Cleanup status: removed from active `orgs/`; `config.json` set to `enabled=false`; `.env` channel/credentials disabled with timestamped backups.

### Inactive folders inside nova-danut-mitrut

- Former paths:
  - `/Users/danmitrut/cortextos/orgs/nova-danut-mitrut/agents/boss`
  - `/Users/danmitrut/cortextos/orgs/nova-danut-mitrut/agents/analyst`
- Archived paths:
  - `/Users/danmitrut/cortextos/_inactive-archives/2026-06-22-demo-cleanup/nova-danut-mitrut-agents/boss`
  - `/Users/danmitrut/cortextos/_inactive-archives/2026-06-22-demo-cleanup/nova-danut-mitrut-agents/analyst`
- Cleanup status: removed from active `orgs/`; `config.json` set to `enabled=false`; `.env` channel/credentials disabled with timestamped backups.

## Rules

1. One Telegram bot token must belong to one active poller only.
2. Do not leave old demo folders with `enabled=true`.
3. Before switching runtime or debugging silence, run:

   ```bash
   cd /Users/danmitrut/nova-agents
   bash scripts/nova-doctor.sh --org <org> --agent <agent>
   ```

4. If an agent is `running` but Telegram is silent, check daemon logs for `conflict-self-die`.
5. If `conflict-self-die` appears:
   - check duplicate Telegram tokens;
   - disable stale demo folders;
   - restart only the affected agent;
   - restart `cortextos-daemon` only if the daemon keeps stale pollers in memory.

## Current Expected Registry

```text
maestro          -> dm-brain-orchestra
analist         -> dm-brain-orchestra
imager          -> dm-brain-orchestra
dm-copyteller   -> dm-brain-orchestra
deker           -> dm-brain-orchestra
youtuber-scout  -> dm-brain-orchestra
boss            -> nova-mitrut-danut
analyst         -> nova-mitrut-danut
orchestrator    -> nova-danut-mitrut
telegram-analyst -> nova-danut-mitrut
sm-writer       -> disabled / nova-danut
```
