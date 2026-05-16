# Slack Media Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring Slack inbound media to parity with Telegram so agents can see images, documents, audio, voice (with transcription), and video uploaded in Slack.

**Architecture:** A new `src/slack/media.ts` mirrors `src/telegram/media.ts` (the codebase keeps `telegram/` and `slack/` modules parallel and separate). Slack delivers files in an `event.files[]` array; `processSlackMedia` maps each file's mimetype to a category, downloads it with a bearer-auth header, and saves it locally. `agent-manager.ts` injects one `local_file:` message per file using new Slack format functions, after the existing allowed-user/channel security gate.

**Tech Stack:** TypeScript (strict), Node 20 `fetch`, `@slack/web-api`, `@slack/socket-mode`, vitest, whisper.cpp (reused via `src/telegram/transcribe.ts`).

**Spec:** `docs/superpowers/specs/2026-05-16-slack-media-support-design.md`

**Constraints:**
- No em dash anywhere in code or strings.
- No new runtime dependencies.
- The `SLACK_ALLOWED_USER` fail-closed gate must remain intact; downloads happen only after the gate passes.
- Tests run with `npx vitest run <path>`. Full suite: `npm test`. Build: `npm run build`.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `src/slack/poller.ts` | `SlackFile` interface, `SlackMessageEvent.files/subtype`, `fetchHistory` passes files | Modify |
| `src/slack/api.ts` | `SlackAPI.downloadFile(url)` with bearer auth | Modify |
| `src/telegram/transcribe.ts` | Generalize WAV path derivation (shared, additive) | Modify |
| `src/slack/media.ts` | `processSlackMedia`, `ProcessedSlackMedia`, mimetype mapping | Create |
| `src/slack/index.ts` | Export new media symbols + `SlackFile` | Modify |
| `src/daemon/fast-checker.ts` | `formatSlack{Photo,Document,Voice,Video}Message` | Modify |
| `src/daemon/agent-manager.ts` | Wire `processSlackMedia` into Slack live + catch-up | Modify |
| `tests/unit/slack/poller.test.ts` | Test files-only history message survives filter | Modify |
| `tests/unit/slack/api.test.ts` | Test `downloadFile` auth + error | Modify |
| `tests/unit/slack/media.test.ts` | Test mimetype mapping, multi-file, failure | Create |
| `tests/unit/daemon/slack-format.test.ts` | Test the 4 Slack format functions | Create |
| `/Users/danmitrut/Desktop/Brain Orchestra/SLACK-SETUP.md` | Document `files:read` scope | Modify |

---

## Task 1: Slack file types + poller event extension + history filter

**Files:**
- Modify: `src/slack/poller.ts`
- Modify: `src/slack/index.ts`
- Test: `tests/unit/slack/poller.test.ts`

- [ ] **Step 1: Write the failing test**

Add this test to `tests/unit/slack/poller.test.ts` (append inside the existing top-level `describe` for the poller, or add a new `describe` block at the end of the file):

```typescript
describe('fetchHistory with files', () => {
  it('keeps a message that has files but no text', async () => {
    const historyMock = vi.fn().mockResolvedValue({
      messages: [
        {
          type: 'message',
          subtype: 'file_share',
          user: 'U123',
          text: '',
          ts: '1700000000.000100',
          files: [
            {
              id: 'F1',
              name: 'cat.jpg',
              mimetype: 'image/jpeg',
              filetype: 'jpg',
              url_private_download: 'https://files.slack.com/cat.jpg',
              size: 1234,
            },
          ],
        },
      ],
    });
    const poller = new SlackPoller('xapp-test', 'xoxb-test');
    // Replace the internal WebClient's conversations.history with our mock.
    (poller as unknown as { webClient: { conversations: { history: unknown } } })
      .webClient.conversations.history = historyMock;

    const events = await poller.fetchHistory('C0123456', 1699999999);

    expect(events).toHaveLength(1);
    expect(events[0].files).toHaveLength(1);
    expect(events[0].files?.[0].mimetype).toBe('image/jpeg');
    expect(events[0].text).toBe('');
  });
});
```

If `tests/unit/slack/poller.test.ts` does not already import `SlackPoller` and `vi`, add at the top:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { SlackPoller } from '../../../src/slack/poller';
```

(Only add imports that are missing; do not duplicate existing imports.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/slack/poller.test.ts`
Expected: FAIL. The current `fetchHistory` filter requires `m.text`, so the files-only message is dropped and `events` has length 0 (or `events[0].files` is undefined).

- [ ] **Step 3: Implement the poller changes**

