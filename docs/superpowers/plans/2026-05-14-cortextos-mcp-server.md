# CortexTOS MCP Server — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adaugă un MCP server local la cortextos care expune toate operațiile bus ca tooluri grupate, accesibile din Claude Code (VS Code).

**Architecture:** Server MCP stdio în `src/mcp/`, builduit cu tsup alături de CLI și daemon. Toolurile apelează direct funcțiile din `src/bus/` fără a introduce logică nouă. Polling non-distructiv pe inbox-ul `cli` pentru a correlate răspunsuri la `agent_send`.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk`, vitest, tsup, Node.js 20

---

## File Map

| Fișier | Acțiune | Responsabilitate |
|--------|---------|-----------------|
| `src/mcp/index.ts` | Create | Entry point: pornește server MCP stdio, înregistrează toate toolurile |
| `src/mcp/poller.ts` | Create | Polling non-distructiv pe inbox CLI pentru corelarea răspunsurilor |
| `src/mcp/tools/agent.ts` | Create | `agent_send`, `agent_list`, `agent_status` |
| `src/mcp/tools/bus.ts` | Create | `bus_inbox`, `bus_read_all_heartbeats`, `bus_list_tasks` |
| `src/mcp/tools/task.ts` | Create | `task_list`, `task_approve`, `task_reject`, `task_create` |
| `src/mcp/tools/admin.ts` | Create | `admin_logs`, `admin_crons`, `admin_restart`, `admin_metrics` |
| `tsup.config.ts` | Modify | Adaugă entry point `mcp/index` |
| `package.json` | Modify | Adaugă `@modelcontextprotocol/sdk` + script `mcp` |
| `tests/unit/mcp/poller.test.ts` | Create | Unit tests poller |
| `tests/unit/mcp/agent.test.ts` | Create | Unit tests agent tools |
| `tests/unit/mcp/bus.test.ts` | Create | Unit tests bus tools |
| `tests/unit/mcp/task.test.ts` | Create | Unit tests task tools |
| `tests/unit/mcp/admin.test.ts` | Create | Unit tests admin tools |

---

## Task 1: Instalează dependența și actualizează build config

**Files:**
- Modify: `package.json`
- Modify: `tsup.config.ts`

- [ ] **Step 1: Instalează SDK-ul MCP**

```bash
cd /path/to/cortextos
npm install @modelcontextprotocol/sdk
```

Verifică că apare în `package.json` la `dependencies`.

- [ ] **Step 2: Adaugă entry point în tsup.config.ts**

Deschide `tsup.config.ts` și adaugă `'mcp/index': 'src/mcp/index.ts'` în obiectul `entry`:

```typescript
entry: {
  cli: 'src/cli/index.ts',
  daemon: 'src/daemon/index.ts',
  'mcp/index': 'src/mcp/index.ts',   // <-- adaugă asta
  'hooks/hook-permission-telegram': 'src/hooks/hook-permission-telegram.ts',
  // ... restul rămâne neschimbat
},
```

- [ ] **Step 3: Adaugă script `mcp` în package.json**

În secțiunea `scripts` din `package.json`, adaugă:

```json
"mcp": "node dist/mcp/index.js"
```

- [ ] **Step 4: Verifică build**

```bash
npm run build
```

Expected: `dist/mcp/index.js` apare în output (chiar dacă fișierul sursă nu există încă, tsup va raporta eroare clară).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsup.config.ts
git commit -m "feat(mcp): add MCP SDK dependency and build entry point"
```

---

## Task 2: Poller — corelarea răspunsurilor async

**Files:**
- Create: `src/mcp/poller.ts`
- Create: `tests/unit/mcp/poller.test.ts`

Pollerul citește non-distructiv inbox-ul `cli` și caută mesaje cu `reply_to` matching ID-ul trimis.

- [ ] **Step 1: Scrie testul**

