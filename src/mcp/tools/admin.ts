import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { spawnSync } from 'child_process';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const ADMIN_TOOLS: Tool[] = [
  {
    name: 'admin_logs',
    description: 'Citește log-urile unui agent via pm2. Returnează ultimele N linii (implicit 50).',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'Numele agentului (procesul pm2)' },
        lines: { type: 'number', description: 'Numărul de linii de returnat (implicit 50)' },
      },
      required: ['agent'],
    },
  },
  {
    name: 'admin_crons',
    description: 'Citește cronogramele definite în config.json al unui agent.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'Numele agentului' },
      },
      required: ['agent'],
    },
  },
  {
    name: 'admin_restart',
    description: 'Repornește un agent via CLI-ul cortextos.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'Numele agentului de repornit' },
      },
      required: ['agent'],
    },
  },
  {
    name: 'admin_metrics',
    description: 'Citește metricile (heartbeat) unui agent sau ale tuturor agenților.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'Numele agentului (opțional - dacă lipsește, returnează toți)' },
      },
      required: [],
    },
  },
];

/**
 * Scans frameworkRoot/orgs/STAR/agents/agentName/config.json to find agent config.
 * Returns the path if found, null otherwise.
 */
function findAgentConfigPath(frameworkRoot: string, agentName: string): string | null {
  const orgsDir = join(frameworkRoot, 'orgs');
  if (!existsSync(orgsDir)) return null;
  try {
    for (const entry of readdirSync(orgsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = join(orgsDir, entry.name, 'agents', agentName, 'config.json');
      if (existsSync(candidate)) return candidate;
    }
  } catch {
    return null;
  }
  return null;
}

export async function runAdminTool(
  name: string,
  args: Record<string, unknown>,
  ctxRoot?: string,
): Promise<string> {
  const root = ctxRoot ?? join(homedir(), '.cortextos', 'default');
  const frameworkRoot = process.env.CTX_FRAMEWORK_ROOT ?? root;

  if (name === 'admin_logs') {
    const agentName = args.agent;
    if (typeof agentName !== 'string' || agentName.trim() === '') {
      return 'Parametrul "agent" lipseste sau nu este valid.';
    }

    const lines = typeof args.lines === 'number' && args.lines > 0 ? Math.floor(args.lines) : 50;

    // Check if pm2 is available
    const pm2Check = spawnSync('pm2', ['--version'], { encoding: 'utf-8' });
    if (pm2Check.error) {
      return 'pm2 nu este disponibil pe acest sistem. Instaleaza-l cu: npm install -g pm2';
    }

    const result = spawnSync('pm2', ['logs', agentName, '--lines', String(lines), '--nostream'], {
      encoding: 'utf-8',
      timeout: 15000,
    });

    if (result.error) {
      return `Eroare la citirea log-urilor pentru "${agentName}": ${result.error.message}`;
    }

    const output = (result.stdout ?? '') + (result.stderr ?? '');
    if (!output.trim()) {
      return `Nu exista log-uri pentru agentul "${agentName}".`;
    }

    return output.trim();
  }

  if (name === 'admin_crons') {
    const agentName = args.agent;
    if (typeof agentName !== 'string' || agentName.trim() === '') {
      return 'Parametrul "agent" lipseste sau nu este valid.';
    }

    const configPath = findAgentConfigPath(frameworkRoot, agentName);
    if (!configPath) {
      return `Agentul "${agentName}" nu a fost găsit in ${frameworkRoot}/orgs/*/agents/.`;
    }

    let config: Record<string, unknown>;
    try {
      config = JSON.parse(readFileSync(configPath, 'utf-8'));
    } catch {
      return `Config-ul agentului "${agentName}" este corupt sau nu poate fi citit.`;
    }

    const crons = config.crons;
    if (!Array.isArray(crons) || crons.length === 0) {
      return `Agentul "${agentName}" nu are cronograme definite.`;
    }

    const lines = crons.map((c: Record<string, unknown>) => {
      const schedule = typeof c.cron === 'string' ? c.cron : (typeof c.interval === 'string' ? c.interval : '-');
      return `- ${c.name} (${c.type ?? 'recurring'}) | schedule: ${schedule} | prompt: ${c.prompt ?? '-'}`;
    });

    return `Cronograme pentru agentul "${agentName}" (${crons.length}):\n${lines.join('\n')}`;
  }

  if (name === 'admin_restart') {
    const agentName = args.agent;
    if (typeof agentName !== 'string' || agentName.trim() === '') {
      return 'Parametrul "agent" lipseste sau nu este valid.';
    }

    const cliPath = join(frameworkRoot, 'dist', 'cli.js');
    if (!existsSync(cliPath)) {
      return `CLI-ul cortextos nu a fost găsit la ${cliPath}. Ruleaza "npm run build" in directorul cortextos.`;
    }

    const result = spawnSync('node', [cliPath, 'restart', agentName], {
      encoding: 'utf-8',
      timeout: 30000,
    });

    if (result.error) {
      return `Eroare la repornirea agentului "${agentName}": ${result.error.message}`;
    }

    if (result.status !== 0) {
      const errOutput = (result.stderr ?? '').trim();
      return `Repornirea agentului "${agentName}" a esuat (exit ${result.status ?? 'unknown'})${errOutput ? `: ${errOutput}` : '.'}`;
    }

    return `Agentul "${agentName}" a fost repornit cu succes.`;
  }

  if (name === 'admin_metrics') {
    const agentName = typeof args.agent === 'string' && args.agent.trim() !== '' ? args.agent.trim() : null;
    const stateDir = join(root, 'state');

    if (!existsSync(stateDir)) {
      return 'Directorul state nu exista. Niciun agent nu a scris heartbeat.';
    }

    if (agentName !== null) {
      // Single agent
      const heartbeatPath = join(stateDir, agentName, 'heartbeat.json');
      if (!existsSync(heartbeatPath)) {
        return `Agentul "${agentName}" nu are heartbeat - poate nu ruleaza.`;
      }
      let hb: Record<string, unknown>;
      try {
        hb = JSON.parse(readFileSync(heartbeatPath, 'utf-8'));
      } catch {
        return `Heartbeat-ul agentului "${agentName}" este corupt.`;
      }
      return [
        `Agent: ${hb.agent}`,
        `Status: ${hb.status}`,
        `Task curent: ${hb.current_task || '-'}`,
        `Mod: ${hb.mode}`,
        `Ultimul heartbeat: ${hb.last_heartbeat}`,
      ].join('\n');
    }

    // All agents
    let agents: string[];
    try {
      agents = readdirSync(stateDir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name);
    } catch {
      return 'Eroare la citirea directorului state.';
    }

    if (agents.length === 0) {
      return 'Niciun agent nu a scris heartbeat.';
    }

    return agents.map(agent => {
      const hbPath = join(stateDir, agent, 'heartbeat.json');
      if (!existsSync(hbPath)) return `${agent}: fara heartbeat`;
      try {
        const hb = JSON.parse(readFileSync(hbPath, 'utf-8'));
        return `${agent}: ${hb.status} | task: ${hb.current_task || '-'} | ${hb.last_heartbeat}`;
      } catch {
        return `${agent}: heartbeat corupt`;
      }
    }).join('\n');
  }

  return `Tool necunoscut: ${name}`;
}
