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

describe('bus_list_tasks', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'mcp-tasks-test-'));
    const taskDir = join(testDir, 'orgs', 'dm-brain-orchestra', 'tasks');
    mkdirSync(taskDir, { recursive: true });
    writeFileSync(
      join(taskDir, 'task_111.json'),
      JSON.stringify({ id: 'task_111', title: 'Analizează raportul', status: 'pending', agent: 'maestro' }),
    );
    writeFileSync(
      join(taskDir, 'task_222.json'),
      JSON.stringify({ id: 'task_222', title: 'Publică newsletter', status: 'completed', agent: 'analist' }),
    );
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('listează toate task-urile fără filtru', async () => {
    const result = await runBusTool('bus_list_tasks', {}, testDir);
    expect(result).toContain('Analizează raportul');
    expect(result).toContain('Publică newsletter');
  });

  it('filtrează după agent', async () => {
    const result = await runBusTool('bus_list_tasks', { agent: 'maestro' }, testDir);
    expect(result).toContain('Analizează raportul');
    expect(result).not.toContain('Publică newsletter');
  });

  it('returnează mesaj clar dacă nu există orgs', async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'mcp-tasks-empty-'));
    const result = await runBusTool('bus_list_tasks', {}, emptyDir);
    expect(result).toContain('Niciun task');
    rmSync(emptyDir, { recursive: true, force: true });
  });
});
