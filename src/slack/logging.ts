import { appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { SlackMessageEvent } from './poller.js';

export function logInboundSlack(
  ctxRoot: string,
  agentName: string,
  event: SlackMessageEvent,
): void {
  const logDir = join(ctxRoot, 'logs', agentName);
  mkdirSync(logDir, { recursive: true });
  const entry = JSON.stringify({
    from_slack: event.user,
    channel: event.channel,
    text: event.text,
    ts: event.ts,
    archived_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    agent: agentName,
  });
  appendFileSync(join(logDir, 'inbound-messages.jsonl'), entry + '\n', 'utf-8');
}

export function logOutboundSlack(
  ctxRoot: string,
  agentName: string,
  channelId: string,
  text: string,
  ts: string,
): void {
  const logDir = join(ctxRoot, 'logs', agentName);
  mkdirSync(logDir, { recursive: true });
  const entry = JSON.stringify({
    timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    agent: agentName,
    channel: channelId,
    text,
    ts,
  });
  appendFileSync(join(logDir, 'outbound-messages.jsonl'), entry + '\n', 'utf-8');
}
