# Slack Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adauga Slack bidirectional in CortexTOS cu paritate Telegram: fiecare agent are propriul bot Slack, configurabil din `.env`, zero modificari la codul Telegram existent.

**Architecture:** `src/slack/` oglindeste `src/telegram/` exact. `SlackPoller` foloseste Socket Mode (WebSocket, fara URL public). O noua comanda `cortextos bus send-user` ruteaza mesajele outbound catre toate canalele configurate (Telegram + Slack). `AgentManager` porneste `SlackPoller` in paralel cu `TelegramPoller` daca `SLACK_BOT_TOKEN` e prezent in `.env`.

**Tech Stack:** `@slack/web-api` (HTTP client), `@slack/socket-mode` (WebSocket listener), TypeScript strict, vitest, tsup CJS

---

## File Map

| Fisier | Operatie | Responsabilitate |
|---|---|---|
| `src/slack/api.ts` | Create | SlackAPI: sendMessage via @slack/web-api |
| `src/slack/poller.ts` | Create | SlackPoller: Socket Mode event listener |
| `src/slack/logging.ts` | Create | logInboundSlack, logOutboundSlack |
| `src/slack/index.ts` | Create | Re-exporturi |
| `src/cli/bus.ts` | Modify | Adauga comanda `send-user` |
| `src/daemon/agent-manager.ts` | Modify | Wiring SLACK_* credentials + SlackPoller |
| `src/hooks/hook-crash-alert.ts` | Modify | Trimite alerta si pe Slack |
| `package.json` | Modify | Adauga @slack/web-api + @slack/socket-mode |
| `tests/unit/slack/api.test.ts` | Create | Teste SlackAPI |
| `tests/unit/slack/poller.test.ts` | Create | Teste SlackPoller |
| `tests/unit/slack/logging.test.ts` | Create | Teste logging |
| `tests/unit/cli/send-user.test.ts` | Create | Teste comanda send-user |
| `tests/unit/hooks/crash-alert-slack.test.ts` | Create | Teste hook Slack |
| `templates/orchestrator/AGENTS.md` | Modify | Adauga send-user langa send-telegram |
| `templates/analyst/AGENTS.md` | Modify | Adauga send-user langa send-telegram |
| `templates/agent/AGENTS.md` | Modify | Adauga send-user langa send-telegram |

---

### Task 1: Dependinte + SlackAPI

**Context:** CortexTOS foloseste `tsup` (CJS build) si `vitest`. Telegram API este implementata in `src/telegram/api.ts` ca o clasa simpla ce foloseste `fetch`. Oglindim acelasi pattern pentru Slack folosind `@slack/web-api` (care ofera rate limiting si retry automat).

**Files:**
- Modify: `package.json`
- Create: `src/slack/api.ts`
- Create: `tests/unit/slack/api.test.ts`

- [ ] **Step 1: Instaleaza dependintele**

```bash
cd /path/to/cortextos
npm install @slack/web-api @slack/socket-mode
```

Expected: `package.json` actualizat cu `"@slack/web-api"` si `"@slack/socket-mode"` in `dependencies`.

- [ ] **Step 2: Scrie testul failing pentru SlackAPI.sendMessage**

Creeaza `tests/unit/slack/api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @slack/web-api inainte de import
vi.mock('@slack/web-api', () => {
  const postMessage = vi.fn();
  return {
    WebClient: vi.fn().mockImplementation(() => ({
      chat: { postMessage },
    })),
  };
});

import { SlackAPI } from '../../../src/slack/api';
import { WebClient } from '@slack/web-api';

describe('SlackAPI', () => {
  let postMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Acceseaza mock-ul creat in vi.mock
    postMessage = (new (WebClient as any)()).chat.postMessage;
  });

  it('sendMessage trimite mesaj si returneaza ts', async () => {
    postMessage.mockResolvedValueOnce({ ok: true, ts: '1234567890.123456' });
    const api = new SlackAPI('xoxb-test-token');
    const ts = await api.sendMessage('C0123456', 'Hello world');
    expect(postMessage).toHaveBeenCalledWith({ channel: 'C0123456', text: 'Hello world' });
    expect(ts).toBe('1234567890.123456');
  });

  it('sendMessage arunca eroare cand ok=false', async () => {
    postMessage.mockResolvedValueOnce({ ok: false, error: 'channel_not_found' });
    const api = new SlackAPI('xoxb-test-token');
    await expect(api.sendMessage('CINVALID', 'text')).rejects.toThrow('channel_not_found');
  });

  it('sendMessage arunca eroare la network failure', async () => {
    postMessage.mockRejectedValueOnce(new Error('network error'));
    const api = new SlackAPI('xoxb-test-token');
    await expect(api.sendMessage('C0123456', 'text')).rejects.toThrow('network error');
  });
});
```

- [ ] **Step 3: Verifica ca testul esueaza**

```bash
npx vitest run tests/unit/slack/api.test.ts
```

