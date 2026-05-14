/**
 * Tests for `cortextos bus send-user <message>`:
 * - Telegram-only: sends via Telegram when only BOT_TOKEN+CHAT_ID are set
 * - Slack-only: sends via Slack when only SLACK_BOT_TOKEN+SLACK_CHANNEL_ID are set
 * - Both: sends via both channels when all four vars are set
 * - Neither: exits with code 1 when no channels are configured
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// vi.hoisted ensures mock refs are available inside vi.mock factory closures
const { sendMessageTelegram, sendMessageSlack } = vi.hoisted(() => {
  return {
    sendMessageTelegram: vi.fn().mockResolvedValue({ result: { message_id: 42 } }),
    sendMessageSlack: vi.fn().mockResolvedValue('1234567890.000001'),
  };
});

vi.mock('../../../src/telegram/api.js', () => ({
  TelegramAPI: vi.fn().mockImplementation(function () {
    return { sendMessage: sendMessageTelegram };
  }),
}));

vi.mock('../../../src/slack/api.js', () => ({
  SlackAPI: vi.fn().mockImplementation(function () {
    return { sendMessage: sendMessageSlack };
  }),
}));

// Stub logging helpers so tests do not require a real filesystem structure
vi.mock('../../../src/telegram/logging.js', () => ({
  logOutboundMessage: vi.fn(),
  cacheLastSent: vi.fn(),
}));

vi.mock('../../../src/slack/logging.js', () => ({
  logOutboundSlack: vi.fn(),
  logInboundSlack: vi.fn(),
}));

import { busCommand } from '../../../src/cli/bus';

let tempCtx: string;
let tempAgentDir: string;
let originalCwd: string;
let originalCtxRoot: string | undefined;
let originalAgentName: string | undefined;
let originalBotToken: string | undefined;
let originalChatId: string | undefined;
let originalSlackBotToken: string | undefined;
let originalSlackChannelId: string | undefined;

function writeAgentEnv(vars: Record<string, string>): void {
  const lines = Object.entries(vars).map(([k, v]) => `${k}=${v}`).join('\n');
  writeFileSync(join(tempAgentDir, '.env'), lines + '\n', 'utf-8');
}

beforeEach(() => {
  tempCtx = mkdtempSync(join(tmpdir(), 'send-user-ctx-'));
  tempAgentDir = mkdtempSync(join(tmpdir(), 'send-user-agent-'));
  mkdirSync(join(tempCtx, 'logs', 'test-agent'), { recursive: true });

  originalCwd = process.cwd();
  originalCtxRoot = process.env.CTX_ROOT;
  originalAgentName = process.env.CTX_AGENT_NAME;
  originalBotToken = process.env.BOT_TOKEN;
  originalChatId = process.env.CHAT_ID;
  originalSlackBotToken = process.env.SLACK_BOT_TOKEN;
  originalSlackChannelId = process.env.SLACK_CHANNEL_ID;

  // Set common env vars; individual tests override via agent .env file
  process.env.CTX_ROOT = tempCtx;
  process.env.CTX_AGENT_NAME = 'test-agent';
  process.env.CTX_AGENT_DIR = tempAgentDir;
  delete process.env.BOT_TOKEN;
  delete process.env.CHAT_ID;
  delete process.env.SLACK_BOT_TOKEN;
  delete process.env.SLACK_CHANNEL_ID;

  sendMessageTelegram.mockClear();
  sendMessageSlack.mockClear();
});

afterEach(() => {
  process.chdir(originalCwd);
  if (originalCtxRoot === undefined) delete process.env.CTX_ROOT;
  else process.env.CTX_ROOT = originalCtxRoot;
  if (originalAgentName === undefined) delete process.env.CTX_AGENT_NAME;
  else process.env.CTX_AGENT_NAME = originalAgentName;
  if (originalBotToken === undefined) delete process.env.BOT_TOKEN;
  else process.env.BOT_TOKEN = originalBotToken;
  if (originalChatId === undefined) delete process.env.CHAT_ID;
  else process.env.CHAT_ID = originalChatId;
  if (originalSlackBotToken === undefined) delete process.env.SLACK_BOT_TOKEN;
  else process.env.SLACK_BOT_TOKEN = originalSlackBotToken;
  if (originalSlackChannelId === undefined) delete process.env.SLACK_CHANNEL_ID;
  else process.env.SLACK_CHANNEL_ID = originalSlackChannelId;
  delete process.env.CTX_AGENT_DIR;

  rmSync(tempCtx, { recursive: true, force: true });
  rmSync(tempAgentDir, { recursive: true, force: true });
});

describe('send-user command', () => {
  it('Telegram-only: sends via Telegram and logs "Message sent via: telegram"', async () => {
    writeAgentEnv({
      BOT_TOKEN: 'tg-bot-token',
      CHAT_ID: '99999',
    });

    const consoleLogs: string[] = [];
    const consoleErrors: string[] = [];
    const origLog = console.log;
    const origError = console.error;
    console.log = (msg: string) => consoleLogs.push(msg);
    console.error = (msg: string) => consoleErrors.push(msg);

    try {
      await busCommand.parseAsync(['send-user', 'Hello Telegram'], { from: 'user' });
    } finally {
      console.log = origLog;
      console.error = origError;
    }

    expect(sendMessageTelegram).toHaveBeenCalledTimes(1);
    expect(sendMessageTelegram.mock.calls[0][0]).toBe('99999');
    expect(sendMessageTelegram.mock.calls[0][1]).toBe('Hello Telegram');
    expect(sendMessageSlack).not.toHaveBeenCalled();
    expect(consoleLogs.some(l => l.includes('telegram'))).toBe(true);
    expect(consoleLogs.some(l => l.includes('slack'))).toBe(false);
  });

  it('Slack-only: sends via Slack and logs "Message sent via: slack"', async () => {
    writeAgentEnv({
      SLACK_BOT_TOKEN: 'xoxb-slack-token',
      SLACK_CHANNEL_ID: 'C0SLACK001',
    });

    const consoleLogs: string[] = [];
    const consoleErrors: string[] = [];
    const origLog = console.log;
    const origError = console.error;
    console.log = (msg: string) => consoleLogs.push(msg);
    console.error = (msg: string) => consoleErrors.push(msg);

    try {
      await busCommand.parseAsync(['send-user', 'Hello Slack'], { from: 'user' });
    } finally {
      console.log = origLog;
      console.error = origError;
    }

    expect(sendMessageSlack).toHaveBeenCalledTimes(1);
    expect(sendMessageSlack.mock.calls[0][0]).toBe('C0SLACK001');
    expect(sendMessageSlack.mock.calls[0][1]).toBe('Hello Slack');
    expect(sendMessageTelegram).not.toHaveBeenCalled();
    expect(consoleLogs.some(l => l.includes('slack'))).toBe(true);
    expect(consoleLogs.some(l => l.includes('telegram'))).toBe(false);
  });

  it('Both: sends via Telegram and Slack, logs "Message sent via: telegram, slack"', async () => {
    writeAgentEnv({
      BOT_TOKEN: 'tg-bot-token',
      CHAT_ID: '99999',
      SLACK_BOT_TOKEN: 'xoxb-slack-token',
      SLACK_CHANNEL_ID: 'C0SLACK001',
    });

    const consoleLogs: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => consoleLogs.push(msg);

    try {
      await busCommand.parseAsync(['send-user', 'Hello Both'], { from: 'user' });
    } finally {
      console.log = origLog;
    }

    expect(sendMessageTelegram).toHaveBeenCalledTimes(1);
    expect(sendMessageSlack).toHaveBeenCalledTimes(1);
    expect(consoleLogs.some(l => l.includes('telegram') && l.includes('slack'))).toBe(true);
  });

  it('Neither: exits with code 1 and prints a clear error when no channels are configured', async () => {
    // Write an empty .env (no credentials)
    writeAgentEnv({});

    const consoleErrors: string[] = [];
    const origError = console.error;
    console.error = (msg: string) => consoleErrors.push(msg);

    const mockExit = vi.spyOn(process, 'exit').mockImplementation((_code?: number) => {
      throw new Error(`process.exit(${_code})`);
    });

    try {
      await expect(
        busCommand.parseAsync(['send-user', 'Hello Nobody'], { from: 'user' }),
      ).rejects.toThrow('process.exit(1)');
    } finally {
      console.error = origError;
      mockExit.mockRestore();
    }

    expect(sendMessageTelegram).not.toHaveBeenCalled();
    expect(sendMessageSlack).not.toHaveBeenCalled();
    expect(consoleErrors.some(e => e.includes('No messaging channels configured'))).toBe(true);
  });
});
