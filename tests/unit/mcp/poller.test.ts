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