Expected: FAIL cu "Cannot find module '../../../src/slack/api'"

- [ ] **Step 4: Creeaza `src/slack/api.ts`**

```typescript
import { WebClient } from '@slack/web-api';

export class SlackAPI {
  private client: WebClient;

  constructor(token: string) {
    this.client = new WebClient(token);
  }

  async sendMessage(channelId: string, text: string): Promise<string> {
    const result = await this.client.chat.postMessage({ channel: channelId, text });
    if (!result.ok) {
      throw new Error(`Slack API error: ${result.error ?? 'unknown'}`);
    }
    return result.ts as string;
  }
}
```

- [ ] **Step 5: Verifica ca testele trec**

```bash
npx vitest run tests/unit/slack/api.test.ts
```

Expected: 3 tests PASS

- [ ] **Step 6: Build clean**

```bash
npm run build
```

Expected: zero erori TypeScript, `dist/` actualizat.

- [ ] **Step 7: Commit**

```bash
git add src/slack/api.ts tests/unit/slack/api.test.ts package.json package-lock.json
git commit -m "feat: add SlackAPI with sendMessage"
```

---

### Task 2: SlackPoller (Socket Mode)

**Context:** `TelegramPoller` din `src/telegram/poller.ts` face polling HTTP la `getUpdates` in bucla. Socket Mode este echivalentul Slack: o conexiune WebSocket persistenta care primeste evenimente fara a necesita URL public. `@slack/socket-mode` gestioneaza reconectarea automat. Trebuie sa ignoram mesajele de la boturi (`bot_id` prezent) ca sa evitam loop-uri.

**Files:**
- Create: `src/slack/poller.ts`
- Create: `tests/unit/slack/poller.test.ts`

- [ ] **Step 1: Scrie testul failing pentru SlackPoller**

Creeaza `tests/unit/slack/poller.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

type EventHandler = (data: { event: any; ack: () => Promise<void> }) => Promise<void>;
const registeredHandlers: Record<string, EventHandler[]> = {};
const mockStart = vi.fn().mockResolvedValue(undefined);
const mockDisconnect = vi.fn().mockResolvedValue(undefined);
const mockOn = vi.fn((event: string, handler: EventHandler) => {
  registeredHandlers[event] = registeredHandlers[event] || [];
  registeredHandlers[event].push(handler);
});

vi.mock('@slack/socket-mode', () => ({
  SocketModeClient: vi.fn().mockImplementation(() => ({
    on: mockOn,
    start: mockStart,
    disconnect: mockDisconnect,
  })),
  LogLevel: { ERROR: 'error' },
}));

import { SlackPoller } from '../../../src/slack/poller';

async function emitMessage(event: any): Promise<void> {
  const ack = vi.fn().mockResolvedValue(undefined);
  const handlers = registeredHandlers['message'] || [];
  for (const h of handlers) {
    await h({ event, ack });
  }
}

describe('SlackPoller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(registeredHandlers).forEach(k => delete registeredHandlers[k]);
  });

  it('inregistreaza handler si il apeleaza la mesaj', async () => {
    const poller = new SlackPoller('xapp-test-token');
    const handler = vi.fn();
    poller.onMessage(handler);
    await poller.start();

    await emitMessage({ type: 'message', user: 'U123', text: 'hello', channel: 'C456', ts: '123.456' });
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ user: 'U123', text: 'hello', channel: 'C456' }),
    );
  });

  it('ignora mesajele de la boturi (bot_id prezent)', async () => {
    const poller = new SlackPoller('xapp-test-token');
    const handler = vi.fn();
    poller.onMessage(handler);
    await poller.start();

    await emitMessage({ type: 'message', bot_id: 'B789', text: 'bot msg', channel: 'C456', ts: '123.456' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('continua dupa eroare de handler', async () => {
    const poller = new SlackPoller('xapp-test-token');
    const badHandler = vi.fn().mockImplementation(() => { throw new Error('handler boom'); });
    const goodHandler = vi.fn();
    poller.onMessage(badHandler);
    poller.onMessage(goodHandler);
    await poller.start();

    await emitMessage({ type: 'message', user: 'U123', text: 'hi', channel: 'C456', ts: '1.2' });
    expect(goodHandler).toHaveBeenCalled();
  });

  it('stop apeleaza disconnect', async () => {
    const poller = new SlackPoller('xapp-test-token');
    await poller.start();
    await poller.stop();
    expect(mockDisconnect).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Verifica ca testul esueaza**

```bash
npx vitest run tests/unit/slack/poller.test.ts
```

Expected: FAIL cu "Cannot find module '../../../src/slack/poller'"

- [ ] **Step 3: Creeaza `src/slack/poller.ts`**

```typescript
import { SocketModeClient, LogLevel } from '@slack/socket-mode';

export interface SlackMessageEvent {
  type: string;
  channel: string;
  user: string;
  text: string;
  ts: string;
  thread_ts?: string;
  bot_id?: string;
}

