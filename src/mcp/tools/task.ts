import { existsSync, mkdirSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { atomicWriteSync } from '../../utils/atomic.js';
import { randomString } from '../../utils/random.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const TASK_TOOLS: Tool[] = [
  {
    name: 'task_list',
    description: 'Listează task-urile din sistem. Poate filtra după status sau agent.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Filtrează după status (pending, in_progress, completed, blocked, cancelled)',
        },
        agent: {
          type: 'string',
          description: 'Filtrează după numele agentului',
        },
      },
      required: [],
    },
  },
  {
    name: 'task_approve',
    description: 'Aprobă un task pending - trece statusul în in_progress.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          description: 'ID-ul task-ului de aprobat',
        },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'task_reject',
    description: 'Respinge un task - trece statusul în cancelled cu un motiv.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          description: 'ID-ul task-ului de respins',
        },
        reason: {
          type: 'string',
          description: 'Motivul respingerii (opțional)',
        },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'task_create',
    description: 'Creează un task nou pentru un agent, salvat în org-ul agentului.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: {
          type: 'string',
          description: 'Numele agentului căruia i se asignează task-ul',
        },
        title: {
          type: 'string',
          description: 'Titlul task-ului',
        },
        description: {
          type: 'string',
          description: 'Descrierea task-ului (opțional)',
        },
      },
      required: ['agent', 'title'],
    },
  },
];

/**
 * Scans orgs/<org>/tasks/{taskId}.json across all orgs and returns the first match.
 */
function findTaskFile(root: string, taskId: string): string | null {
  const orgsDir = join(root, 'orgs');
  if (!existsSync(orgsDir)) return null;
  try {
    for (const entry of readdirSync(orgsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = join(orgsDir, entry.name, 'tasks', `${taskId}.json`);
      if (existsSync(candidate)) return candidate;
    }
  } catch {
    return null;
  }
  return null;
}

export async function runTaskTool(
  name: string,
  args: Record<string, unknown>,
  ctxRoot?: string,
): Promise<string> {
  const root = ctxRoot ?? join(homedir(), '.cortextos', 'default');

  if (name === 'task_list') {
    const statusFilter = typeof args.status === 'string' ? args.status : undefined;
    const agentFilter = typeof args.agent === 'string' ? args.agent : undefined;

    const orgsDir = join(root, 'orgs');
    if (!existsSync(orgsDir)) return 'Niciun task gasit.';

    const results: string[] = [];
    for (const entry of readdirSync(orgsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const taskDir = join(orgsDir, entry.name, 'tasks');
      if (!existsSync(taskDir)) continue;
      for (const file of readdirSync(taskDir).filter(f => f.endsWith('.json'))) {
        try {
          const task = JSON.parse(readFileSync(join(taskDir, file), 'utf-8'));
          if (statusFilter && task.status !== statusFilter) continue;
          if (agentFilter && task.agent !== agentFilter) continue;
          results.push(`[${task.status}] ${task.title} (id: ${task.id}, agent: ${task.agent ?? '-'})`);
        } catch {
          results.push(`(task corupt: ${file})`);
        }
      }
    }

    return results.length > 0 ? results.join('\n') : 'Niciun task gasit.';
  }

  if (name === 'task_approve') {
    const taskId = args.task_id;
    if (typeof taskId !== 'string' || taskId.trim() === '') {
      return 'Parametrul "task_id" lipseste sau nu este valid.';
    }

    const filePath = findTaskFile(root, taskId);
    if (!filePath) {
      return `Task-ul "${taskId}" nu a fost găsit.`;
    }

    let task: Record<string, unknown>;
    try {
      task = JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch {
      return `Task-ul "${taskId}" are date corupte.`;
    }

    task.status = 'in_progress';
    atomicWriteSync(filePath, JSON.stringify(task, null, 2));
    return `Task-ul "${taskId}" a fost aprobat - status: in_progress.`;
  }

  if (name === 'task_reject') {
    const taskId = args.task_id;
    if (typeof taskId !== 'string' || taskId.trim() === '') {
      return 'Parametrul "task_id" lipseste sau nu este valid.';
    }

    const filePath = findTaskFile(root, taskId);
    if (!filePath) {
      return `Task-ul "${taskId}" nu a fost găsit.`;
    }

    let task: Record<string, unknown>;
    try {
      task = JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch {
      return `Task-ul "${taskId}" are date corupte.`;
    }

    task.status = 'cancelled';
    if (typeof args.reason === 'string' && args.reason.trim() !== '') {
      task.reject_reason = args.reason;
    }
    atomicWriteSync(filePath, JSON.stringify(task, null, 2));
    return `Task-ul "${taskId}" a fost respins - status: cancelled.`;
  }

  if (name === 'task_create') {
    const agentName = args.agent;
    const title = args.title;
    if (typeof agentName !== 'string' || agentName.trim() === '') {
      return 'Parametrul "agent" lipseste sau nu este valid.';
    }
    if (typeof title !== 'string' || title.trim() === '') {
      return 'Parametrul "title" lipseste sau nu este valid.';
    }

    // Resolve org from enabled-agents.json
    const agentsConfigPath = join(root, 'config', 'enabled-agents.json');
    if (!existsSync(agentsConfigPath)) {
      return 'Fisierul config/enabled-agents.json nu exista. Nu se poate determina org-ul agentului.';
    }

    let agentsConfig: Record<string, { org: string; enabled: boolean }>;
    try {
      agentsConfig = JSON.parse(readFileSync(agentsConfigPath, 'utf-8'));
    } catch {
      return 'Fisierul config/enabled-agents.json este corupt.';
    }

    const agentEntry = agentsConfig[agentName];
    if (!agentEntry) {
      return `Agentul "${agentName}" nu este configurat in enabled-agents.json.`;
    }
    const org = agentEntry?.org;
    if (typeof org !== 'string' || org.trim() === '') {
      return `Agentul "${agentName}" nu are un org valid in enabled-agents.json.`;
    }

    const taskId = `task_${randomString(8)}`;
    const now = new Date().toISOString();
    const task = {
      id: taskId,
      title,
      ...(typeof args.description === 'string' && args.description.trim() !== ''
        ? { description: args.description }
        : {}),
      agent: agentName,
      status: 'pending',
      created_at: now,
      org,
    };

    const taskDir = join(root, 'orgs', org, 'tasks');
    const filePath = join(taskDir, `${taskId}.json`);
    mkdirSync(taskDir, { recursive: true });
    atomicWriteSync(filePath, JSON.stringify(task, null, 2));

    return `Task-ul "${title}" a fost creat cu succes (id: ${taskId}, agent: ${agentName}, org: ${org}).`;
  }

  return `Tool necunoscut: ${name}`;
}