Creează `tests/unit/mcp/poller.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { pollForReply } from '../../../src/mcp/poller';

describe('pollForReply', () => {
  let testDir: string;
  let inboxDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'mcp-poller-test-'));
    inboxDir = join(testDir, 'inbox', 'cli');
    mkdirSync(inboxDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('returnează textul mesajului când găsește reply_to matching', async () => {
    const replyId = 'test-reply-123';

    // Simulează agentul care scrie răspunsul după 50ms
    setTimeout(() => {
      writeFileSync(
        join(inboxDir, '2-999-from-maestro-abc.json'),
        JSON.stringify({
          id: 'resp-1',
          from: 'maestro',
          to: 'cli',
          priority: 'normal',
          timestamp: new Date().toISOString(),
          text: 'Salut, am primit mesajul!',
          reply_to: replyId,
        }),
      );
    }, 50);

    const result = await pollForReply(inboxDir, replyId, { intervalMs: 20, timeoutMs: 500 });
    expect(result).toBe('Salut, am primit mesajul!');
  });

  it('returnează null la timeout dacă nu vine răspuns', async () => {
    const result = await pollForReply(
      join(testDir, 'inbox', 'cli'),
      'no-reply-id',
      { intervalMs: 20, timeoutMs: 100 },
    );
    expect(result).toBeNull();
  });

  it('ignoră mesaje cu reply_to diferit', async () => {
    writeFileSync(
      join(inboxDir, '2-111-from-maestro-xyz.json'),
      JSON.stringify({
        id: 'resp-2',
        from: 'maestro',
        to: 'cli',
        priority: 'normal',
        timestamp: new Date().toISOString(),
        text: 'Alt mesaj',
        reply_to: 'alt-id',
      }),
    );

    const result = await pollForReply(inboxDir, 'target-id', { intervalMs: 20, timeoutMs: 100 });
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Rulează testul să verifici că eșuează**

```bash
npx vitest run tests/unit/mcp/poller.test.ts
```

Expected: FAIL — "Cannot find module '../../../src/mcp/poller'"

- [ ] **Step 3: Implementează poller-ul**

Creează `src/mcp/poller.ts`:

```typescript
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface PollOptions {
  intervalMs?: number;
  timeoutMs?: number;
}

export async function pollForReply(
  cliInboxDir: string,
  replyToId: string,
  options: PollOptions = {},
): Promise<string | null> {
  const { intervalMs = 3000, timeoutMs = 120_000 } = options;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const text = scanInboxForReply(cliInboxDir, replyToId);
    if (text !== null) return text;
    await sleep(intervalMs);
  }

  return null;
}

function scanInboxForReply(inboxDir: string, replyToId: string): string | null {
  if (!existsSync(inboxDir)) return null;

  let files: string[];
  try {
    files = readdirSync(inboxDir).filter(f => f.endsWith('.json'));
  } catch {
    return null;
  }

  for (const file of files) {
    try {
      const raw = readFileSync(join(inboxDir, file), 'utf-8');
      const msg = JSON.parse(raw);
      if (msg.reply_to === replyToId) return msg.text as string;
    } catch {
      // fișier corupt sau în scriere — skip
    }
  }

  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

- [ ] **Step 4: Rulează testele să verifici că trec**

```bash
npx vitest run tests/unit/mcp/poller.test.ts
```

Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add src/mcp/poller.ts tests/unit/mcp/poller.test.ts
git commit -m "feat(mcp): add async reply poller"
```

---

## Task 3: Tooluri `agent_*`

**Files:**
- Create: `src/mcp/tools/agent.ts`
- Create: `tests/unit/mcp/agent.test.ts`

- [ ] **Step 1: Scrie testele**

Creează `tests/unit/mcp/agent.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runAgentTool } from '../../../src/mcp/tools/agent';

describe('agent_list', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'mcp-agent-test-'));
    process.env.CTX_ROOT = testDir;
    const configDir = join(testDir, 'config');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, 'enabled-agents.json'),
      JSON.stringify({
        maestro: { org: 'dm-brain-orchestra', enabled: true },
      }),
    );
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    delete process.env.CTX_ROOT;
  });

  it('listează agenții din enabled-agents.json', async () => {
    const result = await runAgentTool('agent_list', {}, testDir);
    expect(result).toContain('maestro');
    expect(result).toContain('dm-brain-orchestra');
  });
});