export type SlackMessageHandler = (event: SlackMessageEvent) => void;

export class SlackPoller {
  private client: SocketModeClient;
  private messageHandlers: SlackMessageHandler[] = [];
  private running = false;

  constructor(appToken: string) {
    this.client = new SocketModeClient({ appToken, logLevel: LogLevel.ERROR });
  }

  onMessage(handler: SlackMessageHandler): void {
    this.messageHandlers.push(handler);
  }

  async start(): Promise<void> {
    this.running = true;
    this.client.on('message', async ({ event, ack }: { event: SlackMessageEvent; ack: () => Promise<void> }) => {
      await ack();
      if (!this.running) return;
      if (event.bot_id) return;
      for (const handler of this.messageHandlers) {
        try {
          handler(event);
        } catch (err) {
          console.error('[slack-poller] Message handler error:', err);
        }
      }
    });
    await this.client.start();
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.client.disconnect();
  }
}
```

- [ ] **Step 4: Verifica ca testele trec**

```bash
npx vitest run tests/unit/slack/poller.test.ts
```

Expected: 4 tests PASS

- [ ] **Step 5: Build clean**

```bash
npm run build
```

Expected: zero erori TypeScript.

- [ ] **Step 6: Commit**

```bash
git add src/slack/poller.ts tests/unit/slack/poller.test.ts
git commit -m "feat: add SlackPoller with Socket Mode"
```

---

### Task 3: SlackLogging + index

**Context:** `src/telegram/logging.ts` scrie mesajele inbound/outbound in JSONL la `{ctxRoot}/logs/{agentName}/inbound-messages.jsonl` si `outbound-messages.jsonl`. Oglindim acelasi pattern pentru Slack. `src/slack/index.ts` re-exporta clasele ca `src/telegram/index.ts`.

**Files:**
- Create: `src/slack/logging.ts`
- Create: `src/slack/index.ts`
- Create: `tests/unit/slack/logging.test.ts`

- [ ] **Step 1: Scrie testul failing pentru logging**

Creeaza `tests/unit/slack/logging.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { readFileSync, existsSync } from 'fs';

