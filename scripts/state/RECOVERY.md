# cortextOS State Recovery

Operational procedure for the state-integrity scripts in this directory.

## Scripts

| Script | Purpose |
|--------|---------|
| `backup-state.sh` | Snapshot runtime state to `~/.cortextos-backups/YYYY-MM-DD/`. Safe to run live. Redacts `.env`/`secrets.env` automatically. |
| `validate-state.sh` | Schema check across crons, heartbeats, tasks, goals, onboarded flags. Exit 0 = clean. |
| `restore-state.sh <backup-dir> [--dry-run] [--yes]` | Restore from a snapshot. Always snapshots current state first into `_pre-rollback_<ts>/` before overwriting. |

## When to roll back

Trigger a restore when any of the following is true:

1. `validate-state.sh` reports JSON corruption you cannot localize and patch.
2. Tasks DB is unreadable (`cortextos bus list-tasks` errors out instead of returning `[]`).
3. `crons.json` shows entries you did not create, or is missing your standard schedule.
4. Files were accidentally deleted (a `rm` ran too wide).
5. An upgrade or migration left the state in an inconsistent shape.

Do NOT trigger a restore for:
- Stale heartbeats (the daemon will refresh them on its own tick).
- Empty inboxes or single-message glitches (transient, not durable state).
- Logs showing past errors that have already resolved.

## Procedure

```bash
# 1. Confirm the state is actually broken.
bash scripts/state/validate-state.sh

# 2. List available backups, pick the latest known-good one.
ls -1 ~/.cortextos-backups

# 3. Preview what the restore would do — no changes.
bash scripts/state/restore-state.sh ~/.cortextos-backups/<date> --dry-run

# 4. Run the restore. Will prompt for confirmation unless --yes is passed.
bash scripts/state/restore-state.sh ~/.cortextos-backups/<date>

# 5. Restart the daemon so it reloads the restored state.
cortextos restart

# 6. Re-validate.
bash scripts/state/validate-state.sh
```

If step 6 still fails: the chosen backup was already corrupted. Try an older one. The
pre-rollback snapshot (also under `~/.cortextos-backups/`, prefixed `_pre-rollback_`) is
the "undo" — pass it to `restore-state.sh` to revert the rollback itself.

## What is NOT in the backup

- `.env` and `secrets.env` files are excluded. Companion `.redacted` files preserve the
  schema (which keys existed) but never the values. After a restore that touches the
  repo's `orgs/` tree, re-populate secrets manually before restarting the daemon, or
  agents will fail to authenticate with Telegram and any external services.
- Daemon logs, dashboard cache, socket files, PID files — all regenerable, all skipped.

## Retention

Daily backups are pruned after 30 days. Override with `RETENTION_DAYS=N bash backup-state.sh`.

The pre-rollback safety snapshots are not pruned by the same rule (they sit alongside dated
snapshots and are kept indefinitely). Clean them up manually once you are confident the
rollback worked.

## Scheduling

The daily backup runs as a cron registered with the daemon:

```bash
cortextos bus add-cron maestro daily-state-backup "30 21 * * *" \
  "Run bash $CTX_FRAMEWORK_ROOT/scripts/state/backup-state.sh. If exit code is non-zero, send a Telegram alert with the failure details."
```

Schedule chosen: 21:30 Bucharest, after the evening review fires and before the laptop
sleeps for the night.
