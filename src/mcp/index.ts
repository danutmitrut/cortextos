import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { AGENT_TOOLS, runAgentTool } from './tools/agent.js';
import { BUS_TOOLS, runBusTool } from './tools/bus.js';
import { TASK_TOOLS, runTaskTool } from './tools/task.js';
import { ADMIN_TOOLS, runAdminTool } from './tools/admin.js';

const ALL_TOOLS = [...AGENT_TOOLS, ...BUS_TOOLS, ...TASK_TOOLS, ...ADMIN_TOOLS];

const server = new Server(
  { name: 'cortextos', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: ALL_TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  let text: string;
  try {
    if (name.startsWith('agent_')) text = await runAgentTool(name, args as Record<string, unknown>);
    else if (name.startsWith('bus_')) text = await runBusTool(name, args as Record<string, unknown>);
    else if (name.startsWith('task_')) text = await runTaskTool(name, args as Record<string, unknown>);
    else if (name.startsWith('admin_')) text = await runAdminTool(name, args as Record<string, unknown>);
    else text = `Tool necunoscut: ${name}`;
  } catch (err) {
    text = `Eroare la ${name}: ${err instanceof Error ? err.message : String(err)}`;
  }

  return { content: [{ type: 'text', text }] };
});

void (async () => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
})();
