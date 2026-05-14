# cortextOS Security Operations

This document is the operational reference for keeping the agent fleet's external surface and credentials clean. Read it once, run the audits monthly, and follow the rotation policy.

## What this protects

- **Telegram bots** — every agent that talks via Telegram has its own bot token. A leaked token lets a stranger DM the bot and trigger actions inside the agent's session.
- **API keys** — Claude (Anthropic), Gemini, OpenAI, GitHub. A leaked key drains budget or impersonates the org.
- **`.env` and `secrets.env` files** — accidental commit puts everything above on GitHub forever.

## The four layers of defense

### 1. ALLOWED_USER gate (runtime)

Every agent's `.env` MUST contain `ALLOWED_USER=<numeric Telegram user id>` whenever `BOT_TOKEN` is set. The daemon refuses to start the Telegram listener otherwise (see `src/daemon/agent-manager.ts:233`). The fast-checker rejects any inbound message or callback whose `from.id` does not match (see `src/daemon/fast-checker.ts:466`, `:550`, `agent-manager.ts:322`, `:431`).

`ALLOWED_USER` must be the numeric id, not a `@username`. Username strings are silently rejected by the daemon.

**Audit:** `bash scripts/security/audit-allowed-user.sh`
Returns 0 if every Telegram-enabled agent has a valid numeric `ALLOWED_USER`, 1 otherwise. Add `--json` for machine-readable output.

### 2. Pre-commit hook (write-time)

`scripts/hooks/pre-commit` blocks any commit that adds:
- A file matching `*.env`, `secrets.env`, `credentials.json`, `*.pem`, `*.key` (except `*.env.example` and `*.env.local.example`).
- Staged content matching known secret patterns (Telegram BOT_TOKEN, `sk-ant-*`, `sk-proj-*`, `sk-*`, `AIza*`, `ghp_*`, `github_pat_*`, `AKIA*`).

**Install in a fresh clone:** `bash scripts/setup-hooks.sh`

If you ever bypass the hook with `git commit --no-verify`: rotate the leaked secret immediately and log it in your daily memory.

### 3. Tracked-file scanner (audit-time)

`scripts/security/scan-secrets.sh` scans the git index (current HEAD) for the same patterns plus committed `.env` / `secrets.env` filenames. Run it monthly and after any "did I just commit something?" moment. Exit 0 = clean.

This does NOT scan git history. For history audits use `git log -p | grep -E "<pattern>"` or a dedicated tool like `trufflehog`.

### 4. `.gitignore` discipline

The repo's `.gitignore` already excludes `.env`, `templates/*/.env`, `.cortextos-env`, and the entire `orgs/` tree (where per-agent `.env` and `secrets.env` live). When adding a new secret-bearing path, double-check it's covered before committing anything in its directory.

## API key rotation policy

**Every 90 days**, rotate:
- All Telegram bot tokens (use `@BotFather` → `/revoke` → reissue, then update each `.env`).
- All Claude (`ANTHROPIC_API_KEY`), Gemini (`GEMINI_API_KEY`), OpenAI (`OPENAI_API_KEY`) keys.
- Any GitHub PATs used by agents.

**On any suspected leak**, rotate immediately, do not wait for the next cycle.

The orchestrator (`maestro`) tracks the next rotation date in its long-term memory and pings the user when due.

## What to do if a secret leaks

1. **Rotate first, investigate second.** The provider's revoke button is the only thing that actually fixes the leak. Do that before anything else.
2. **Update every `.env` that used the rotated value**, then `cortextos restart <agent>` for affected agents.
3. **Decide about history.** If the secret was pushed to a public remote, treat it as burned even after rotation. For private repos: `git filter-repo` or BFG to strip it; force-push if the team agrees.
4. **Log the incident** in `orgs/<org>/agents/maestro/memory/<date>.md` under an `## Incident` section: what leaked, when discovered, when rotated, blast radius.

## Periodic checks (recommended cron)

```bash
# Daily: ALLOWED_USER audit (cheap, exit-1 → page the orchestrator)
cortextos bus add-cron maestro security-allowed-user-audit 24h "Run bash scripts/security/audit-allowed-user.sh and surface any failures to the user."

# Weekly: tracked-file secret scan
cortextos bus add-cron maestro security-secret-scan 168h "Run bash scripts/security/scan-secrets.sh and surface any failures to the user."
```

Both are non-destructive read-only scans — safe to run on the daemon schedule.
