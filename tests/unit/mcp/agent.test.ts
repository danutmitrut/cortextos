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

  it('returnează eroare dacă heartbeat-ul este corupt', async () => {
    const stateDir = join(testDir, 'state', 'maestro');
    writeFileSync(join(stateDir, 'heartbeat.json'), 'not valid json{{');
    const result = await runAgentTool('agent_status', { agent: 'maestro' }, testDir);
    expect(result).toContain('heartbeat corupt');
  });
});
