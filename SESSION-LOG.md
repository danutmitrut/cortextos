## 2026-05-16 — Design dezactivare Telegram reversibilă (spec aprobat)

LUCRAT:
- Brainstorming complet pentru renunțarea la Telegram în `dm-brain-orchestra`, rămânem Slack-only
- Mapat arhitectura Telegram vs Slack (agent Explore), identificat 3 cuplaje periculoase: early-return în `hook-crash-alert.ts` care omoară alerta Slack, `slack/media.ts` importă din `telegram/`, `queueTelegramMessage` e coada PTY comună (nume înșelător)
- Scris și self-review spec aprobat: `docs/superpowers/specs/2026-05-16-telegram-reversible-disable-design.md`
- Modificările pre-existente din working tree (templates, ecosystem.config.js, etc.) NU sunt din sesiunea asta și au fost lăsate neatinse

DECIZII:
- Abordare aleasă: dezactivare reversibilă printr-un flag unic `CTX_TELEGRAM_DISABLED`, fără ștergere de cod/tipuri/credentiale
- Hook-urile interactive (permisiuni/plan/ask/compact): stub-uri fail-open non-blocante acum (permisiune→allow, ca să nu înghețe agenții daemon), echivalent Slack într-o fază viitoare de construcție
- `send-telegram` devine shim spre Slack când flag-ul e setat → zero rescriere de template-uri
- `hook-crash-alert` decuplat de credentialele Telegram → alertele de crash merg pe Slack (repară și bug-ul de cuplaj existent)
- Spec rămâne local, necomis (`docs/` e gitignored intenționat, "personal, not for public repo")

CORECȚII USER:
- Userul a ales explicit dezactivarea reversibilă (nu ștergere completă) și a aprobat designul + spec-ul fără nicio modificare

DE FĂCUT:
- [ ] Implementarea spec-ului `telegram-reversible-disable` (sesiune viitoare): helper flag partajat → gate în `agent-manager.ts` → stub-uri fail-open în cele 4 hook-uri → shim `send-telegram`→Slack în `cli/bus.ts` → decuplare `hook-crash-alert.ts` → teste noi (regresie crash-alert, shim, stub-uri) → rollout `pm2 restart` + smoke test Slack
- [ ] La planificare: verifică dacă vreun skill trimite media prin `send-telegram` (shim-ul acoperă doar text deocamdată)

---

## 2026-05-12 — Onboarding complet + skill identity design

LUCRAT:
- Onboarding complet CortextOS: org `dm-brain-orchestra`, agent `maestro`, dashboard, Knowledge Base (Gemini), PM2 + launchd autostart
- Instalare nova-rehearsal (nova-agents) pentru demo mâine — funcțional în 5 minute
- Verificat autostart: PM2 launchagent configurat, boss pornit sub cortextos-daemon
- Creat skill nou `community/skills/agent-identity-design/SKILL.md` — workflow structurat 5 întrebări pentru identități precise de agenți
- Discutat strategie demo Ziua 2: traseu complet install→agent→identitate→output
- Clarificat ce determină output performant: identitate > model > skill > memorie > surse externe

DECIZII:
- agent-identity-design skill va fi construit live pe scenă (Claude Code în demo), nu pre-instalat
- Skillul rămâne deocamdată doar în repo-ul local, nu urcat în nova-agents (studenții nu îl primesc încă)
- Boss (nova-danut-mitrut) și Maestro (dm-brain-orchestra) rulează sub același cortextos-daemon
- Template ales pentru demo: writer / researcher / cto în funcție de case-ul lui Alexei

DE FĂCUT:
- [ ] Dimineață: primește case-ul de la Alexei
- [ ] Test complet cu case-ul real: install fresh → skill → agent cu identitate precisă → output
- [ ] Demo live Ziua 2: install Nova Cortex, build skill live, creare agent, lucru cu agentul

---
