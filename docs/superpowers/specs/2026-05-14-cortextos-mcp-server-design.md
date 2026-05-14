# CortexTOS MCP Server — Design Spec

**Data:** 2026-05-14
**Autor:** Dan Mitruț
**Status:** Aprobat, pregătit pentru implementare

## Scopul

Expunerea întregii funcționalități CortexTOS ca MCP server local, accesibil din Claude Code (VS Code). Paritate completă cu interfața Telegram, plus vizibilitate "sub capotă" în bus, logs și metrici. Telegram rămâne activ în paralel pentru comunicări de pe mobil.

## Arhitectură

MCP server-ul stă în `src/mcp/` în cortextos repo. E un process Node.js separat care pornește la deschiderea VS Code și rămâne activ cât lucrezi. Comunică cu bus-ul existent prin funcțiile TypeScript deja scrise — nu introduce dependențe noi față de bus API.

```
Claude Code (VS Code)
    ↓ tool call (stdio)
cortextos-mcp (src/mcp/index.ts)
    ↓ apelează direct
Bus API (src/bus/*.ts)
    ↓ fișiere în ~/.cortextos/
Agenți (maestro, etc.)
    ↓ răspund în bus + Telegram (paralel)
```

Înregistrat în `~/.claude/settings.json`:
```json
"mcpServers": {
  "cortextos": {
    "command": "node",
    "args": ["/Users/<user>/cortextos/dist/mcp/index.js"]
  }
}
```

## Tooluri MCP — 14 tooluri în 4 grupe

### `agent_*` — Comunicare cu agenții
| Tool | Parametri | Descriere |
|------|-----------|-----------|
| `agent_send` | `agent`, `message` | Trimite mesaj, polling până la răspuns (timeout 120s) |
| `agent_list` | — | Lista agenților cu status (running/stopped) |
| `agent_status` | `agent` | Status detaliat: task curent, uptime, model, last heartbeat |

### `bus_*` — Inspector sub capotă
| Tool | Parametri | Descriere |
|------|-----------|-----------|
| `bus_inbox` | `agent` | Citește inbox-ul unui agent (mesaje neprocesate) |
| `bus_read_all_heartbeats` | — | Heartbeat-urile tuturor agenților activi |
| `bus_list_tasks` | `agent?` | Task-uri brute din fișierele bus (neprocesate, pentru debug) |

### `task_*` — Tasks și aprobări
| Tool | Parametri | Descriere |
|------|-----------|-----------|
| `task_list` | `status?`, `agent?` | Lista task-urilor cu filtre |
| `task_approve` | `task_id` | Aprobă un task pending |
| `task_reject` | `task_id`, `reason?` | Respinge un task pending |
| `task_create` | `agent`, `title`, `description` | Creează task nou pentru un agent |

### `admin_*` — Administrare și logs
| Tool | Parametri | Descriere |
|------|-----------|-----------|
| `admin_logs` | `agent`, `lines?` (default 50) | Ultimele N linii din PM2 logs ale agentului |
| `admin_crons` | `agent` | Cronogramele agentului cu next-fire time |
| `admin_restart` | `agent` | Restartează un agent (stop + start) |
| `admin_metrics` | `agent?` | Metrici: cost sesiune, nr mesaje, uptime |

## Flow de răspuns — `agent_send`

1. Scrie mesaj în inbox-ul agentului (urgent priority) cu `reply_to` ID unic
2. Polling la 3s în inbox-ul `cli` pentru răspuns cu acel `reply_to`
3. Returnează răspunsul când apare
4. Timeout după 120s cu mesaj: "Agentul nu a răspuns în 2 minute. Verifică cu `agent_status`."

Agentul răspunde prin Telegram (notificare pe telefon) și în bus simultan. MCP-ul preia din bus — același răspuns, două canale de livrare, fără duplicate.

## Error handling

| Situație | Comportament |
|----------|-------------|
| Agent oprit | Eroare imediată: "maestro nu rulează" |
| Timeout 120s | Mesaj clar + sugestie `agent_status` |
| Bus corupt | Fallback la citire directă din fișiere |
| Agent inexistent | Eroare cu lista agenților disponibili |

## Structura fișierelor

```
cortextos/
    src/
        mcp/
            index.ts       ← entry point MCP server (stdio transport)
            tools/
                agent.ts   ← agent_send, agent_list, agent_status
                bus.ts     ← bus_inbox, bus_read_all_heartbeats, bus_list_tasks
                task.ts    ← task_list, task_approve, task_reject, task_create
                admin.ts   ← admin_logs, admin_crons, admin_restart, admin_metrics
            poller.ts      ← polling logic pentru agent_send
    dist/
        mcp/               ← build output (generat prin npm run build)
```

`tsup.config.ts` se extinde cu entry point `"mcp": "src/mcp/index.ts"`.

`package.json` primește script:
```json
"mcp": "node dist/mcp/index.js"
```

## Dependențe noi

- `@modelcontextprotocol/sdk` — SDK oficial MCP pentru Node.js
- Zero alte dependențe noi — toolurile apelează direct bus API-ul existent

## Testare

- Unit tests pentru fiecare grup de tooluri (`src/mcp/tools/*.test.ts`)
- Integration test: pornește MCP server, trimite `agent_send` la un agent mock, verifică polling
- Adăugat în `npm test` alături de testele existente