In `src/slack/poller.ts`, add the `SlackFile` interface and extend `SlackMessageEvent` (replace the existing `SlackMessageEvent` interface block at the top of the file):

```typescript
export interface SlackFile {
  id: string;
  name?: string;
  mimetype?: string;
  filetype?: string;
  url_private_download?: string;
  url_private?: string;
  size?: number;
}

export interface SlackMessageEvent {
  type: string;
  subtype?: string;
  channel: string;
  user?: string;
  text: string;
  ts: string;
  thread_ts?: string;
  bot_id?: string;
  files?: SlackFile[];
}
```

Replace the `fetchHistory` method body with this version (the `RawMsg` type gains `subtype`/`files`, the filter accepts text OR files, and files are mapped through):

```typescript
  async fetchHistory(channelId: string, oldestUnixSeconds: number): Promise<SlackMessageEvent[]> {
    const result = await this.webClient.conversations.history({
      channel: channelId,
      oldest: String(oldestUnixSeconds),
      limit: 20,
    });
    type RawMsg = {
      type?: string;
      subtype?: string;
      user?: string;
      text?: string;
      ts?: string;
      thread_ts?: string;
      bot_id?: string;
      files?: SlackFile[];
    };
    const messages = (result.messages ?? []) as RawMsg[];
    return messages
      .filter(m => m.user && !m.bot_id && m.ts && (m.text || (m.files && m.files.length > 0)))
      .map(m => ({
        type: m.type ?? 'message',
        subtype: m.subtype,
        channel: channelId,
        user: m.user,
        text: m.text ?? '',
        ts: m.ts ?? '',
        thread_ts: m.thread_ts,
        bot_id: m.bot_id,
        files: m.files,
      }))
      .reverse(); // Slack returneaza newest-first; noi vrem oldest-first
  }
```

In `src/slack/index.ts`, extend the type export line. Replace:

```typescript
export type { SlackMessageEvent, SlackMessageHandler } from './poller.js';
```

with:

```typescript
export type { SlackMessageEvent, SlackMessageHandler, SlackFile } from './poller.js';
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/slack/poller.test.ts`
Expected: PASS (all existing poller tests plus the new one).

- [ ] **Step 5: Commit**

```bash
git add src/slack/poller.ts src/slack/index.ts tests/unit/slack/poller.test.ts
git commit -m "feat(slack): carry file attachments through poller events and history"
```

---

## Task 2: SlackAPI.downloadFile with bearer auth

**Files:**
- Modify: `src/slack/api.ts`
- Test: `tests/unit/slack/api.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/slack/api.test.ts` (inside the existing `describe('SlackAPI', ...)` block):

```typescript
  it('downloadFile fetcheaza cu header de auth si returneaza Buffer', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode('file-bytes').buffer,
    });
    vi.stubGlobal('fetch', fetchMock);

    const api = new SlackAPI('xoxb-test-token');
    const buf = await api.downloadFile('https://files.slack.com/x.jpg');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://files.slack.com/x.jpg',
      expect.objectContaining({
        headers: { Authorization: 'Bearer xoxb-test-token' },
      }),
    );
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.toString()).toBe('file-bytes');
    vi.unstubAllGlobals();
  });

  it('downloadFile arunca eroare cand raspunsul nu e ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    vi.stubGlobal('fetch', fetchMock);

    const api = new SlackAPI('xoxb-test-token');
    await expect(api.downloadFile('https://files.slack.com/x.jpg')).rejects.toThrow('403');
    vi.unstubAllGlobals();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/slack/api.test.ts`
Expected: FAIL with "api.downloadFile is not a function".

- [ ] **Step 3: Implement downloadFile**

Replace the full contents of `src/slack/api.ts` with:

```typescript
import { WebClient } from '@slack/web-api';

export class SlackAPI {
  private client: WebClient;
  private token: string;

  constructor(token: string) {
    this.client = new WebClient(token);
    this.token = token;
  }

  /**
   * Post a text message to a Slack channel.
   * Returns the message timestamp (ts) which uniquely identifies the message.
   */
  async sendMessage(channelId: string, text: string): Promise<string> {
    const result = await this.client.chat.postMessage({ channel: channelId, text });
    if (!result.ok) {
      throw new Error(`Slack API error: ${result.error ?? 'unknown'}`);
    }
    if (!result.ts) {
      throw new Error('Slack API error: missing ts in response');
    }
    return result.ts;
  }

  /**
   * Download a Slack-hosted file. Slack private file URLs require the bot
   * token as a bearer header; without it Slack returns an HTML login page
   * instead of the file bytes. Throws on a non-OK HTTP status so the caller
   * can skip that one file and continue with the rest.
   */
  async downloadFile(url: string): Promise<Buffer> {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.token}` },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      throw new Error(`Failed to download Slack file: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/slack/api.test.ts`
Expected: PASS (existing `sendMessage` tests plus the two new `downloadFile` tests).

- [ ] **Step 5: Commit**

```bash
git add src/slack/api.ts tests/unit/slack/api.test.ts
git commit -m "feat(slack): add SlackAPI.downloadFile with bearer auth"
```

---

## Task 3: Generalize transcribe.ts WAV path derivation

**Files:**
- Modify: `src/telegram/transcribe.ts:57`
- Test: `tests/unit/telegram/transcribe.test.ts` (must stay green, no new test)

- [ ] **Step 1: Confirm the existing transcribe tests pass before the change**

Run: `npx vitest run tests/unit/telegram/transcribe.test.ts`
Expected: PASS (baseline).

- [ ] **Step 2: Make the one-line change**

In `src/telegram/transcribe.ts`, find this line (around line 57):

```typescript
  const wavPath = oggPath.replace(/\.ogg$/i, '.wav');
```

Replace it with:

```typescript
  // Derive the WAV path from any input extension (Telegram sends .ogg;
  // Slack voice clips may be .mp4/.m4a/.webm). ffmpeg handles any input
  // container, so only the output path needs generalizing.
  const wavPath = oggPath.replace(/\.[^.]+$/, '.wav');
```

- [ ] **Step 3: Run the transcribe tests to verify they still pass**

Run: `npx vitest run tests/unit/telegram/transcribe.test.ts`
Expected: PASS. The existing tests use `.ogg` paths; `/\.[^.]+$/` still matches `.ogg` so `voice.ogg` to `voice.wav` is unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/telegram/transcribe.ts
git commit -m "refactor(transcribe): derive WAV path from any input extension"
```

---

## Task 4: src/slack/media.ts (processSlackMedia)

**Files:**
- Create: `src/slack/media.ts`
- Modify: `src/slack/index.ts`
- Test: `tests/unit/slack/media.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/slack/media.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { processSlackMedia } from '../../../src/slack/media';
import type { SlackMessageEvent } from '../../../src/slack/poller';

function mockApi(bytes: Buffer = Buffer.from('slack-bytes')) {
  return {
    downloadFile: vi.fn().mockResolvedValue(bytes),
  } as any;
}

function evt(files: SlackMessageEvent['files']): SlackMessageEvent {
  return {
    type: 'message',
    subtype: 'file_share',
    channel: 'C0123456',
    user: 'U123',
    text: 'caption here',
    ts: '1700000000.000100',
    files,
  };
}

describe('processSlackMedia', () => {
  let downloadDir: string;
  let prevNoTranscribe: string | undefined;

  beforeEach(() => {
    downloadDir = mkdtempSync(join(tmpdir(), 'cortextos-slack-media-'));
    prevNoTranscribe = process.env.CTX_TELEGRAM_NO_TRANSCRIBE;
    process.env.CTX_TELEGRAM_NO_TRANSCRIBE = '1';
  });

  afterEach(() => {
    rmSync(downloadDir, { recursive: true, force: true });
    if (prevNoTranscribe === undefined) delete process.env.CTX_TELEGRAM_NO_TRANSCRIBE;
    else process.env.CTX_TELEGRAM_NO_TRANSCRIBE = prevNoTranscribe;
  });

  it('returns empty array when there are no files', async () => {
    const out = await processSlackMedia(evt(undefined), mockApi(), downloadDir);
    expect(out).toEqual([]);
  });

  it('maps image/* to photo and saves the file', async () => {
    const api = mockApi(Buffer.from('img'));
    const out = await processSlackMedia(
      evt([{ id: 'F1', name: 'cat.jpg', mimetype: 'image/jpeg', filetype: 'jpg', url_private_download: 'https://files/cat.jpg' }]),
      api, downloadDir,
    );
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('photo');
    expect(out[0].text).toBe('caption here');
    expect(out[0].image_path).toBeDefined();
    expect(existsSync(out[0].image_path!)).toBe(true);
    expect(readFileSync(out[0].image_path!).toString()).toBe('img');
    expect(api.downloadFile).toHaveBeenCalledWith('https://files/cat.jpg');
  });

  it('maps audio/* to voice', async () => {
    const out = await processSlackMedia(
      evt([{ id: 'F2', name: 'memo.m4a', mimetype: 'audio/mp4', filetype: 'm4a', url_private_download: 'https://files/memo.m4a' }]),
      mockApi(), downloadDir,
    );
    expect(out[0].type).toBe('voice');
    expect(out[0].file_path).toBeDefined();
    expect(existsSync(out[0].file_path!)).toBe(true);
  });

  it('maps video/* to video', async () => {
    const out = await processSlackMedia(
      evt([{ id: 'F3', name: 'clip.mp4', mimetype: 'video/mp4', filetype: 'mp4', url_private_download: 'https://files/clip.mp4' }]),
      mockApi(), downloadDir,
    );
    expect(out[0].type).toBe('video');
    expect(out[0].file_path).toBeDefined();
  });

  it('maps unknown mimetype to document with sanitized name', async () => {
    const out = await processSlackMedia(
      evt([{ id: 'F4', name: '../../evil report.pdf', mimetype: 'application/pdf', filetype: 'pdf', url_private_download: 'https://files/r.pdf' }]),
      mockApi(), downloadDir,
    );
    expect(out[0].type).toBe('document');
    expect(out[0].file_name).toBe('evilreport.pdf');
    expect(out[0].file_path).toBeDefined();
  });

  it('handles multiple files in one message', async () => {
    const out = await processSlackMedia(
      evt([
        { id: 'F5', name: 'a.jpg', mimetype: 'image/jpeg', filetype: 'jpg', url_private_download: 'https://files/a.jpg' },
        { id: 'F6', name: 'b.pdf', mimetype: 'application/pdf', filetype: 'pdf', url_private_download: 'https://files/b.pdf' },
      ]),
      mockApi(), downloadDir,
    );
    expect(out).toHaveLength(2);
    expect(out[0].type).toBe('photo');
    expect(out[1].type).toBe('document');
  });

  it('skips a file whose download fails and keeps the rest', async () => {
    const api = {
      downloadFile: vi.fn()
        .mockRejectedValueOnce(new Error('403'))
        .mockResolvedValueOnce(Buffer.from('ok')),
    } as any;
    const out = await processSlackMedia(
      evt([
        { id: 'F7', name: 'bad.jpg', mimetype: 'image/jpeg', filetype: 'jpg', url_private_download: 'https://files/bad.jpg' },
        { id: 'F8', name: 'good.pdf', mimetype: 'application/pdf', filetype: 'pdf', url_private_download: 'https://files/good.pdf' },
      ]),
      api, downloadDir,
    );
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('document');
  });

  it('skips a file with no usable URL', async () => {
    const out = await processSlackMedia(
      evt([{ id: 'F9', name: 'x.jpg', mimetype: 'image/jpeg', filetype: 'jpg' }]),
      mockApi(), downloadDir,
    );
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/slack/media.test.ts`
Expected: FAIL with "Cannot find module '../../../src/slack/media'".

- [ ] **Step 3: Implement src/slack/media.ts**

Create `src/slack/media.ts`:

```typescript
/**
 * Slack media message handling.
 *
 * Slack does not categorize uploads the way Telegram does (no msg.photo /
 * msg.voice). A message just carries a files[] array where each file has a
 * mimetype. We map the mimetype to a category, download the bytes with the
 * bot token (Slack private URLs require a bearer header), and save locally.
 *
 * Mirrors src/telegram/media.ts. transcribeVoice is reused as-is (it takes a
 * file path and is transport-agnostic).
 */

import * as fs from 'fs';
import * as path from 'path';
import { SlackAPI } from './api.js';
import type { SlackMessageEvent, SlackFile } from './poller.js';
import { sanitizeFilename } from '../telegram/media.js';
import { transcribeVoice } from '../telegram/transcribe.js';
import { ensureDir } from '../utils/atomic.js';

export interface ProcessedSlackMedia {
  type: 'photo' | 'document' | 'voice' | 'video';
  channel: string;
  from: string;
  text: string;
  ts: string;
  image_path?: string;
  file_path?: string;
  file_name?: string;
  transcript?: string;
}

function categorize(mimetype: string | undefined): 'photo' | 'voice' | 'video' | 'document' {
  const m = (mimetype || '').toLowerCase();
  if (m.startsWith('image/')) return 'photo';
  if (m.startsWith('audio/')) return 'voice';
  if (m.startsWith('video/')) return 'video';
  return 'document';
}

/**
 * Build a safe local filename for a Slack file. Uses the sanitized original
 * name when present, else synthesizes one from the message ts + filetype.
 */
function localName(file: SlackFile, ts: string): string {
  if (file.name) return sanitizeFilename(file.name);
  const ext = file.filetype ? `.${sanitizeFilename(file.filetype)}` : '';
  const safeTs = ts.replace(/[^0-9.]/g, '');
  return `slackfile_${safeTs}_${sanitizeFilename(file.id)}${ext}`;
}

/**
 * Process all files on a Slack message. Returns one ProcessedSlackMedia per
 * successfully downloaded file. A file with no usable URL or a failed
 * download is skipped (logged via console.error) so the remaining files
 * still reach the agent. Returns [] when the message has no files.
 */
export async function processSlackMedia(
  event: SlackMessageEvent,
  api: SlackAPI,
  downloadDir: string,
): Promise<ProcessedSlackMedia[]> {
  const files = event.files;
  if (!files || files.length === 0) return [];

  ensureDir(downloadDir);

  const from = event.user || 'unknown';
  const text = event.text || '';
  const channel = event.channel;
  const ts = event.ts;
  const results: ProcessedSlackMedia[] = [];

  for (const file of files) {
    const url = file.url_private_download || file.url_private;
    if (!url) {
      console.error(`[slack-media] file ${file.id} has no download URL - skipping`);
      continue;
    }

    let data: Buffer;
    try {
      data = await api.downloadFile(url);
    } catch (err) {
      console.error(`[slack-media] download failed for file ${file.id}: ${err} - skipping`);
      continue;
    }

    const category = categorize(file.mimetype);
    const fileName = localName(file, ts);
    const localFile = path.join(downloadDir, fileName);
    fs.writeFileSync(localFile, data);

    if (category === 'photo') {
      results.push({ type: 'photo', channel, from, text, ts, image_path: localFile });
    } else if (category === 'voice') {
      const transcript = await transcribeVoice(localFile);
      results.push({
        type: 'voice',
        channel, from, text, ts,
        file_path: localFile,
        transcript: transcript || undefined,
      });
    } else if (category === 'video') {
      results.push({ type: 'video', channel, from, text, ts, file_path: localFile, file_name: fileName });
    } else {
      results.push({ type: 'document', channel, from, text, ts, file_path: localFile, file_name: fileName });
    }
  }

  return results;
}
```

In `src/slack/index.ts`, add after the existing `SlackPoller` export line:

```typescript
export { processSlackMedia } from './media.js';
export type { ProcessedSlackMedia } from './media.js';
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/slack/media.test.ts`
Expected: PASS (all 8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/slack/media.ts src/slack/index.ts tests/unit/slack/media.test.ts
git commit -m "feat(slack): add processSlackMedia with mimetype-to-category mapping"
```

---

## Task 5: Slack format functions in fast-checker.ts

**Files:**
- Modify: `src/daemon/fast-checker.ts` (add 4 static methods after `formatTelegramVideoMessage`, which ends around line 400)
- Test: `tests/unit/daemon/slack-format.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/daemon/slack-format.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { FastChecker } from '../../../src/daemon/fast-checker';

describe('Slack format functions', () => {
  it('formatSlackPhotoMessage includes local_file and send-slack reply', () => {
    const out = FastChecker.formatSlackPhotoMessage('U123', 'C0123456', 'hello', 'slack-files/cat.jpg');
    expect(out).toContain('=== SLACK PHOTO from U123 (channel:C0123456) ===');
    expect(out).toContain('local_file: slack-files/cat.jpg');
    expect(out).toContain('hello');
    expect(out).toContain('cortextos bus send-slack C0123456');
  });

  it('formatSlackDocumentMessage includes file_name', () => {
    const out = FastChecker.formatSlackDocumentMessage('U1', 'C9', 'doc caption', 'slack-files/r.pdf', 'r.pdf');
    expect(out).toContain('=== SLACK DOCUMENT from U1 (channel:C9) ===');
    expect(out).toContain('local_file: slack-files/r.pdf');
    expect(out).toContain('file_name: r.pdf');
    expect(out).toContain('cortextos bus send-slack C9');
  });

  it('formatSlackVoiceMessage includes transcript block when present', () => {
    const out = FastChecker.formatSlackVoiceMessage('U1', 'C9', 'slack-files/v.m4a', 'salut lume');
    expect(out).toContain('=== SLACK VOICE from U1 (channel:C9) ===');
    expect(out).toContain('local_file: slack-files/v.m4a');
    expect(out).toContain('transcript:');
    expect(out).toContain('salut lume');
  });

  it('formatSlackVoiceMessage omits transcript block when absent', () => {
    const out = FastChecker.formatSlackVoiceMessage('U1', 'C9', 'slack-files/v.m4a', undefined);
    expect(out).not.toContain('transcript:');
    expect(out).toContain('local_file: slack-files/v.m4a');
  });

  it('formatSlackVideoMessage includes file_name and caption', () => {
    const out = FastChecker.formatSlackVideoMessage('U1', 'C9', 'clip caption', 'slack-files/c.mp4', 'c.mp4');
    expect(out).toContain('=== SLACK VIDEO from U1 (channel:C9) ===');
    expect(out).toContain('local_file: slack-files/c.mp4');
    expect(out).toContain('file_name: c.mp4');
    expect(out).toContain('clip caption');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/daemon/slack-format.test.ts`
Expected: FAIL with "FastChecker.formatSlackPhotoMessage is not a function".

- [ ] **Step 3: Implement the four format functions**

In `src/daemon/fast-checker.ts`, locate the end of `formatTelegramVideoMessage` (the method returns a template string and closes around line 400, just before the `waitForBootstrap` private method). Insert these four static methods immediately after `formatTelegramVideoMessage` and before `private async waitForBootstrap`:

```typescript
  /**
   * Format a Slack photo message for injection. Parallel to
   * formatTelegramPhotoMessage but with a Slack header and a send-slack
   * reply directive so the agent replies on the right transport.
   */
  static formatSlackPhotoMessage(
    from: string,
    channel: string,
    caption: string,
    imagePath: string,
  ): string {
    return `=== SLACK PHOTO from ${from} (channel:${channel}) ===
caption:
\`\`\`
${caption}
\`\`\`
local_file: ${imagePath}
Reply using: cortextos bus send-slack ${channel} "<your reply>"

`;
  }

  /**
   * Format a Slack document message for injection.
   */
  static formatSlackDocumentMessage(
    from: string,
    channel: string,
    caption: string,
    filePath: string,
    fileName: string,
  ): string {
    return `=== SLACK DOCUMENT from ${from} (channel:${channel}) ===
caption:
\`\`\`
${caption}
\`\`\`
local_file: ${filePath}
file_name: ${fileName}
Reply using: cortextos bus send-slack ${channel} "<your reply>"

`;
  }

  /**
   * Format a Slack voice message for injection. `transcript` is populated by
   * src/telegram/transcribe.ts (reused) when whisper-cli + model are
   * available; otherwise it stays undefined and only the audio path is sent.
   */
  static formatSlackVoiceMessage(
    from: string,
    channel: string,
    filePath: string,
    transcript?: string,
  ): string {
    const transcriptBlock = transcript && transcript.trim()
      ? `transcript:\n\`\`\`\n${transcript.trim()}\n\`\`\`\n`
      : '';
    return `=== SLACK VOICE from ${from} (channel:${channel}) ===
local_file: ${filePath}
${transcriptBlock}Reply using: cortextos bus send-slack ${channel} "<your reply>"

`;
  }

  /**
   * Format a Slack video message for injection.
   */
  static formatSlackVideoMessage(
    from: string,
    channel: string,
    caption: string,
    filePath: string,
    fileName: string,
  ): string {
    return `=== SLACK VIDEO from ${from} (channel:${channel}) ===
caption:
\`\`\`
${caption}
\`\`\`
local_file: ${filePath}
file_name: ${fileName}
Reply using: cortextos bus send-slack ${channel} "<your reply>"

`;
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/daemon/slack-format.test.ts`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/daemon/fast-checker.ts tests/unit/daemon/slack-format.test.ts
git commit -m "feat(slack): add Slack media format functions to fast-checker"
```

---

## Task 6: Wire processSlackMedia into agent-manager.ts

**Files:**
- Modify: `src/daemon/agent-manager.ts` (imports near line 18; Slack live handler around lines 525-552; Slack catch-up loop around lines 558-575)

This task has no isolated unit test (the Slack wiring runs inside the daemon agent lifecycle). Verification is a clean build plus the full existing suite staying green, mirroring how the Telegram media wiring is verified.

- [ ] **Step 1: Add the import**

In `src/daemon/agent-manager.ts`, find the existing Slack imports (around lines 18-20):

```typescript
import { SlackAPI } from '../slack/api.js';
import { SlackPoller } from '../slack/poller.js';
import { logInboundSlack } from '../slack/logging.js';
```

Add directly below them:

```typescript
import { processSlackMedia } from '../slack/media.js';
```

- [ ] **Step 2: Add a shared media-injection helper inside the Slack block**

In `src/daemon/agent-manager.ts`, inside the `else` branch that builds the Slack poller (after `const slackPoller = new SlackPoller(slackAppToken, slackBotToken);` and before `slackPoller.onMessage(...)`, around line 523), add:

```typescript
        const slackMediaApi = new SlackAPI(slackBotToken);
        const slackDownloadDir = join(agentDir, 'slack-files');
        const slackLaunchDir = config?.working_directory || agentDir;
        const slackToRel = (p: string | undefined) => (p ? relative(slackLaunchDir, p) : '');

        // Download every file on a Slack event and inject one formatted
        // message per file. Returns true when the event carried files (so
        // the caller skips the plain-text path), false otherwise.
        const injectSlackMedia = (event: SlackMessageEvent): boolean => {
          if (!event.files || event.files.length === 0) return false;
          const currentEntry = this.agents.get(name);
          if (!currentEntry) return true;
          processSlackMedia(event, slackMediaApi, slackDownloadDir).then((items) => {
            const live = this.agents.get(name);
            if (!live) return;
            for (const media of items) {
              let formatted: string;
              if (media.type === 'photo') {
                formatted = FastChecker.formatSlackPhotoMessage(media.from, media.channel, media.text, slackToRel(media.image_path));
              } else if (media.type === 'voice') {
                formatted = FastChecker.formatSlackVoiceMessage(media.from, media.channel, slackToRel(media.file_path), media.transcript);
              } else if (media.type === 'video') {
                formatted = FastChecker.formatSlackVideoMessage(media.from, media.channel, media.text, slackToRel(media.file_path), media.file_name || '');
              } else {
                formatted = FastChecker.formatSlackDocumentMessage(media.from, media.channel, media.text, slackToRel(media.file_path), media.file_name || '');
              }
              if (live.checker.isDuplicate(formatted)) {
                log('Duplicate Slack media message suppressed');
                continue;
              }
              log(`Slack media received: type=${media.type}`);
              live.checker.queueTelegramMessage(formatted);
            }
          }).catch((err) => {
            log(`Slack media processing error: ${err}`);
          });
          return true;
        };
```

`SlackMessageEvent` is already an imported type in this file via the poller import path; if the type is not in scope, add `import type { SlackMessageEvent } from '../slack/poller.js';` next to the other Slack imports.

- [ ] **Step 3: Call the helper from the live handler**

In the `slackPoller.onMessage((event) => { ... })` handler, find this block (around lines 542-551):

```typescript
          log(`Slack message received from ${event.user} (channel:${event.channel})`);
          logInboundSlack(this.ctxRoot, name, event);

          const text = event.text ?? '';
          const formatted = [
            `=== SLACK from ${event.user ?? 'unknown'} (channel:${event.channel}) ===`,
            text,
            `Reply using: cortextos bus send-slack ${event.channel} "<your reply>"`,
          ].join('\n');
          currentEntry.checker.queueTelegramMessage(formatted);
```

Replace it with:

```typescript
          log(`Slack message received from ${event.user} (channel:${event.channel})`);
          logInboundSlack(this.ctxRoot, name, event);

          if (injectSlackMedia(event)) return;

          const text = event.text ?? '';
          const formatted = [
            `=== SLACK from ${event.user ?? 'unknown'} (channel:${event.channel}) ===`,
            text,
            `Reply using: cortextos bus send-slack ${event.channel} "<your reply>"`,
          ].join('\n');
          currentEntry.checker.queueTelegramMessage(formatted);
```

- [ ] **Step 4: Call the helper from the catch-up loop**

In the catch-up `.then(missed => { ... })` block, find the loop (around lines 562-571):

```typescript
          for (const event of missed) {
            if (event.user !== slackAllowedUserId) continue;
            logInboundSlack(this.ctxRoot, name, event);
            const text = event.text ?? '';
            const formatted = [
              `=== SLACK from ${event.user ?? 'unknown'} (channel:${event.channel}) ===`,
              text,
              `Reply using: cortextos bus send-slack ${event.channel} "<your reply>"`,
            ].join('\n');
            if (!currentEntry.checker.isDuplicate(formatted)) currentEntry.checker.queueTelegramMessage(formatted);
          }
```

Replace it with:

```typescript
          for (const event of missed) {
            if (event.user !== slackAllowedUserId) continue;
            logInboundSlack(this.ctxRoot, name, event);
            if (injectSlackMedia(event)) continue;
            const text = event.text ?? '';
            const formatted = [
              `=== SLACK from ${event.user ?? 'unknown'} (channel:${event.channel}) ===`,
              text,
              `Reply using: cortextos bus send-slack ${event.channel} "<your reply>"`,
            ].join('\n');
            if (!currentEntry.checker.isDuplicate(formatted)) currentEntry.checker.queueTelegramMessage(formatted);
          }
```

(The allowed-user gate `if (event.user !== slackAllowedUserId) continue;` stays above the media call in catch-up. In the live handler, the existing allowed-user and channel gates already run earlier in the handler, before `injectSlackMedia` is reached, so no download happens for unauthorized users.)

- [ ] **Step 5: Build to verify types compile**

Run: `npm run build`
Expected: TypeScript compiles cleanly with no errors.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: All tests pass (no regression in Telegram media, Slack inbound security, or any other suite).

- [ ] **Step 7: Commit**

```bash
git add src/daemon/agent-manager.ts
git commit -m "feat(slack): inject downloaded media into agent context after security gate"
```

---

## Task 7: Document the files:read scope in SLACK-SETUP.md

**Files:**
- Modify: `/Users/danmitrut/Desktop/Brain Orchestra/SLACK-SETUP.md`

- [ ] **Step 1: Add files:read to both scope tables**

In `/Users/danmitrut/Desktop/Brain Orchestra/SLACK-SETUP.md`, in section "3. Bot Token Scopes", add this row to BOTH the "Orchestrator (maestro)" table and the "Agent standard" table, after the `im:write` row:

```
| `files:read` | descarca fisiere/imagini incarcate de utilizator |
```

- [ ] **Step 2: Add files:read to the rapid checklist**

In the "Checklist rapida" section, under "Pentru orice agent (inclusiv orchestrator)", add this line after the `im:write` checkbox:

```
- [ ] Bot scope `files:read`
```

- [ ] **Step 3: Add a note to the production-verified table**

Under "Scopuri verificate in productie", add a dated note line below the existing table:

```

> 2026-05-16: `files:read` adaugat pe maestro, imager, analist pentru suport media inbound (poze, documente, voice, video). Necesita Reinstall to Workspace dupa adaugare.
```

- [ ] **Step 4: Commit**

This file lives on the Desktop, outside the cortextos git repo, so there is nothing to commit. Verify the three edits are present by re-reading the file and confirming `files:read` appears in both scope tables, the checklist, and the dated note.

---

## Manual Rollout (operator, after all tasks land)

Not a code task. For each Slack app (maestro, imager, analist):
1. api.slack.com/apps -> the app -> OAuth & Permissions -> Bot Token Scopes -> add `files:read`.
2. Reinstall to Workspace -> Allow.
3. `pm2 restart cortextos-daemon`.
4. Upload an image in the agent's Slack channel and confirm the agent can read it.

---

## Self-Review

**Spec coverage:**
- New `src/slack/media.ts` with `processSlackMedia` -> Task 4. ✓
- `SlackMessageEvent` gains `files`/`subtype`, `SlackFile` interface -> Task 1. ✓
- `fetchHistory` filter accepts files-only messages -> Task 1. ✓
- `SlackAPI.downloadFile` with bearer auth -> Task 2. ✓
- `transcribe.ts` WAV path generalization (only shared Telegram touch) -> Task 3. ✓
- 4 Slack format functions in `fast-checker.ts` -> Task 5. ✓
- agent-manager wiring, live + catch-up, security gate preserved, `slack-files` dir, relative paths, dedup -> Task 6. ✓
- mimetype mapping table (image/audio/video/other) -> Task 4 `categorize`. ✓
- Edge cases: no-files -> [], multi-file loop, download failure skip, no-URL skip, voice no-whisper graceful (env in tests) -> Task 4 tests. ✓
- index.ts exports -> Tasks 1 and 4. ✓
- SLACK-SETUP.md files:read -> Task 7. ✓
- Full parity scope (no video_note since Slack lacks it) -> covered; `categorize` has no video_note branch by design. ✓
- All 3 agents rollout -> Manual Rollout section. ✓

**Placeholder scan:** No TBD/TODO. Every code step shows complete code. Every command has expected output. No "similar to Task N" references.

**Type consistency:** `SlackFile` (Task 1) fields (`id`, `name?`, `mimetype?`, `filetype?`, `url_private_download?`, `url_private?`, `size?`) are used consistently in Task 4 (`file.url_private_download || file.url_private`, `file.mimetype`, `file.name`, `file.filetype`, `file.id`). `ProcessedSlackMedia` (Task 4) fields (`type`, `channel`, `from`, `text`, `ts`, `image_path?`, `file_path?`, `file_name?`, `transcript?`) match the consumption in Task 6 (`media.image_path`, `media.file_path`, `media.file_name`, `media.transcript`, `media.type` in {photo,voice,video,document}). Format function signatures in Task 5 match the calls in Task 6 (photo: from,channel,caption,path; voice: from,channel,path,transcript?; video/document: from,channel,caption,path,fileName). `processSlackMedia(event, api, downloadDir)` signature matches Task 6 call. Consistent.