describe('agent_status', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'mcp-agent-status-test-'));
    const stateDir = join(testDir, 'state', 'maestro');
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(
      join(stateDir, 'heartbeat.json'),
      JSON.stringify({
        agent: 'maestro',
        status: 'idle',
        current_task: 'verificare inbox',
        last_heartbeat: '2026-05-14T10:00:00Z',
        mode: 'day',
      }),
    );
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('returnează heartbeat-ul agentului', async () => {
    const result = await runAgentTool('agent_status', { agent: 'maestro' }, testDir);
    expect(result).toContain('idle');
    expect(result).toContain('verificare inbox');
  });

  it('returnează eroare dacă agentul nu există', async () => {
    const result = await runAgentTool('agent_status', { agent: 'inexistent' }, testDir);
    expect(result).toContain('nu are heartbeat');
  });
});
```

- [ ] **Step 2: Rulează testele să verifici că eșuează**

```bash
npx vitest run tests/unit/mcp/agent.test.ts
```

Expected: FAIL — "Cannot find module"

- [ ] **Step 3: Implementează toolurile**

Creează `src/mcp/tools/agent.ts`:

```typescript
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { listAgents } from '../../bus/agents.js';
import { sendMessage } from '../../bus/message.js';
import { resolvePaths } from '../../utils/paths.js';
import { pollForReply } from '../poller.js';
import { randomString } from '../../utils/random.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const AGENT_TOOLS: Tool[] = [
  {
    name: 'agent_send',
    description: 'Trimite un mesaj unui agent și așteaptă răspunsul (timeout 120s). Funcționează pentru orice agent activ inclusiv maestro/orchestrator.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'Numele agentului (ex: maestro)' },
        message: { type: 'string', description: 'Mesajul de trimis' },
      },
      required: ['agent', 'message'],
    },
  },
  {
    name: 'agent_list',
    description: 'Listează toți agenții din sistem cu status (running/stopped).',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'agent_status',
    description: 'Returnează statusul detaliat al unui agent: task curent, uptime, last heartbeat.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'Numele agentului' },
      },
      required: ['agent'],
    },
  },
];

export async function runAgentTool(
  name: string,
  args: Record<string, unknown>,
  ctxRoot?: string,
): Promise<string> {
  const root = ctxRoot ?? join(homedir(), '.cortextos', 'default');

  if (name === 'agent_list') {
    const agents = listAgents(root);
    if (agents.length === 0) return 'Niciun agent configurat.';
    return agents
      .map(a => `- ${a.name} (org: ${a.org ?? '—'}, enabled: ${a.enabled ? 'da' : 'nu'})`)
      .join('\n');
  }

  if (name === 'agent_status') {
    const agentName = args.agent as string;
    const heartbeatPath = join(root, 'state', agentName, 'heartbeat.json');
    if (!existsSync(heartbeatPath)) {
      return `Agentul "${agentName}" nu are heartbeat — poate nu rulează.`;
    }
    const hb = JSON.parse(readFileSync(heartbeatPath, 'utf-8'));
    return [
      `Agent: ${hb.agent}`,
      `Status: ${hb.status}`,
      `Task curent: ${hb.current_task || '—'}`,
      `Mod: ${hb.mode}`,
      `Ultimul heartbeat: ${hb.last_heartbeat}`,
    ].join('\n');
  }

  if (name === 'agent_send') {
    const agentName = args.agent as string;
    const message = args.message as string;
    const replyId = `mcp-${randomString(8)}`;
    const agentPaths = resolvePaths(agentName, 'default');

    sendMessage(agentPaths, 'cli', agentName, 'urgent', message, replyId);

    const cliInboxDir = join(root, 'inbox', 'cli');
    const reply = await pollForReply(cliInboxDir, replyId);

    if (reply === null) {
      return `Agentul "${agentName}" nu a răspuns în 120 de secunde. Verifică statusul cu agent_status.`;
    }
    return reply;
  }

  return `Tool necunoscut: ${name}`;
}
```

- [ ] **Step 4: Rulează testele**

```bash
npx vitest run tests/unit/mcp/agent.test.ts
```

Expected: 3 passed (agent_list, agent_status ok, agent_status eroare)

- [ ] **Step 5: Commit**

```bash
git add src/mcp/tools/agent.ts tests/unit/mcp/agent.test.ts
git commit -m "feat(mcp): add agent_* tools"
```

---

## Task 4: Tooluri `bus_*`

**Files:**
- Create: `src/mcp/tools/bus.ts`
- Create: `tests/unit/mcp/bus.test.ts`

- [ ] **Step 1: Scrie testele**

Creează `tests/unit/mcp/bus.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runBusTool } from '../../../src/mcp/tools/bus';