describe('Slack logging', () => {
  let ctxRoot: string;

  beforeEach(() => {
    ctxRoot = join(tmpdir(), `cortextos-slack-log-test-${Date.now()}`);
    mkdirSync(join(ctxRoot, 'logs', 'testagent'), { recursive: true });
  });

  it('logInboundSlack scrie in inbound-messages.jsonl', async () => {
    const { logInboundSlack } = await import('../../../src/slack/logging');
    logInboundSlack(ctxRoot, 'testagent', {
      type: 'message', user: 'U123', text: 'hello', channel: 'C456', ts: '123.456',
    });
    const content = readFileSync(join(ctxRoot, 'logs', 'testagent', 'inbound-messages.jsonl'), 'utf-8');
    const parsed = JSON.parse(content.trim());
    expect(parsed.from_slack).toBe('U123');
    expect(parsed.text).toBe('hello');
    expect(parsed.channel).toBe('C456');
    expect(parsed.agent).toBe('testagent');
  });

  it('logOutboundSlack scrie in outbound-messages.jsonl', async () => {
    const { logOutboundSlack } = await import('../../../src/slack/logging');
    logOutboundSlack(ctxRoot, 'testagent', 'C456', 'response text', '999.111');
    const content = readFileSync(join(ctxRoot, 'logs', 'testagent', 'outbound-messages.jsonl'), 'utf-8');
    const parsed = JSON.parse(content.trim());
    expect(parsed.channel).toBe('C456');
    expect(parsed.text).toBe('response text');
    expect(parsed.ts).toBe('999.111');
    expect(parsed.agent).toBe('testagent');
  });
});
```

- [ ] **Step 2: Verifica ca testul esueaza**

```bash
npx vitest run tests/unit/slack/logging.test.ts
```

Expected: FAIL cu "Cannot find module '../../../src/slack/logging'"

- [ ] **Step 3: Creeaza `src/slack/logging.ts`**

```typescript
import { appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { SlackMessageEvent } from './poller.js';

export function logInboundSlack(
  ctxRoot: string,
  agentName: string,
  event: SlackMessageEvent,
): void {
  const logDir = join(ctxRoot, 'logs', agentName);
  mkdirSync(logDir, { recursive: true });
  const entry = JSON.stringify({
    from_slack: event.user,
    channel: event.channel,
    text: event.text,
    ts: event.ts,
    archived_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    agent: agentName,
  });
  appendFileSync(join(logDir, 'inbound-messages.jsonl'), entry + '\n', 'utf-8');
}

export function logOutboundSlack(
  ctxRoot: string,
  agentName: string,
  channelId: string,
  text: string,
  ts: string,
): void {
  const logDir = join(ctxRoot, 'logs', agentName);
  mkdirSync(logDir, { recursive: true });
  const entry = JSON.stringify({
    timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    agent: agentName,
    channel: channelId,
    text,
    ts,
  });
  appendFileSync(join(logDir, 'outbound-messages.jsonl'), entry + '\n', 'utf-8');
}
```

- [ ] **Step 4: Creeaza `src/slack/index.ts`**

```typescript
export { SlackAPI } from './api.js';
export { SlackPoller } from './poller.js';
export type { SlackMessageEvent, SlackMessageHandler } from './poller.js';
export { logInboundSlack, logOutboundSlack } from './logging.js';
```

- [ ] **Step 5: Verifica ca testele trec**

```bash
npx vitest run tests/unit/slack/logging.test.ts
```

Expected: 2 tests PASS

- [ ] **Step 6: Build clean**

```bash
npm run build
```

Expected: zero erori TypeScript.

- [ ] **Step 7: Commit**

```bash
git add src/slack/logging.ts src/slack/index.ts tests/unit/slack/logging.test.ts
git commit -m "feat: add Slack logging and index exports"
```

---

### Task 4: Comanda `cortextos bus send-user`

**Context:** `cortextos bus send-telegram $CTX_TELEGRAM_CHAT_ID "text"` este comanda curenta folosita de agenti. Noul `cortextos bus send-user "text"` nu ia chat ID ca argument — il citeste automat din `.env` al agentului (`CHAT_ID` pentru Telegram, `SLACK_CHANNEL_ID` pentru Slack). Trimite pe orice canal configurat. `send-telegram` ramane neatins pentru backward compat.

Atentie: exista deja o comanda `bus send-message` in `src/cli/bus.ts` la linia 69 — aceea e pentru mesaje agent-to-agent, nu pentru user. Noua comanda se numeste `send-user`, diferita.

**Files:**
- Modify: `src/cli/bus.ts` (adauga dupa comanda `send-telegram` de la linia ~1023)
- Create: `tests/unit/cli/send-user.test.ts`

- [ ] **Step 1: Scrie testul failing pentru send-user**

Creeaza `tests/unit/cli/send-user.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock TelegramAPI
vi.mock('../../../src/telegram/api', () => ({
  TelegramAPI: vi.fn().mockImplementation(() => ({
    sendMessage: vi.fn().mockResolvedValue({ result: { message_id: 1 } }),
    sendPhoto: vi.fn().mockResolvedValue({ result: { message_id: 2 } }),
    sendDocument: vi.fn().mockResolvedValue({ result: { message_id: 3 } }),
  })),
}));

// Mock SlackAPI
vi.mock('../../../src/slack/api', () => ({
  SlackAPI: vi.fn().mockImplementation(() => ({
    sendMessage: vi.fn().mockResolvedValue('1234567890.123456'),
  })),
}));

// Mock resolveEnv pentru a controla agentDir
let mockAgentDir = '';
vi.mock('../../../src/utils/env', () => ({
  resolveEnv: vi.fn(() => ({
    agentName: 'testagent',
    ctxRoot: join(tmpdir(), 'test-ctx'),
    agentDir: mockAgentDir,
    instanceId: 'default',
    org: 'testorg',
    frameworkRoot: join(tmpdir(), 'test-fw'),
  })),
}));

// Mock resolvePaths
vi.mock('../../../src/utils/paths', () => ({
  resolvePaths: vi.fn(() => ({ stateDir: '/tmp/state', logDir: '/tmp/logs' })),
}));

// Mock logOutboundMessage si cacheLastSent
vi.mock('../../../src/telegram/logging', () => ({
  logOutboundMessage: vi.fn(),
  cacheLastSent: vi.fn(),
}));

vi.mock('../../../src/slack/logging', () => ({
  logOutboundSlack: vi.fn(),
}));

vi.mock('../../../src/bus/event', () => ({ logEvent: vi.fn() }));

import { TelegramAPI } from '../../../src/telegram/api';
import { SlackAPI } from '../../../src/slack/api';

describe('cortextos bus send-user', () => {
  let agentDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    agentDir = join(tmpdir(), `send-user-test-${Date.now()}`);
    mockAgentDir = agentDir;
    mkdirSync(agentDir, { recursive: true });
  });

  async function runSendUser(message: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const { busCommand } = await import('../../../src/cli/bus');
    let stdout = '';
    let stderr = '';
    let exitCode = 0;
    const origLog = console.log;
    const origError = console.error;
    const origExit = process.exit;
    console.log = (s: string) => { stdout += s + '\n'; };
    console.error = (s: string) => { stderr += s + '\n'; };
    (process as any).exit = (code: number) => { exitCode = code; throw new Error(`process.exit(${code})`); };
    try {
      await busCommand.parseAsync(['node', 'cortextos', 'bus', 'send-user', message]);
    } catch { /* exit intercepted */ }
    console.log = origLog;
    console.error = origError;
    (process as any).exit = origExit;
    return { exitCode, stdout, stderr };
  }

  it('trimite pe Telegram cand doar BOT_TOKEN+CHAT_ID sunt configurate', async () => {
    writeFileSync(join(agentDir, '.env'), 'BOT_TOKEN=123:TEST\nCHAT_ID=9876\n', 'utf-8');
    const { stdout } = await runSendUser('hello');
    expect(stdout).toContain('Message sent');
    expect(TelegramAPI).toHaveBeenCalled();
    expect(SlackAPI).not.toHaveBeenCalled();
  });

  it('trimite pe Slack cand doar SLACK_BOT_TOKEN+SLACK_CHANNEL_ID sunt configurate', async () => {
    writeFileSync(join(agentDir, '.env'), 'SLACK_BOT_TOKEN=xoxb-test\nSLACK_CHANNEL_ID=C0123\n', 'utf-8');
    const { stdout } = await runSendUser('hello');
    expect(stdout).toContain('Message sent');
    expect(SlackAPI).toHaveBeenCalled();
    expect(TelegramAPI).not.toHaveBeenCalled();
  });

  it('trimite pe ambele cand ambele sunt configurate', async () => {
    writeFileSync(
      join(agentDir, '.env'),
      'BOT_TOKEN=123:TEST\nCHAT_ID=9876\nSLACK_BOT_TOKEN=xoxb-test\nSLACK_CHANNEL_ID=C0123\n',
      'utf-8',
    );
    const { stdout } = await runSendUser('hello');
    expect(stdout).toContain('Message sent');
    expect(TelegramAPI).toHaveBeenCalled();
    expect(SlackAPI).toHaveBeenCalled();
  });

  it('iese cu eroare cand niciun canal nu e configurat', async () => {
    writeFileSync(join(agentDir, '.env'), '# empty\n', 'utf-8');
    const { exitCode, stderr } = await runSendUser('hello');
    expect(exitCode).toBe(1);
    expect(stderr).toContain('No messaging channels configured');
  });
});
```

- [ ] **Step 2: Verifica ca testul esueaza**

```bash
npx vitest run tests/unit/cli/send-user.test.ts
```

Expected: FAIL (comanda `send-user` nu exista inca)

- [ ] **Step 3: Adauga import static SlackAPI la inceputul `src/cli/bus.ts`**

Dupa linia `import { TelegramAPI } from '../telegram/api.js';` (linia ~25), adauga:

```typescript
import { SlackAPI as SlackAPIClass } from '../slack/api.js';
import { logOutboundSlack } from '../slack/logging.js';
```

- [ ] **Step 3b: Adauga comanda `send-user` in `src/cli/bus.ts` dupa blocul `send-telegram` (dupa linia ~1023)**

```typescript
busCommand
  .command('send-user')
  .description('Send a message to the user via all configured channels (Telegram, Slack)')
  .argument('<message>', 'Message text')
  .option('--plain-text', 'Skip markdown formatting', false)
  .action(async (message: string, opts: { plainText?: boolean }) => {
    message = message.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
    const env = resolveEnv();
    let sent = false;
    const errors: string[] = [];

    if (env.agentDir) {
      const agentEnvFile = join(env.agentDir, '.env');
      if (existsSync(agentEnvFile)) {
        const content = readFileSync(agentEnvFile, 'utf-8');

        // Telegram
        const botToken = content.match(/^BOT_TOKEN=(.+)$/m)?.[1]?.trim();
        const chatId = content.match(/^CHAT_ID=(.+)$/m)?.[1]?.trim();
        if (botToken && chatId) {
          try {
            const api = new TelegramAPI(botToken);
            const result = await api.sendMessage(chatId, message, undefined, {
              parseMode: opts.plainText ? null : 'HTML',
            });
            const msgId = result?.result?.message_id ?? 0;
            if (env.agentName && env.ctxRoot) {
              logOutboundMessage(env.ctxRoot, env.agentName, chatId, message, msgId, {
                parseMode: opts.plainText ? 'none' : 'html',
              });
              cacheLastSent(env.ctxRoot, env.agentName, chatId, message);
              try {
                const paths = resolvePaths(env.agentName, env.instanceId, env.org);
                logEvent(paths, env.agentName, env.org, 'message', 'telegram_sent', 'info',
                  JSON.stringify({ chat_id: chatId, message_id: msgId }));
              } catch { /* non-fatal */ }
            }
            sent = true;
          } catch (err: any) {
            errors.push(`Telegram: ${err.message || err}`);
          }
        }

        // Slack
        const slackBotToken = content.match(/^SLACK_BOT_TOKEN=(.+)$/m)?.[1]?.trim();
        const slackChannelId = content.match(/^SLACK_CHANNEL_ID=(.+)$/m)?.[1]?.trim();
        if (slackBotToken && slackChannelId) {
          try {
            const slackApi = new SlackAPIClass(slackBotToken);
            const ts = await slackApi.sendMessage(slackChannelId, message);
            if (env.agentName && env.ctxRoot) {
              logOutboundSlack(env.ctxRoot, env.agentName, slackChannelId, message, ts);
            }
            sent = true;
          } catch (err: any) {
            errors.push(`Slack: ${err.message || err}`);
          }
        }
      }
    }

    if (!sent && errors.length === 0) {
      console.error('Error: No messaging channels configured. Set BOT_TOKEN+CHAT_ID (Telegram) or SLACK_BOT_TOKEN+SLACK_CHANNEL_ID (Slack) in your agent .env file.');
      process.exit(1);
    }

    if (errors.length > 0) {
      console.error(`Send error(s): ${errors.join(', ')}`);
      if (!sent) process.exit(1);
    }

    console.log('Message sent');
  });
