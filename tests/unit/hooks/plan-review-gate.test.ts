import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';

const GATE = resolve(__dirname, '../../../scripts/plan-review-gate.sh');
const FAKE_BRANCH = 'feat/plan-review-gate-test';
const FAKE_SLUG = 'feat-plan-review-gate-test';

function runGate(env: Record<string, string>): { code: number; stdout: string; stderr: string } {
  const r = spawnSync('bash', [GATE], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
  return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

describe('plan-review-gate.sh', () => {
  let dir: string;
  let planFile: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'plan-review-gate-'));
    planFile = join(dir, `${FAKE_SLUG}-plan.md`);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('blocks when plan file is missing', () => {
    const r = runGate({ PLAN_REVIEW_BRANCH: FAKE_BRANCH, PLAN_REVIEW_DIR: dir });
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/Plan-First Review file is missing/);
  });

  it('passes on TRIVIAL-TASK-EXEMPT with reason', () => {
    writeFileSync(planFile, 'TRIVIAL-TASK-EXEMPT: typo fix in README\n');
    const r = runGate({ PLAN_REVIEW_BRANCH: FAKE_BRANCH, PLAN_REVIEW_DIR: dir });
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/PASS \(trivial-task-exempt\)/);
  });

  it('blocks on TRIVIAL-TASK-EXEMPT without reason', () => {
    writeFileSync(planFile, 'TRIVIAL-TASK-EXEMPT:\n');
    const r = runGate({ PLAN_REVIEW_BRANCH: FAKE_BRANCH, PLAN_REVIEW_DIR: dir });
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/requires a one-sentence reason/);
  });

  it('passes on full panel: QUORUM 8/10 + Security PASS + DataIntegrity PASS', () => {
    writeFileSync(
      planFile,
      [
        '| Persona | Verdict |',
        '| Security | PASS |',
        '| DataIntegrity | PASS |',
        'QUORUM: PASS (8/10)',
        '',
      ].join('\n'),
    );
    const r = runGate({ PLAN_REVIEW_BRANCH: FAKE_BRANCH, PLAN_REVIEW_DIR: dir });
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/PASS:.*Security \+ DataIntegrity verified/);
  });

  it('blocks when QUORUM ratio is below 8/10', () => {
    writeFileSync(
      planFile,
      [
        '| Security | PASS |',
        '| DataIntegrity | PASS |',
        'QUORUM: PASS (7/10)',
        '',
      ].join('\n'),
    );
    const r = runGate({ PLAN_REVIEW_BRANCH: FAKE_BRANCH, PLAN_REVIEW_DIR: dir });
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/quorum is 7\/10; minimum is 8\/10/);
  });

  it('blocks when no QUORUM line is present', () => {
    writeFileSync(planFile, '| Security | PASS |\n| DataIntegrity | PASS |\n');
    const r = runGate({ PLAN_REVIEW_BRANCH: FAKE_BRANCH, PLAN_REVIEW_DIR: dir });
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/has no 'QUORUM: PASS' line/);
  });

  it("blocks when mandatory persona 'Security' is missing", () => {
    writeFileSync(
      planFile,
      [
        '| DataIntegrity | PASS |',
        'QUORUM: PASS (9/10)',
        '',
      ].join('\n'),
    );
    const r = runGate({ PLAN_REVIEW_BRANCH: FAKE_BRANCH, PLAN_REVIEW_DIR: dir });
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/mandatory persona 'Security' is missing/);
  });

  it('blocks when Security verdict is FAIL', () => {
    writeFileSync(
      planFile,
      [
        '| Security | FAIL |',
        '| DataIntegrity | PASS |',
        'QUORUM: PASS (8/10)',
        '',
      ].join('\n'),
    );
    const r = runGate({ PLAN_REVIEW_BRANCH: FAKE_BRANCH, PLAN_REVIEW_DIR: dir });
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/persona 'Security' verdict is not PASS/);
  });

  it('skips on protected branch (main)', () => {
    const r = runGate({ PLAN_REVIEW_BRANCH: 'main', PLAN_REVIEW_DIR: dir });
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/protected branch 'main' — skipping gate/);
  });

  it('bypasses with PLAN_REVIEW_BYPASS=true', () => {
    const r = runGate({
      PLAN_REVIEW_BRANCH: FAKE_BRANCH,
      PLAN_REVIEW_DIR: dir,
      PLAN_REVIEW_BYPASS: 'true',
    });
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(/PLAN_REVIEW_BYPASS=true — gate bypassed/);
  });
});