describe('bus_inbox', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'mcp-bus-test-'));
    const inboxDir = join(testDir, 'inbox', 'maestro');
    mkdirSync(inboxDir, { recursive: true });
    writeFileSync(
      join(inboxDir, '1-111-from-cli-abc.json'),
      JSON.stringify({
        id: 'msg-1',
        from: 'cli',
        to: 'maestro',
        priority: 'urgent',
        timestamp: '2026-05-14T10:00:00Z',
        text: 'Ce faci?',
        reply_to: null,
      }),
    );
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('listează mesajele din inbox', async () => {
    const result = await runBusTool('bus_inbox', { agent: 'maestro' }, testDir);
    expect(result).toContain('Ce faci?');
    expect(result).toContain('cli');
  });

  it('returnează mesaj clar dacă inbox-ul e gol', async () => {
    const result = await runBusTool('bus_inbox', { agent: 'analyst' }, testDir);
    expect(result).toContain('gol');
  });
});

describe('bus_read_all_heartbeats', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'mcp-hb-test-'));
    const stateDir = join(testDir, 'state', 'maestro');
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(
      join(stateDir, 'heartbeat.json'),
      JSON.stringify({ agent: 'maestro', status: 'idle', current_task: '', last_heartbeat: '2026-05-14T10:00:00Z', mode: 'day' }),
    );
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('returnează heartbeat-urile tuturor agenților', async () => {
    const result = await runBusTool('bus_read_all_heartbeats', {}, testDir);
    expect(result).toContain('maestro');
    expect(result).toContain('idle');
  });
});
```

- [ ] **Step 2: Rulează testele să verifici că eșuează**

```bash
npx vitest run tests/unit/mcp/bus.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implementează toolurile**

Creează `src/mcp/tools/bus.ts`:

```typescript
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const BUS_TOOLS: Tool[] = [
  {
    name: 'bus_inbox',
    description: 'Citește inbox-ul unui agent (mesaje neprocesate). Util pentru a vedea ce mesaje așteaptă procesare.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'Numele agentului' },
      },
      required: ['agent'],
    },
  },
  {
    name: 'bus_read_all_heartbeats',
    description: 'Returnează heartbeat-urile tuturor agenților activi — status, task curent, last ping.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'bus_list_tasks',
    description: 'Listează task-urile brute din fișierele bus (neprocesate). Pentru debug și inspecție sub capotă.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'Filtrează după agent (opțional)' },
      },
      required: [],
    },
  },
];

export async function runBusTool(
  name: string,
  args: Record<string, unknown>,
  ctxRoot?: string,
): Promise<string> {
  const root = ctxRoot ?? join(homedir(), '.cortextos', 'default');

  if (name === 'bus_inbox') {
    const agentName = args.agent as string;
    const inboxDir = join(root, 'inbox', agentName);
    if (!existsSync(inboxDir)) return `Inbox-ul agentului "${agentName}" e gol sau nu există.`;

    const files = readdirSync(inboxDir).filter(f => f.endsWith('.json'));
    if (files.length === 0) return `Inbox "${agentName}" e gol.`;

    return files.map(f => {
      try {
        const msg = JSON.parse(readFileSync(join(inboxDir, f), 'utf-8'));
        return `[${msg.priority}] de la ${msg.from} @ ${msg.timestamp}:\n${msg.text}`;
      } catch {
        return `(fișier corupt: ${f})`;
      }
    }).join('\n\n');
  }

  if (name === 'bus_read_all_heartbeats') {
    const stateDir = join(root, 'state');
    if (!existsSync(stateDir)) return 'Niciun agent nu a scris heartbeat.';

    const agents = readdirSync(stateDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);

    if (agents.length === 0) return 'Niciun heartbeat disponibil.';

    return agents.map(agent => {
      const hbPath = join(stateDir, agent, 'heartbeat.json');
      if (!existsSync(hbPath)) return `${agent}: fără heartbeat`;
      try {
        const hb = JSON.parse(readFileSync(hbPath, 'utf-8'));
        return `${agent}: ${hb.status} | task: ${hb.current_task || '—'} | ${hb.last_heartbeat}`;
      } catch {
        return `${agent}: heartbeat corupt`;
      }
    }).join('\n');
  }

  if (name === 'bus_list_tasks') {
    const agent = args.agent as string | undefined;
    const orgsDir = join(root, 'orgs');
    if (!existsSync(orgsDir)) return 'Niciun task în bus.';

    const results: string[] = [];
    for (const org of readdirSync(orgsDir)) {
      const taskDir = join(orgsDir, org, 'tasks');
      if (!existsSync(taskDir)) continue;
      for (const file of readdirSync(taskDir).filter(f => f.endsWith('.json'))) {
        try {
          const task = JSON.parse(readFileSync(join(taskDir, file), 'utf-8'));
          if (agent && task.agent !== agent) continue;
          results.push(`[${task.status}] ${task.title} — agent: ${task.agent ?? '—'}`);
        } catch {
          results.push(`(task corupt: ${file})`);
        }
      }
    }

    return results.length > 0 ? results.join('\n') : 'Niciun task în bus.';
  }

  return `Tool necunoscut: ${name}`;
}
```