```

Atentie: `logOutboundMessage`, `cacheLastSent`, `logEvent`, `resolvePaths`, `TelegramAPI` sunt deja importate in `bus.ts`. Adauga importul pentru `logEvent` daca lipseste (verifica la linia 9-27).

- [ ] **Step 4: Verifica ca testele trec**

```bash
npx vitest run tests/unit/cli/send-user.test.ts
```

Expected: 4 tests PASS

- [ ] **Step 5: Build clean**

```bash
npm run build
```

Expected: zero erori TypeScript.

- [ ] **Step 6: Commit**

```bash
git add src/cli/bus.ts tests/unit/cli/send-user.test.ts
git commit -m "feat: add cortextos bus send-user channel-agnostic command"
```

---

### Task 5: AgentManager Slack wiring

**Context:** `src/daemon/agent-manager.ts` porneste `TelegramPoller` la linia ~315 dupa ce citeste `BOT_TOKEN`, `CHAT_ID`, `ALLOWED_USER` din `.env`. Oglindim exact acelasi pattern pentru Slack: citim `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `SLACK_CHANNEL_ID`, `SLACK_ALLOWED_USER`, cream `SlackAPI` + `SlackPoller`, le pornim in paralel. Crash notifications se trimit si pe Slack daca e configurat.

