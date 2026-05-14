import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { readFileSync } from 'fs';

describe('Slack logging', () => {
  let ctxRoot: string;

  beforeEach(() => {
    ctxRoot = join(tmpdir(), `cortextos-slack-log-test-${Date.now()}`);
    mkdirSync(join(ctxRoot, 'logs', 'testagent'), { recursive: true });
  });

  it('logInboundSlack scrie in inbound-messages.jsonl', async () => {
    const { logInboundSlack } = await import('../../../src/slack/logging');
    logInboundSlack(ctxRoot, 'testagent', {
      type: 'message', user: 'U123', text: 'hello', channel: 'C456', ts: '123.456',
    });
    const content = readFileSync(join(ctxRoot, 'logs', 'testagent', 'inbound-messages.jsonl'), 'utf-8');
    const parsed = JSON.parse(content.trim());
    expect(parsed.from_slack).toBe('U123');
    expect(parsed.text).toBe('hello');
    expect(parsed.channel).toBe('C456');
    expect(parsed.agent).toBe('testagent');
  });

  it('logOutboundSlack scrie in outbound-messages.jsonl', async () => {
    const { logOutboundSlack } = await import('../../../src/slack/logging');
    logOutboundSlack(ctxRoot, 'testagent', 'C456', 'response text', '999.111');
    const content = readFileSync(join(ctxRoot, 'logs', 'testagent', 'outbound-messages.jsonl'), 'utf-8');
    const parsed = JSON.parse(content.trim());
    expect(parsed.channel).toBe('C456');
    expect(parsed.text).toBe('response text');
    expect(parsed.ts).toBe('999.111');
    expect(parsed.agent).toBe('testagent');
  });
});
