# 34 — Contributing and Git Model

Duration target: 15-18 minutes

## Learning Outcomes

- Understand the difference between local, personal, and upstream work.
- Create clean feature branches.
- Avoid leaking personal files or dashboard artifacts into public PRs.

## Script

Explain the contribution posture: cortextOS work should be cut from clean upstream main, developed on a scoped branch, validated locally, and submitted as a PR. Personal data and private dashboard files must never land in public branches.

Show remotes and branch status. Create a safe feature branch from upstream main in a clean worktree. Make a small docs change, run a scan, inspect `git diff --name-only`, and explain what reviewers need: summary, test evidence, and known risks.

Teach pollution prevention. Before pushing, scan changed paths for personal orgs, private dashboard pages, secrets, and generated state. If something looks unrelated, stop and investigate.

Close with merge discipline: agents can prepare PRs, but merges or public posts may require explicit approval depending on team rules.

## Screen Plan

| Time | Show On Screen |
|---|---|
| 0:00 | `git remote -v`. |
| 2:30 | `git fetch upstream main` and worktree/branch creation. |
| 5:30 | Small safe docs edit. |
| 8:00 | `git diff --name-only` and pollution scan. |
| 11:00 | Commit and PR creation flow. |
| 14:00 | PR body with validation evidence. |

## Learner Checkpoint

Before opening a PR, list three scans or checks you will run to prevent accidental pollution.
