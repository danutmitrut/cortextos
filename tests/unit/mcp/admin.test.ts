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

  it('returnează eroare dacă agentul nu există', async () => {
    const result = await runAdminTool('admin_crons', { agent: 'inexistent' }, testDir);
    expect(result).toContain('nu a fost găsit');
  });

  it('returnează mesaj clar dacă nu există cronograme', async () => {
    const agentDir = join(testDir, 'orgs', 'dm-brain-orchestra', 'agents', 'empty-agent');
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(agentDir, 'config.json'), JSON.stringify({ crons: [] }));
    const result = await runAdminTool('admin_crons', { agent: 'empty-agent' }, testDir);
    expect(result).toContain('nu are cronograme');
  });
});

describe('admin_metrics', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'mcp-metrics-test-'));
    const stateDir = join(testDir, 'state', 'maestro');
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(
      join(stateDir, 'heartbeat.json'),
      JSON.stringify({ agent: 'maestro', status: 'idle', mode: 'day', last_heartbeat: '2026-05-14T10:00:00Z' }),
    );
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('returnează metrici pentru un agent specific', async () => {
    const result = await runAdminTool('admin_metrics', { agent: 'maestro' }, testDir);
    expect(result).toContain('maestro');
    expect(result).toContain('idle');
  });

  it('returnează metrici pentru toți agenții dacă agent lipsește', async () => {
    const result = await runAdminTool('admin_metrics', {}, testDir);
    expect(result).toContain('maestro');
  });
});