- [ ] **Step 4: Rulează testele**

```bash
npx vitest run tests/unit/mcp/bus.test.ts
```

Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add src/mcp/tools/bus.ts tests/unit/mcp/bus.test.ts
git commit -m "feat(mcp): add bus_* tools"
```

---

## Task 5: Tooluri `task_*`

**Files:**
- Create: `src/mcp/tools/task.ts`
- Create: `tests/unit/mcp/task.test.ts`

- [ ] **Step 1: Verifică funcțiile disponibile în `src/bus/task.ts`**

```bash
grep "^export function" src/bus/task.ts
```

Notează semnăturile funcțiilor de task management disponibile.

- [ ] **Step 2: Scrie testele**

Creează `tests/unit/mcp/task.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runTaskTool } from '../../../src/mcp/tools/task';

describe('task_list', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'mcp-task-test-'));
    const taskDir = join(testDir, 'orgs', 'dm-brain-orchestra', 'tasks');
    mkdirSync(taskDir, { recursive: true });
    writeFileSync(
      join(taskDir, 'task_111.json'),
      JSON.stringify({ id: 'task_111', title: 'Analizează raportul', status: 'pending', agent: 'maestro', created_at: '2026-05-14T09:00:00Z' }),
    );
    writeFileSync(
      join(taskDir, 'task_222.json'),
      JSON.stringify({ id: 'task_222', title: 'Publică newsletter', status: 'completed', agent: 'maestro', created_at: '2026-05-14T08:00:00Z' }),
    );
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('listează toate task-urile', async () => {
    const result = await runTaskTool('task_list', {}, testDir);
    expect(result).toContain('Analizează raportul');
    expect(result).toContain('Publică newsletter');
  });

  it('filtrează după status', async () => {
    const result = await runTaskTool('task_list', { status: 'pending' }, testDir);
    expect(result).toContain('Analizează raportul');
    expect(result).not.toContain('Publică newsletter');
  });
});
```

- [ ] **Step 3: Rulează testele să verifici că eșuează**

```bash
npx vitest run tests/unit/mcp/task.test.ts
```

Expected: FAIL

- [ ] **Step 4: Implementează toolurile**

Creează `src/mcp/tools/task.ts`:

```typescript
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { atomicWriteSync } from '../../utils/atomic.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const TASK_TOOLS: Tool[] = [
  {
    name: 'task_list',
    description: 'Listează task-urile din sistem cu filtre opționale.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filtrează după status: pending, in_progress, completed, blocked, cancelled' },
        agent: { type: 'string', description: 'Filtrează după agent' },
      },
      required: [],
    },
  },
  {
    name: 'task_approve',
    description: 'Aprobă un task pending.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'ID-ul task-ului' },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'task_reject',
    description: 'Respinge un task pending cu motiv opțional.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'ID-ul task-ului' },
        reason: { type: 'string', description: 'Motivul respingerii (opțional)' },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'task_create',
    description: 'Creează un task nou pentru un agent.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'Agentul care primește task-ul' },
        title: { type: 'string', description: 'Titlul task-ului' },
        description: { type: 'string', description: 'Descrierea detaliată' },
      },
      required: ['agent', 'title', 'description'],
    },
  },
];

function findTaskFile(root: string, taskId: string): { path: string; data: Record<string, unknown> } | null {
  const orgsDir = join(root, 'orgs');
  if (!existsSync(orgsDir)) return null;
  for (const org of readdirSync(orgsDir)) {
    const taskPath = join(orgsDir, org, 'tasks', `${taskId}.json`);
    if (existsSync(taskPath)) {
      try {
        return { path: taskPath, data: JSON.parse(readFileSync(taskPath, 'utf-8')) };
      } catch {
        return null;
      }
    }
  }
  return null;
}

