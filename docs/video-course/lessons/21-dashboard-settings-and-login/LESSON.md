# 21 — Dashboard Settings and Login

Duration target: 10-12 minutes

## Learning Outcomes

- Understand dashboard authentication and settings at an operator level.
- Know what secrets/configuration should not be exposed.
- Use settings as configuration review, not as a dumping ground.

## Script

Start on the login page and explain the boundary: dashboard access exposes operational information, tasks, approvals, and sometimes sensitive context. Treat it like an admin surface.

Move to settings. Walk through configuration categories visible in the app. Explain the difference between safe display settings, operational config, and secrets. Secrets belong in `.env` or org/agent secret management paths, not pasted into docs, tasks, or public templates.

Close with a setup review checklist: dashboard accessible, auth configured, secrets not visible, org/agent settings understood, and operators know who can approve external actions.

## Screen Plan

| Time | Show On Screen |
|---|---|
| 0:00 | Login page. |
| 2:00 | Successful entry into dashboard. |
| 4:00 | Settings page overview. |
| 6:00 | Safe configuration example. |
| 8:00 | Redacted `.env.example` or secret guidance. |

## Learner Checkpoint

Confirm you know where credentials live and where they should never be pasted.
