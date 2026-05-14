import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runTaskTool } from '../../../src/mcp/tools/task';

describe('task_list', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'mcp-task-test-'));
    const taskDir = join(testDir, 'orgs', 'dm-brain-orchestra', 'tasks');
    mkdirSync(taskDir, { recursive: true });
    writeFileSync(
      join(taskDir, 'task_111.json'),
      JSON.stringify({ id: 'task_111', title: 'Analizează raportul', status: 'pending', agent: 'maestro', created_at: '2026-05-14T09:00:00Z' }),
    );
    writeFileSync(
      join(taskDir, 'task_222.json'),
      JSON.stringify({ id: 'task_222', title: 'Publică newsletter', status: 'completed', agent: 'maestro', created_at: '2026-05-14T08:00:00Z' }),
    );
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('listează toate task-urile', async () => {
    const result = await runTaskTool('task_list', {}, testDir);
    expect(result).toContain('Analizează raportul');
    expect(result).toContain('Publică newsletter');
  });

  it('filtrează după status', async () => {
    const result = await runTaskTool('task_list', { status: 'pending' }, testDir);
    expect(result).toContain('Analizează raportul');
    expect(result).not.toContain('Publică newsletter');
  });

  it('filtrează după agent', async () => {
    const taskDir = join(testDir, 'orgs', 'dm-brain-orchestra', 'tasks');
    writeFileSync(
      join(taskDir, 'task_333.json'),
      JSON.stringify({ id: 'task_333', title: 'Alt task', status: 'pending', agent: 'analist', created_at: '2026-05-14T07:00:00Z' }),
    );
    const result = await runTaskTool('task_list', { agent: 'analist' }, testDir);
    expect(result).toContain('Alt task');
    expect(result).not.toContain('Analizează raportul');
  });

  it('gestionate task corupt în lista', async () => {
    writeFileSync(join(testDir, 'orgs', 'dm-brain-orchestra', 'tasks', 'corrupt.json'), 'NOT JSON{{');
    const result = await runTaskTool('task_list', {}, testDir);
    // should still return other tasks and not crash
    expect(result).toBeTruthy();
  });
});

describe('task_approve', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'mcp-task-approve-test-'));
    const taskDir = join(testDir, 'orgs', 'dm-brain-orchestra', 'tasks');
    mkdirSync(taskDir, { recursive: true });
    writeFileSync(
      join(taskDir, 'task_111.json'),
      JSON.stringify({ id: 'task_111', title: 'Analizează', status: 'pending', agent: 'maestro', created_at: '2026-05-14T09:00:00Z' }),
    );
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('aprobă un task pending', async () => {
    const result = await runTaskTool('task_approve', { task_id: 'task_111' }, testDir);
    expect(result).toContain('aprobat');
    const updated = JSON.parse(readFileSync(join(testDir, 'orgs', 'dm-brain-orchestra', 'tasks', 'task_111.json'), 'utf-8'));
    expect(updated.status).toBe('in_progress');
  });

  it('returnează eroare dacă task-ul nu există', async () => {
    const result = await runTaskTool('task_approve', { task_id: 'task_999' }, testDir);
    expect(result).toContain('nu a fost găsit');
  });

  it('returnează eroare pentru task corupt', async () => {
    writeFileSync(join(testDir, 'orgs', 'dm-brain-orchestra', 'tasks', 'task_111.json'), '{invalid json');
    const result = await runTaskTool('task_approve', { task_id: 'task_111' }, testDir);
    expect(result).toBeTruthy();
    // The task file is corrupt — it should not crash, returns some message
  });
});

describe('task_reject', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'mcp-task-reject-test-'));
    const taskDir = join(testDir, 'orgs', 'dm-brain-orchestra', 'tasks');
    mkdirSync(taskDir, { recursive: true });
    writeFileSync(
      join(taskDir, 'task_111.json'),
      JSON.stringify({ id: 'task_111', title: 'Analizează', status: 'pending', agent: 'maestro', created_at: '2026-05-14T09:00:00Z' }),
    );
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('respinge un task cu motiv', async () => {
    const result = await runTaskTool('task_reject', { task_id: 'task_111', reason: 'Nu e prioritar' }, testDir);
    expect(result).toContain('respins');
    const updated = JSON.parse(readFileSync(join(testDir, 'orgs', 'dm-brain-orchestra', 'tasks', 'task_111.json'), 'utf-8'));
    expect(updated.status).toBe('cancelled');
    expect(updated.reject_reason).toBe('Nu e prioritar');
  });

  it('respinge un task fara motiv', async () => {
    const result = await runTaskTool('task_reject', { task_id: 'task_111' }, testDir);
    expect(result).toContain('respins');
    const updated = JSON.parse(readFileSync(join(testDir, 'orgs', 'dm-brain-orchestra', 'tasks', 'task_111.json'), 'utf-8'));
    expect(updated.status).toBe('cancelled');
    expect(updated.reject_reason).toBeUndefined();
  });

  it('returnează eroare dacă task-ul nu există', async () => {
    const result = await runTaskTool('task_reject', { task_id: 'task_999' }, testDir);
    expect(result).toContain('nu a fost găsit');
  });
});

describe('task_create', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'mcp-task-create-test-'));
    const configDir = join(testDir, 'config');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, 'enabled-agents.json'),
      JSON.stringify({ maestro: { org: 'dm-brain-orchestra', enabled: true } }),
    );
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('creează un task și îl salvează în org-ul corect', async () => {
    const result = await runTaskTool('task_create', { agent: 'maestro', title: 'Test task', description: 'Descriere test' }, testDir);
    expect(result).toContain('creat');
    expect(result).toContain('Test task');
    const taskDir = join(testDir, 'orgs', 'dm-brain-orchestra', 'tasks');
    const files = (await import('fs')).readdirSync(taskDir);
    expect(files.length).toBe(1);
    const task = JSON.parse((await import('fs')).readFileSync(join(taskDir, files[0]), 'utf-8'));
    expect(task.title).toBe('Test task');
    expect(task.status).toBe('pending');
  });

  it('fallback la org default dacă config este corupt', async () => {
    writeFileSync(join(testDir, 'config', 'enabled-agents.json'), 'INVALID JSON{{');
    const result = await runTaskTool('task_create', { agent: 'maestro', title: 'Test', description: 'Desc' }, testDir);
    expect(result).toBeTruthy(); // should not crash, uses fallback org or returns error
  });
});