export async function runTaskTool(
  name: string,
  args: Record<string, unknown>,
  ctxRoot?: string,
): Promise<string> {
  const root = ctxRoot ?? join(homedir(), '.cortextos', 'default');

  if (name === 'task_list') {
    const statusFilter = args.status as string | undefined;
    const agentFilter = args.agent as string | undefined;
    const orgsDir = join(root, 'orgs');
    if (!existsSync(orgsDir)) return 'Niciun task găsit.';

    const results: string[] = [];
    for (const org of readdirSync(orgsDir)) {
      const taskDir = join(orgsDir, org, 'tasks');
      if (!existsSync(taskDir)) continue;
      for (const file of readdirSync(taskDir).filter(f => f.endsWith('.json'))) {
        try {
          const task = JSON.parse(readFileSync(join(taskDir, file), 'utf-8'));
          if (statusFilter && task.status !== statusFilter) continue;
          if (agentFilter && task.agent !== agentFilter) continue;
          results.push(`[${task.status}] ${task.id}: ${task.title} (agent: ${task.agent ?? '—'})`);
        } catch { /* skip */ }
      }
    }
    return results.length > 0 ? results.join('\n') : 'Niciun task găsit cu aceste filtre.';
  }

  if (name === 'task_approve') {
    const taskId = args.task_id as string;
    const found = findTaskFile(root, taskId);
    if (!found) return `Task-ul "${taskId}" nu a fost găsit.`;
    const updated = { ...found.data, status: 'in_progress', approved_at: new Date().toISOString() };
    atomicWriteSync(found.path, JSON.stringify(updated));
    return `Task-ul "${taskId}" a fost aprobat.`;
  }

  if (name === 'task_reject') {
    const taskId = args.task_id as string;
    const reason = (args.reason as string) ?? '';
    const found = findTaskFile(root, taskId);
    if (!found) return `Task-ul "${taskId}" nu a fost găsit.`;
    const updated = { ...found.data, status: 'cancelled', rejected_at: new Date().toISOString(), reject_reason: reason };
    atomicWriteSync(found.path, JSON.stringify(updated));
    return `Task-ul "${taskId}" a fost respins${reason ? `: ${reason}` : ''}.`;
  }

  if (name === 'task_create') {
    const agent = args.agent as string;
    const title = args.title as string;
    const description = args.description as string;
    const id = `task_${Date.now()}`;

    // Caută org-ul agentului
    const configPath = join(root, 'config', 'enabled-agents.json');
    let org = 'default';
    if (existsSync(configPath)) {
      try {
        const agents = JSON.parse(readFileSync(configPath, 'utf-8'));
        if (agents[agent]?.org) org = agents[agent].org;
      } catch { /* fallback la default */ }
    }

    const taskDir = join(root, 'orgs', org, 'tasks');
    const task = { id, title, description, agent, status: 'pending', created_at: new Date().toISOString() };
    atomicWriteSync(join(taskDir, `${id}.json`), JSON.stringify(task));
    return `Task creat: ${id} — "${title}" pentru ${agent}.`;
  }

  return `Tool necunoscut: ${name}`;
}
```

- [ ] **Step 5: Rulează testele**

```bash
npx vitest run tests/unit/mcp/task.test.ts
```

Expected: 2 passed

- [ ] **Step 6: Commit**

```bash
git add src/mcp/tools/task.ts tests/unit/mcp/task.test.ts
git commit -m "feat(mcp): add task_* tools"
```

---

## Task 6: Tooluri `admin_*`

**Files:**
- Create: `src/mcp/tools/admin.ts`
- Create: `tests/unit/mcp/admin.test.ts`

- [ ] **Step 1: Verifică ce expune `src/bus/crons.ts`**

```bash
grep "^export function" src/bus/crons.ts | head -10
```

Notează funcțiile disponibile pentru citirea cronogramelor.

- [ ] **Step 2: Scrie testele**

Creează `tests/unit/mcp/admin.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runAdminTool } from '../../../src/mcp/tools/admin';

