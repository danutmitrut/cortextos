import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const BUS_TOOLS: Tool[] = [
  {
    name: 'bus_inbox',
    description: 'Citește inbox-ul unui agent (mesaje neprocesate). Util pentru a vedea ce mesaje așteaptă procesare.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'Numele agentului' },
      },
      required: ['agent'],
    },
  },
  {
    name: 'bus_read_all_heartbeats',
    description: 'Returnează heartbeat-urile tuturor agenților activi — status, task curent, last ping.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'bus_list_tasks',
    description: 'Listează task-urile brute din fișierele bus (neprocesate). Pentru debug și inspecție sub capotă.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'Filtrează după agent (opțional)' },
      },
      required: [],
    },
  },
];

export async function runBusTool(
  name: string,
  args: Record<string, unknown>,
  ctxRoot?: string,
): Promise<string> {
  const root = ctxRoot ?? join(homedir(), '.cortextos', 'default');

  if (name === 'bus_inbox') {
    const agentName = args.agent;
    if (typeof agentName !== 'string' || agentName.trim() === '') {
      return 'Parametrul "agent" lipsește sau nu este valid.';
    }
    const inboxDir = join(root, 'inbox', agentName);
    if (!existsSync(inboxDir)) return `Inbox-ul agentului "${agentName}" e gol sau nu există.`;

    const files = readdirSync(inboxDir).filter(f => f.endsWith('.json'));
    if (files.length === 0) return `Inbox "${agentName}" e gol.`;

    return files.map(f => {
      try {
        const msg = JSON.parse(readFileSync(join(inboxDir, f), 'utf-8'));
        return `[${msg.priority}] de la ${msg.from} @ ${msg.timestamp}:\n${msg.text}`;
      } catch {
        return `(fișier corupt: ${f})`;
      }
    }).join('\n\n');
  }

  if (name === 'bus_read_all_heartbeats') {
    const stateDir = join(root, 'state');
    if (!existsSync(stateDir)) return 'Niciun agent nu a scris heartbeat.';

    const agents = readdirSync(stateDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);

    if (agents.length === 0) return 'Niciun heartbeat disponibil.';

    return agents.map(agent => {
      const hbPath = join(stateDir, agent, 'heartbeat.json');
      if (!existsSync(hbPath)) return `${agent}: fără heartbeat`;
      try {
        const hb = JSON.parse(readFileSync(hbPath, 'utf-8'));
        return `${agent}: ${hb.status} | task: ${hb.current_task || '-'} | ${hb.last_heartbeat}`;
      } catch {
        return `${agent}: heartbeat corupt`;
      }
    }).join('\n');
  }

  if (name === 'bus_list_tasks') {
    const agent = args.agent as string | undefined;
    const orgsDir = join(root, 'orgs');
    if (!existsSync(orgsDir)) return 'Niciun task în bus.';

    const results: string[] = [];
    for (const entry of readdirSync(orgsDir, { withFileTypes: true }).filter(e => e.isDirectory())) {
      const org = entry.name;
      const taskDir = join(orgsDir, org, 'tasks');
      if (!existsSync(taskDir)) continue;
      for (const file of readdirSync(taskDir).filter(f => f.endsWith('.json'))) {
        try {
          const task = JSON.parse(readFileSync(join(taskDir, file), 'utf-8'));
          if (agent && task.agent !== agent) continue;
          results.push(`[${task.status}] ${task.title} — agent: ${task.agent ?? '—'}`);
        } catch {
          results.push(`(task corupt: ${file})`);
        }
      }
    }

    return results.length > 0 ? results.join('\n') : 'Niciun task în bus.';
  }

  return `Tool necunoscut: ${name}`;
}
