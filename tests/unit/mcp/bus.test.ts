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