describe('admin_crons', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'mcp-admin-test-'));
    process.env.CTX_FRAMEWORK_ROOT = testDir;
    const agentDir = join(testDir, 'orgs', 'dm-brain-orchestra', 'agents', 'maestro');
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(
      join(agentDir, 'config.json'),
      JSON.stringify({
        crons: [
          { name: 'heartbeat', type: 'recurring', interval: '4h', prompt: 'Update heartbeat' },
          { name: 'morning-review', type: 'recurring', cron: '0 8 * * *', prompt: 'Morning review' },
        ],
      }),
    );
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    delete process.env.CTX_FRAMEWORK_ROOT;
  });

  it('returnează cronogramele agentului', async () => {
    const result = await runAdminTool('admin_crons', { agent: 'maestro' }, testDir);
    expect(result).toContain('heartbeat');
    expect(result).toContain('morning-review');
  });
});
```

- [ ] **Step 3: Rulează testul să verifici că eșuează**

```bash
npx vitest run tests/unit/mcp/admin.test.ts
```

Expected: FAIL

- [ ] **Step 4: Implementează toolurile**

Creează `src/mcp/tools/admin.ts`:

```typescript
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { spawnSync } from 'child_process';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const ADMIN_TOOLS: Tool[] = [
  {
    name: 'admin_logs',
    description: 'Citește ultimele N linii din PM2 logs ale unui agent (default 50).',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'Numele agentului' },
        lines: { type: 'number', description: 'Numărul de linii (default 50)' },
      },
      required: ['agent'],
    },
  },
  {
    name: 'admin_crons',
    description: 'Listează cronogramele unui agent (ce rulează, la ce interval).',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'Numele agentului' },
      },
      required: ['agent'],
    },
  },
  {
    name: 'admin_restart',
    description: 'Restartează un agent (stop + start). Recitește config.json și .env.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'Numele agentului' },
      },
      required: ['agent'],
    },
  },
  {
    name: 'admin_metrics',
    description: 'Returnează metrici: uptime, număr mesaje procesate, cost sesiune.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'Agentul specific (opțional, fără = toți agenții)' },
      },
      required: [],
    },
  },
];

function findCliPath(): string {
  const frameworkRoot = process.env.CTX_FRAMEWORK_ROOT ?? process.cwd();
  return join(frameworkRoot, 'dist', 'cli.js');
}

function findAgentConfigPath(frameworkRoot: string, agentName: string): string | null {
  const orgsDir = join(frameworkRoot, 'orgs');
  if (!existsSync(orgsDir)) return null;
  for (const org of readdirSync(orgsDir)) {
    const configPath = join(orgsDir, org, 'agents', agentName, 'config.json');
    if (existsSync(configPath)) return configPath;
  }
  return null;
}

export async function runAdminTool(
  name: string,
  args: Record<string, unknown>,
  ctxRoot?: string,
): Promise<string> {
  const root = ctxRoot ?? join(homedir(), '.cortextos', 'default');
  const frameworkRoot = process.env.CTX_FRAMEWORK_ROOT ?? process.cwd();

  if (name === 'admin_logs') {
    const agent = args.agent as string;
    const lines = (args.lines as number) ?? 50;
    const result = spawnSync('pm2', ['logs', agent, '--lines', String(lines), '--nostream'], {
      encoding: 'utf-8',
    });
    if (result.error) return `Nu s-au putut citi logurile (pm2 indisponibil): ${result.error.message}`;
    return result.stdout || result.stderr || 'Niciun log disponibil.';
  }

  if (name === 'admin_crons') {
    const agent = args.agent as string;
    const configPath = findAgentConfigPath(frameworkRoot, agent);
    if (!configPath) return `Config-ul agentului "${agent}" nu a fost găsit.`;
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      const crons: Array<{ name: string; type: string; interval?: string; cron?: string }> = config.crons ?? [];
      if (crons.length === 0) return `Agentul "${agent}" nu are cronograme configurate.`;
      return crons.map(c => {
        const schedule = c.interval ? `la fiecare ${c.interval}` : (c.cron ?? 'schedule necunoscut');
        return `- ${c.name}: ${schedule}`;
      }).join('\n');
    } catch {
      return `Config-ul agentului "${agent}" este corupt.`;
    }
  }

  if (name === 'admin_restart') {
    const agent = args.agent as string;
    const cliPath = findCliPath();
    const result = spawnSync(process.execPath, [cliPath, 'restart', agent], { encoding: 'utf-8' });
    if (result.status !== 0) return `Restart eșuat: ${result.stderr || 'eroare necunoscută'}`;
    return `Agentul "${agent}" a fost restartat.`;
  }

  if (name === 'admin_metrics') {
    const agent = args.agent as string | undefined;
    const stateDir = join(root, 'state');
    if (!existsSync(stateDir)) return 'Nicio metrică disponibilă.';

    const agents = agent
      ? [agent]
      : readdirSync(stateDir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name);

    return agents.map(a => {
      const hbPath = join(stateDir, a, 'heartbeat.json');
      if (!existsSync(hbPath)) return `${a}: fără date`;
      try {
        const hb = JSON.parse(readFileSync(hbPath, 'utf-8'));
        return `${a}: status=${hb.status} | mod=${hb.mode} | ultimul ping=${hb.last_heartbeat}`;
      } catch {
        return `${a}: date corupte`;
      }
    }).join('\n');
  }

  return `Tool necunoscut: ${name}`;
}
```

- [ ] **Step 5: Rulează testele**

```bash
npx vitest run tests/unit/mcp/admin.test.ts
```

Expected: 1 passed

- [ ] **Step 6: Commit**

```bash
git add src/mcp/tools/admin.ts tests/unit/mcp/admin.test.ts
git commit -m "feat(mcp): add admin_* tools"
```

---

## Task 7: Entry point MCP server

**Files:**
- Create: `src/mcp/index.ts`

- [ ] **Step 1: Implementează serverul**

Creează `src/mcp/index.ts`:

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { AGENT_TOOLS, runAgentTool } from './tools/agent.js';
import { BUS_TOOLS, runBusTool } from './tools/bus.js';
import { TASK_TOOLS, runTaskTool } from './tools/task.js';
import { ADMIN_TOOLS, runAdminTool } from './tools/admin.js';

const ALL_TOOLS = [...AGENT_TOOLS, ...BUS_TOOLS, ...TASK_TOOLS, ...ADMIN_TOOLS];

const server = new Server(
  { name: 'cortextos', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: ALL_TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  let text: string;
  try {
    if (name.startsWith('agent_')) text = await runAgentTool(name, args as Record<string, unknown>);
    else if (name.startsWith('bus_')) text = await runBusTool(name, args as Record<string, unknown>);
    else if (name.startsWith('task_')) text = await runTaskTool(name, args as Record<string, unknown>);
    else if (name.startsWith('admin_')) text = await runAdminTool(name, args as Record<string, unknown>);
    else text = `Tool necunoscut: ${name}`;
  } catch (err) {
    text = `Eroare la ${name}: ${err instanceof Error ? err.message : String(err)}`;
  }

  return { content: [{ type: 'text', text }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: `dist/mcp/index.js` apare în output fără erori TypeScript.

- [ ] **Step 3: Test smoke rapid**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node dist/mcp/index.js
```