**Files:**
- Modify: `src/daemon/agent-manager.ts`

Nota: testele de integrare pentru AgentManager sunt complexe (necesita PTY mock). Folosim testele existente ca safety net: `npm test` trebuie sa treaca dupa modificare.

- [ ] **Step 1: Adauga importurile Slack la inceputul `src/daemon/agent-manager.ts`**

Gaseste blocul de importuri si adauga dupa importurile Telegram (linia ~14):

```typescript
import { SlackAPI } from '../slack/api.js';
import { SlackPoller } from '../slack/poller.js';
import { logInboundSlack } from '../slack/logging.js';
```

- [ ] **Step 2: Extinde tipul entries din Map pentru slackPoller**

Gaseste linia ~25:
```typescript
private agents: Map<string, { process: AgentProcess; checker: FastChecker; poller?: TelegramPoller; activityPoller?: TelegramPoller }> = new Map();
```

Inlocuieste cu:
```typescript
private agents: Map<string, { process: AgentProcess; checker: FastChecker; poller?: TelegramPoller; activityPoller?: TelegramPoller; slackPoller?: SlackPoller; slackApi?: SlackAPI }> = new Map();
```

- [ ] **Step 3: Citeste credentialele Slack din .env**

In metoda `startAgent()`, dupa blocul de citire Telegram (dupa linia ~243, dupa `if (botToken && chatId) { telegramApi = ... }`), adauga:

```typescript
    // Read agent .env for Slack credentials
    let slackApi: SlackAPI | undefined;
    let slackBotToken: string | undefined;
    let slackAppToken: string | undefined;
    let slackChannelId: string | undefined;
    let slackAllowedUserId: string | undefined;

    if (existsSync(agentEnvFile)) {
      const envContent = readFileSync(agentEnvFile, 'utf-8');
      slackBotToken = envContent.match(/^SLACK_BOT_TOKEN=(.+)$/m)?.[1]?.trim();
      slackAppToken = envContent.match(/^SLACK_APP_TOKEN=(.+)$/m)?.[1]?.trim();
      slackChannelId = envContent.match(/^SLACK_CHANNEL_ID=(.+)$/m)?.[1]?.trim();
      slackAllowedUserId = envContent.match(/^SLACK_ALLOWED_USER=(.+)$/m)?.[1]?.trim();

      if (slackBotToken && !slackAllowedUserId) {
        log('SECURITY: SLACK_BOT_TOKEN is set but SLACK_ALLOWED_USER is missing. Refusing to enable Slack.');
        slackBotToken = undefined;
      }

      if (slackBotToken && slackAppToken && slackChannelId) {
        slackApi = new SlackAPI(slackBotToken);
        log(`Slack configured (channel: ****${slackChannelId.slice(-4)}, allowed_user: enabled)`);
      }
    }
```

- [ ] **Step 4: Adauga Slack la crash notifications**

