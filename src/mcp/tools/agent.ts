import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { listAgents } from '../../bus/agents.js';
import { sendMessage } from '../../bus/message.js';
import { resolvePaths } from '../../utils/paths.js';
import { pollForReply } from '../poller.js';
import { randomString } from '../../utils/random.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const AGENT_TOOLS: Tool[] = [
  {
    name: 'agent_send',
    description: 'Trimite un mesaj unui agent și așteaptă răspunsul (timeout 120s). Funcționează pentru orice agent activ inclusiv maestro/orchestrator.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'Numele agentului (ex: maestro)' },
        message: { type: 'string', description: 'Mesajul de trimis' },
      },
      required: ['agent', 'message'],
    },
  },
  {
    name: 'agent_list',
    description: 'Listează toți agenții din sistem cu status (running/stopped).',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'agent_status',
    description: 'Returnează statusul detaliat al unui agent: task curent, uptime, last heartbeat.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'Numele agentului' },
      },
      required: ['agent'],
    },
  },
];

export async function runAgentTool(
  name: string,
  args: Record<string, unknown>,
  ctxRoot?: string,
): Promise<string> {
  const root = ctxRoot ?? join(homedir(), '.cortextos', 'default');

  if (name === 'agent_list') {
    const agents = listAgents(root);
    if (agents.length === 0) return 'Niciun agent configurat.';
    return agents
      .map(a => `- ${a.name} (org: ${a.org ?? '—'}, enabled: ${a.enabled ? 'da' : 'nu'})`)
      .join('\n');
  }

  if (name === 'agent_status') {
    const agentName = args.agent as string;
    const heartbeatPath = join(root, 'state', agentName, 'heartbeat.json');
    if (!existsSync(heartbeatPath)) {
      return `Agentul "${agentName}" nu are heartbeat — poate nu rulează.`;
    }
    let hb: Record<string, unknown>;
    try {
      hb = JSON.parse(readFileSync(heartbeatPath, 'utf-8'));
    } catch {
      return `Agentul "${agentName}" are heartbeat corupt.`;
    }
    return [
      `Agent: ${hb.agent}`,
      `Status: ${hb.status}`,
      `Task curent: ${hb.current_task || '—'}`,
      `Mod: ${hb.mode}`,
      `Ultimul heartbeat: ${hb.last_heartbeat}`,
    ].join('\n');
  }

  if (name === 'agent_send') {
    const agentName = args.agent as string;
    const message = args.message as string;
    const replyId = `mcp-${randomString(8)}`;
    const agentPaths = { ...resolvePaths(agentName, 'default'), ctxRoot: root };

    sendMessage(agentPaths, 'cli', agentName, 'urgent', message, replyId);

    const cliInboxDir = join(root, 'inbox', 'cli');
    const reply = await pollForReply(cliInboxDir, replyId);

    if (reply === null) {
      return `Agentul "${agentName}" nu a răspuns în 120 de secunde. Verifică statusul cu agent_status.`;
    }
    return reply;
  }

  return `Tool necunoscut: ${name}`;
}
