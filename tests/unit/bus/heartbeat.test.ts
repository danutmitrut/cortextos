import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { updateHeartbeat, detectDayNightMode } from '../../../src/bus/heartbeat';
import type { BusPaths, Heartbeat } from '../../../src/types';

/**
 * Day/night mode resolution in updateHeartbeat. The regression that motivated
 * these tests: the HEARTBEAT.md templates and the fast-checker idle watchdog
 * call `bus update-heartbeat` without --timezone, and updateHeartbeat fell
 * straight back to UTC — so an org in America/Chicago reported mode=night from
 * ~16:00 local (22:00 UTC) and agents went quiet in the afternoon. The daemon
 * already injects CTX_TIMEZONE and TZ into every agent's environment
 * (agent-pty, from config.json), so updateHeartbeat must consult them before
 * falling back to UTC — the same chain the bash bus/_ctx-env.sh resolves.
 *
 * All tests pin the clock to 2026-01-15T23:30:00Z (winter — no DST edges):
 * UTC hour 23 → night, America/Chicago (UTC-6) hour 17 → day.
 */
describe('updateHeartbeat day/night timezone resolution', () => {
  let testDir: string;
  let paths: BusPaths;
  let savedCtxTimezone: string | undefined;
  let savedTz: string | undefined;

  const readHeartbeat = (): Heartbeat =>
    JSON.parse(readFileSync(join(paths.stateDir, 'heartbeat.json'), 'utf-8'));

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'cortextos-heartbeat-test-'));
    paths = {
      ctxRoot: testDir,
      inbox: join(testDir, 'inbox', 'spark'),
      inflight: join(testDir, 'inflight', 'spark'),
      processed: join(testDir, 'processed', 'spark'),
      logDir: join(testDir, 'logs', 'spark'),
      stateDir: join(testDir, 'state', 'spark'),
      taskDir: join(testDir, 'tasks'),
      approvalDir: join(testDir, 'approvals'),
      analyticsDir: join(testDir, 'analytics'),
      heartbeatDir: join(testDir, 'heartbeats'),
    };
    mkdirSync(paths.stateDir, { recursive: true });

    savedCtxTimezone = process.env.CTX_TIMEZONE;
    savedTz = process.env.TZ;
    delete process.env.CTX_TIMEZONE;
    delete process.env.TZ;

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T23:30:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    if (savedCtxTimezone === undefined) delete process.env.CTX_TIMEZONE;
    else process.env.CTX_TIMEZONE = savedCtxTimezone;
    if (savedTz === undefined) delete process.env.TZ;
    else process.env.TZ = savedTz;
    rmSync(testDir, { recursive: true, force: true });
  });

  it('uses an explicit options.timezone when provided', () => {
    updateHeartbeat(paths, 'spark', 'online', { timezone: 'America/Chicago' });
    expect(readHeartbeat().mode).toBe('day'); // 17:30 local
  });

  it('falls back to CTX_TIMEZONE when no --timezone is passed (the HEARTBEAT.md path)', () => {
    process.env.CTX_TIMEZONE = 'America/Chicago';
    updateHeartbeat(paths, 'spark', 'online');
    expect(readHeartbeat().mode).toBe('day'); // was wrongly 'night' before the fix
  });

  it('falls back to TZ when CTX_TIMEZONE is unset', () => {
    process.env.TZ = 'America/Chicago';
    updateHeartbeat(paths, 'spark', 'online');
    expect(readHeartbeat().mode).toBe('day');
  });

  it('an explicit options.timezone wins over CTX_TIMEZONE', () => {
    process.env.CTX_TIMEZONE = 'America/Chicago'; // day at the pinned instant
    updateHeartbeat(paths, 'spark', 'online', { timezone: 'Europe/Bucharest' }); // 01:30 local
    expect(readHeartbeat().mode).toBe('night');
  });

  it('defaults to UTC when no timezone is available anywhere', () => {
    updateHeartbeat(paths, 'spark', 'online');
    expect(readHeartbeat().mode).toBe('night'); // 23:30 UTC
  });
});

describe('detectDayNightMode', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T23:30:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('computes day for a zone where the local hour is within 8-22', () => {
    expect(detectDayNightMode('America/Chicago')).toBe('day');
  });

  it('computes night for UTC at the pinned instant', () => {
    expect(detectDayNightMode('UTC')).toBe('night');
  });

  it('falls back to UTC hours on an invalid timezone instead of throwing', () => {
    expect(detectDayNightMode('Not/AZone')).toBe('night');
  });
});