Expected: JSON cu lista de 14 tooluri.

- [ ] **Step 4: Commit**

```bash
git add src/mcp/index.ts
git commit -m "feat(mcp): add MCP server entry point with all 14 tools"
```

---

## Task 8: Înregistrare în settings.json + documentație

**Files:**
- Modify: `~/.claude/settings.json`
- Modify: `README.md` (secțiune nouă)

- [ ] **Step 1: Adaugă MCP server în settings.json**

Deschide `~/.claude/settings.json` și adaugă în `mcpServers`:

```json
"cortextos": {
  "command": "node",
  "args": ["ABSOLUTE_PATH/cortextos/dist/mcp/index.js"],
  "env": {}
}
```

Înlocuiește `ABSOLUTE_PATH` cu calea reală (ex: `/Users/danmitrut`).

- [ ] **Step 2: Restartează Claude Code**

Închide și redeschide VS Code sau reîncarcă fereastra (`Cmd+Shift+P` → "Reload Window").

- [ ] **Step 3: Verifică toolurile disponibile**

În Claude Code, scrie:
```
Ce tooluri cortextos ai disponibile?
```

Expected: Claude listează cele 14 tooluri MCP.

- [ ] **Step 4: Smoke test complet**

```
agent_list
```
Expected: listează maestro.

```
agent_status cu agent=maestro
```
Expected: statusul curent al lui maestro.

- [ ] **Step 5: Adaugă secțiune în README.md**

La finalul `README.md`, adaugă:

```markdown
## Claude Code Integration (MCP)

To use cortextos tools directly in Claude Code (VS Code):

1. Build the project: `npm run build`
2. Add to `~/.claude/settings.json`:

\`\`\`json
"mcpServers": {
  "cortextos": {
    "command": "node",
    "args": ["/absolute/path/to/cortextos/dist/mcp/index.js"]
  }
}
\`\`\`

3. Reload VS Code window.

Available tools: `agent_send`, `agent_list`, `agent_status`, `bus_inbox`, `bus_read_all_heartbeats`, `bus_list_tasks`, `task_list`, `task_approve`, `task_reject`, `task_create`, `admin_logs`, `admin_crons`, `admin_restart`, `admin_metrics`.
```

- [ ] **Step 6: Commit final**

```bash
git add README.md
git commit -m "docs: add MCP server setup instructions to README"
```

- [ ] **Step 7: Push la origin**

```bash
git checkout main
git merge security/external-surface-hardening
git push origin main
```
