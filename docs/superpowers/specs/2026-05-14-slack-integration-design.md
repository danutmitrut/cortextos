# Slack Integration Design

## Goal

Adauga suport Slack bidirectional in CortexTOS, in paralel cu Telegram, urmand acelasi pattern architectural. Fiecare agent are propriul Slack bot (paritate cu Telegram). O noua comanda `cortextos bus send-message` ruteza mesajele outbound catre toate canalele configurate, channel-agnostic.

## Arhitectura

### Fisiere noi

```
src/slack/
  api.ts       — SlackAPI: sendMessage, uploadFile via @slack/web-api
  poller.ts    — SlackPoller: Socket Mode listener, onMessage handlers
  logging.ts   — logInboundSlack, logOutboundSlack
  index.ts     — reexporturi
```

### Fisiere modificate

| Fisier | Modificare |
|---|---|
| `src/daemon/agent-manager.ts` | citeste SLACK_* din .env, instantiaza SlackAPI + SlackPoller, porneste in paralel cu Telegram |
| `src/bus/system.ts` | adauga comanda `send-message` care ruteaza catre toate canalele configurate |
| `src/hooks/hook-crash-alert.ts` | citeste `SLACK_BOT_TOKEN`/`SLACK_CHANNEL_ID` din .env (acelasi pattern ca `BOT_TOKEN`), trimite alerta si pe Slack daca sunt prezente |
| `package.json` | adauga `@slack/web-api` si `@slack/socket-mode` |
| `templates/orchestrator/AGENTS.md` | inlocuieste `send-telegram` cu `send-message` |
| `templates/analyst/AGENTS.md` | inlocuieste `send-telegram` cu `send-message` |
| `templates/agent/AGENTS.md` | inlocuieste `send-telegram` cu `send-message` |

### Fisiere neatinse

`src/telegram/`, `src/bus/` (except system.ts), `src/pty/`, `src/daemon/agent-process.ts` — zero modificari.

## Data Flow

### Inbound (Slack → agent)

```
User scrie in #maestro
  → SlackPoller primeste evenimentul via Socket Mode WebSocket
  → verifica SLACK_ALLOWED_USER (blocheaza orice alt user)
  → formateaza: "Slack message from <user>: <text>"
  → checker.queueTelegramMessage(formatted)  ← acelasi PTY inject ca Telegram
  → agentul primeste mesajul in PTY
```

### Outbound (agent → user)

```
Agent ruleaza: cortextos bus send-message "text"
  → citeste .env pentru agentul curent
  → trimite pe Telegram daca BOT_TOKEN prezent
  → trimite pe Slack daca SLACK_BOT_TOKEN prezent
  → trimite pe ambele daca ambele sunt configurate
```

`cortextos bus send-telegram` ramane functional pentru backward compatibility — intern devine alias catre `send-message`.

## Configurare `.env` per agent

```bash
# Telegram (existent, neschimbat)
BOT_TOKEN=123456:ABC...
CHAT_ID=987654321
ALLOWED_USER=987654321

# Slack (nou)
SLACK_BOT_TOKEN=xoxb-...       # Bot User OAuth Token
SLACK_APP_TOKEN=xapp-...       # App-Level Token (necesar pentru Socket Mode)
SLACK_CHANNEL_ID=C0123456789   # ID canal dedicat agentului
SLACK_ALLOWED_USER=U0123456    # Slack User ID al operatorului
```

Oricare sectiune poate lipsi. Daca `SLACK_BOT_TOKEN` lipseste, Slack nu porneste. Daca `BOT_TOKEN` lipseste, Telegram nu porneste. Pot coexista sau rula separat, pe acelasi agent.

## Slack App Setup (per agent)

Fiecare agent necesita o Slack App separata in acelasi workspace:

1. Creeaza Slack App la api.slack.com/apps
2. Activeaza Socket Mode (Settings → Socket Mode)
3. Genereaza App-Level Token cu scope `connections:write` → `SLACK_APP_TOKEN`
4. Adauga Bot Token Scopes: `chat:write`, `channels:history`, `channels:read`
5. Instaleaza app-ul in workspace → copiaza Bot User OAuth Token → `SLACK_BOT_TOKEN`
6. Invita botul in canal: `/invite @maestro-bot`
7. Copiaza Channel ID (click pe canal → About) → `SLACK_CHANNEL_ID`
8. Gaseste-ti User ID (click pe profilul tau → Copy member ID) → `SLACK_ALLOWED_USER`

## Error Handling

| Situatie | Comportament |
|---|---|
| Token invalid la startup | log warning, Slack nu porneste, agentul continua fara Slack |
| Canal negasit | log warning, comportament identic |
| Socket Mode disconnect | SlackPoller reconecteaza automat (SDK nativ) |
| Rate limit Slack API | SlackAPI respecta Retry-After header |
| `send-message` fara niciun canal | eroare clara: "No messaging channels configured for agent `<name>`" |

Principiu: un canal care cade nu afecteaza celalalt canal si nu opreste agentul.

## Testare

```
tests/unit/slack/api.test.ts       — mock fetch, sendMessage, rate limiting
tests/unit/slack/poller.test.ts    — mock Socket Mode, ALLOWED_USER gate, routing
tests/unit/bus/send-message.test.ts — routing catre Telegram, Slack, ambele, niciunul
```

## Reversibilitate

Integrarea Slack este **pur aditiva** - nu modifica niciun comportament existent. Revenirea la configuratia de baza se face in doua moduri:

**Dezactivare per agent** - stergi sau comentezi liniile `SLACK_*` din `.env`. Agentul porneste fara Slack, Telegram functioneaza neschimbat.

**Dezactivare completa** - stergi `src/slack/`, revii la `send-telegram` in templates, scoti dependintele din `package.json`. Sistemul revine exact la starea initiala, fara urme.

Codul Telegram si logica de bus existenta nu se modifica structural - Slack e un listener adaugat in paralel, nu un inlocuitor.

## Dependinte noi

| Pachet | Versiune | Motiv |
|---|---|---|
| `@slack/web-api` | latest | HTTP API client (sendMessage, uploadFile) |
| `@slack/socket-mode` | latest | Socket Mode WebSocket client (echivalent polling Telegram) |