Gaseste blocul de crash notifications Telegram (linia ~260-275):
```typescript
    if (telegramApi && chatId) {
      const tgApi = telegramApi;
      ...
      agentProcess.onStatusChanged((status) => {
        if (status.status === 'crashed') {
          tgApi.sendMessage(...).catch(() => {});
        ...
```

Dupa `agentProcess.onStatusChanged(...)` closure, adauga notificari Slack (inainte de `this.agents.set(...)`):

```typescript
    if (slackApi && slackChannelId) {
      const sApi = slackApi;
      const sChannelId = slackChannelId;
      agentProcess.onStatusChanged((status) => {
        if (status.status === 'crashed') {
          const crashNum = status.crashCount ?? '?';
          sApi.sendMessage(sChannelId, `Agent ${name} crashed (crash #${crashNum}) - auto-restarting`).catch(() => {});
        } else if (status.status === 'halted') {
          sApi.sendMessage(sChannelId, `Agent ${name} HALTED - exceeded crash limit. Restart manually with: cortextos start ${name}`).catch(() => {});
        }
      });
    }
```

- [ ] **Step 5: Porneste SlackPoller**

Dupa blocul `if (telegramApi && chatId && config.telegram_polling !== false) { ... }` (dupa linia ~474), adauga:

```typescript
    // Start Slack poller if credentials are available
    if (slackApi && slackAppToken && slackChannelId && config.telegram_polling !== false) {
      const slackPoller = new SlackPoller(slackAppToken);

      slackPoller.onMessage((event) => {
        if (slackAllowedUserId && event.user !== slackAllowedUserId) {
          log('Ignoring Slack message from unauthorized user (SLACK_ALLOWED_USER gate)');
          return;
        }

        logInboundSlack(this.ctxRoot, name, event);

        const from = stripControlChars(event.user);
        const text = stripControlChars(event.text || '');
        const formatted = FastChecker.formatTelegramTextMessage(from, event.channel, text, this.frameworkRoot);

        if (checker.isDuplicate(formatted)) {
          log('Duplicate Slack message suppressed');
          return;
        }
        checker.queueTelegramMessage(formatted);
      });

      slackPoller.start().catch(err => {
        log(`Slack poller error: ${err}`);
      });

      const entry = this.agents.get(name);
      if (entry) {
        entry.slackPoller = slackPoller;
        entry.slackApi = slackApi;
      }

      log('Slack poller started');
    }
```

- [ ] **Step 6: Opreste SlackPoller la stopAgent**

In `stopAgent()` (linia ~575), gaseste:
```typescript
    if (entry.poller) entry.poller.stop();
```

Imediat dupa, adauga:
```typescript
    if (entry.slackPoller) {
      entry.slackPoller.stop().catch(() => {});
      entry.slackPoller = undefined;
    }
```

- [ ] **Step 7: Build + toate testele existente**

```bash
npm run build && npm test
```

Expected: build zero erori, toate testele existente PASS (1744+ tests).

- [ ] **Step 8: Commit**

```bash
git add src/daemon/agent-manager.ts
git commit -m "feat: wire Slack poller in AgentManager alongside Telegram"
```

---

### Task 6: hook-crash-alert Slack support

**Context:** `src/hooks/hook-crash-alert.ts` la linia ~254 citeste `BOT_TOKEN` si `CHAT_ID` din `process.env` si face fetch direct la Telegram API. Adaugam Slack similar: citim `SLACK_BOT_TOKEN` si `SLACK_CHANNEL_ID` din `process.env`, trimitem via `@slack/web-api` WebClient. Env vars sunt injectate de daemon din `.env` al agentului in `process.env` cand porneste hook-ul.

**Files:**
- Modify: `src/hooks/hook-crash-alert.ts`
- Create: `tests/unit/hooks/crash-alert-slack.test.ts`

- [ ] **Step 1: Scrie testul failing**

Creeaza `tests/unit/hooks/crash-alert-slack.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockPostMessage = vi.fn().mockResolvedValue({ ok: true, ts: '123.456' });

vi.mock('@slack/web-api', () => ({
  WebClient: vi.fn().mockImplementation(() => ({
    chat: { postMessage: mockPostMessage },
  })),
}));

// Testam functia sendSlackCrashAlert exportata din hook
import { sendSlackCrashAlert } from '../../../src/hooks/hook-crash-alert';

