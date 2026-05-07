import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock the PTY/Telegram layers — same shape as the existing
// agent-manager.test.ts so we can construct AgentManager without spawning
// anything real. The inspect helper is pure logic over the agents Map; we
// only need to control what is in / out of the Map.
vi.mock('../../../src/daemon/agent-process.js', () => ({
  AgentProcess: class {
    name: string;
    dir: string;
    constructor(name: string, dir: string) { this.name = name; this.dir = dir; }
    async start() { /* no-op */ }
    async stop() { /* no-op */ }
    getStatus() { return { name: this.name, status: 'stopped' }; }
    onExit() { /* no-op */ }
  },
}));
vi.mock('../../../src/daemon/fast-checker.js', () => ({
  FastChecker: class { start() {} stop() {} wake() {} },
}));
vi.mock('../../../src/telegram/api.js', () => ({ TelegramAPI: class { constructor() {} } }));
vi.mock('../../../src/telegram/poller.js', () => ({ TelegramPoller: class { start() {} stop() {} } }));

const { AgentManager } = await import('../../../src/daemon/agent-manager.js');

describe('AgentManager.inspectAgentOp — issue #346 (DEDUPED vs NOT_FOUND)', () => {
  let testDir: string;
  let am: InstanceType<typeof AgentManager>;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'cortextos-inspect-test-'));
    mkdirSync(join(testDir, 'framework'), { recursive: true });
    am = new AgentManager('test-instance', join(testDir, 'instance'), join(testDir, 'framework'), 'acme');
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('start on empty registry: ok (queued)', () => {
    const r = am.inspectAgentOp('start', 'alice');
    expect(r.ok).toBe(true);
  });

  it('start when agent already in registry: DEDUPED (not NOT_FOUND)', () => {
    // Simulate an in-flight start by injecting an entry into the private map.
    // This is the exact precondition that triggers the BUG-011 dedup branch
    // in startAgent — we need to confirm it surfaces as DEDUPED, not NOT_FOUND.
    (am as unknown as { agents: Map<string, unknown> }).agents.set('alice', { /* sentinel */ } as unknown);

    const r = am.inspectAgentOp('start', 'alice');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('DEDUPED');
      expect(r.message).toMatch(/already in registry/);
      expect(r.message).toContain('alice');
    }
  });

  it('stop on empty registry: NOT_FOUND (the misreport bug — must distinguish)', () => {
    const r = am.inspectAgentOp('stop', 'ghost');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('NOT_FOUND');
      expect(r.message).toMatch(/not in registry/);
      expect(r.message).toContain('ghost');
      expect(r.message).toContain('stop');
    }
  });

  it('restart on empty registry: NOT_FOUND', () => {
    const r = am.inspectAgentOp('restart', 'ghost');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('NOT_FOUND');
      expect(r.message).toContain('restart');
    }
  });

  it('stop on agent in registry: ok', () => {
    (am as unknown as { agents: Map<string, unknown> }).agents.set('alice', {} as unknown);
    const r = am.inspectAgentOp('stop', 'alice');
    expect(r.ok).toBe(true);
  });

  it('restart on agent in registry: ok', () => {
    (am as unknown as { agents: Map<string, unknown> }).agents.set('alice', {} as unknown);
    const r = am.inspectAgentOp('restart', 'alice');
    expect(r.ok).toBe(true);
  });

  it('inspectAgentOp does not mutate the agents map (read-only check)', () => {
    const before = (am as unknown as { agents: Map<string, unknown> }).agents.size;
    am.inspectAgentOp('start', 'alice');
    am.inspectAgentOp('stop', 'ghost');
    am.inspectAgentOp('restart', 'phantom');
    const after = (am as unknown as { agents: Map<string, unknown> }).agents.size;
    expect(after).toBe(before);
  });
});