describe('sendSlackCrashAlert', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('trimite pe Slack cand credentials sunt prezente', async () => {
    await sendSlackCrashAlert('xoxb-test', 'C0123', 'Test crash message');
    expect(mockPostMessage).toHaveBeenCalledWith({ channel: 'C0123', text: 'Test crash message' });
  });

  it('nu arunca eroare cand Slack trimite esec', async () => {
    mockPostMessage.mockRejectedValueOnce(new Error('rate_limited'));
    await expect(sendSlackCrashAlert('xoxb-test', 'C0123', 'msg')).resolves.not.toThrow();
  });

  it('nu face nimic cand slackBotToken lipseste', async () => {
    await sendSlackCrashAlert(undefined, 'C0123', 'msg');
    expect(mockPostMessage).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Verifica ca testul esueaza**

```bash
npx vitest run tests/unit/hooks/crash-alert-slack.test.ts
```

Expected: FAIL (functia `sendSlackCrashAlert` nu exista inca)

- [ ] **Step 3: Adauga import WebClient si functia `sendSlackCrashAlert` in `src/hooks/hook-crash-alert.ts`**

La inceputul fisierului, adauga importul dupa importurile existente:

```typescript
import { WebClient } from '@slack/web-api';
```

Dupa functia `notifyAgents` (dupa linia ~127), adauga:

```typescript
export async function sendSlackCrashAlert(
  slackBotToken: string | undefined,
  slackChannelId: string | undefined,
  message: string,
): Promise<void> {
  if (!slackBotToken || !slackChannelId) return;
  try {
    const client = new WebClient(slackBotToken);
    await client.chat.postMessage({ channel: slackChannelId, text: message });
  } catch { /* ignore send failures */ }
}
```

- [ ] **Step 4: Apeleaza `sendSlackCrashAlert` in `main()`**

Gaseste blocul care trimite pe Telegram (linia ~303-311):

```typescript
  if (message) {
    try {
      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
      await fetch(url, {
        ...
      });
    } catch { /* ignore send failures */ }
  }
```

Dupa acel bloc, adauga:

```typescript
  // Send Slack crash alert if configured
  const slackBotToken = process.env.SLACK_BOT_TOKEN;
  const slackChannelId = process.env.SLACK_CHANNEL_ID;
  if (message) {
    await sendSlackCrashAlert(slackBotToken, slackChannelId, message);
  }
```

- [ ] **Step 5: Verifica ca testele trec**

```bash
npx vitest run tests/unit/hooks/crash-alert-slack.test.ts
```

Expected: 3 tests PASS

- [ ] **Step 6: Build + toate testele**

```bash
npm run build && npm test
```

Expected: zero erori, toate testele PASS.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/hook-crash-alert.ts tests/unit/hooks/crash-alert-slack.test.ts
git commit -m "feat: add Slack crash alert to hook-crash-alert"
```

---

### Task 7: Actualizare template-uri AGENTS.md

**Context:** Template-urile `templates/orchestrator/AGENTS.md`, `templates/analyst/AGENTS.md`, `templates/agent/AGENTS.md` contin exemple cu `cortextos bus send-telegram`. Adaugam `send-user` ca metoda preferata pentru noii agenti, pastrand `send-telegram` pentru backward compat.

**Files:**
- Modify: `templates/orchestrator/AGENTS.md`
- Modify: `templates/analyst/AGENTS.md`
- Modify: `templates/agent/AGENTS.md`

- [ ] **Step 1: Verifica ce exista in fiecare template**

```bash
grep -n "send-telegram" templates/orchestrator/AGENTS.md templates/analyst/AGENTS.md templates/agent/AGENTS.md
```

Expected: multiple linii cu `cortextos bus send-telegram $CTX_TELEGRAM_CHAT_ID "..."`

- [ ] **Step 2: Adauga sectiunea `send-user` in `templates/orchestrator/AGENTS.md`**

Gaseste prima aparitie a `cortextos bus send-telegram` si adauga inainte sau imediat dupa un bloc de comentariu/nota:

```markdown
## Sending messages to the user

Prefer the channel-agnostic command — it routes to Telegram, Slack, or both automatically:
```bash
cortextos bus send-user "Your message here"
```

Backward-compatible alternative (Telegram only):
```bash
cortextos bus send-telegram $CTX_TELEGRAM_CHAT_ID "Your message here"
```
```

- [ ] **Step 3: Adauga aceeasi sectiune in `templates/analyst/AGENTS.md`**

Acelasi bloc ca Step 2, in acelasi context (sectiunea de messaging).

- [ ] **Step 4: Adauga aceeasi sectiune in `templates/agent/AGENTS.md`**

Acelasi bloc ca Step 2.

- [ ] **Step 5: Build final + toate testele**

```bash
npm run build && npm test
```

Expected: build zero erori, toate testele PASS.

- [ ] **Step 6: Commit final**

```bash
git add templates/orchestrator/AGENTS.md templates/analyst/AGENTS.md templates/agent/AGENTS.md
git commit -m "docs: add send-user examples to agent templates"
```

---

## Verificare finala

Dupa toate task-urile, verifica manual:

1. **Teste unit Slack** — `npx vitest run tests/unit/slack/`
2. **Test send-user** — `npx vitest run tests/unit/cli/send-user.test.ts`
3. **Test hook** — `npx vitest run tests/unit/hooks/crash-alert-slack.test.ts`
4. **Suite completa** — `npm test` (trebuie sa treaca toti)
5. **Build curat** — `npm run build`
