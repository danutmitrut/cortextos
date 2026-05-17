import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const tgSend = vi.fn().mockResolvedValue({ result: { message_id: 1 } });
const tgPhoto = vi.fn().mockResolvedValue({ result: { message_id: 1 } });
const tgDoc = vi.fn().mockResolvedValue({ result: { message_id: 1 } });
vi.mock('../../../src/telegram/api.js', () => ({
  TelegramAPI: class {
    constructor(_t: string) {}
    sendMessage(...a: unknown[]) { return tgSend(...a); }
    sendPhoto(...a: unknown[]) { return tgPhoto(...a); }
    sendDocument(...a: unknown[]) { return tgDoc(...a); }
  },
}));

const slackSend = vi.fn().mockResolvedValue('ts-1');
const slackUpload = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../src/slack/api.js', () => ({
  SlackAPI: class {
    constructor(_t: string) {}
    sendMessage(...a: unknown[]) { return slackSend(...a); }
    uploadFile(...a: unknown[]) { return slackUpload(...a); }
  },
}));

import { busCommand } from '../../../src/cli/bus';

let tempCtx: string;
let tempCwd: string;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  tempCtx = mkdtempSync(join(tmpdir(), 'shim-ctx-'));
  tempCwd = mkdtempSync(join(tmpdir(), 'shim-cwd-'));
  mkdirSync(join(tempCtx, 'logs', 'test-agent'), { recursive: true });
  for (const k of ['CTX_ROOT', 'CTX_AGENT_NAME', 'CTX_TELEGRAM_DISABLED', 'SLACK_BOT_TOKEN', 'SLACK_CHANNEL_ID', 'BOT_TOKEN']) {
    saved[k] = process.env[k];
  }
  process.env.CTX_ROOT = tempCtx;
  process.env.CTX_AGENT_NAME = 'test-agent';
  process.env.CTX_TELEGRAM_DISABLED = '1';
  process.env.SLACK_BOT_TOKEN = 'xoxb-test';
  process.env.SLACK_CHANNEL_ID = 'C999';
  process.env.BOT_TOKEN = 'fake-token';
  process.chdir(tempCwd);
  tgSend.mockClear(); tgPhoto.mockClear(); tgDoc.mockClear();
  slackSend.mockClear(); slackUpload.mockClear();
});

afterEach(() => {
  for (const k of Object.keys(saved)) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k] as string;
  }
  rmSync(tempCtx, { recursive: true, force: true });
  rmSync(tempCwd, { recursive: true, force: true });
});

describe('send-telegram Slack shim (CTX_TELEGRAM_DISABLED)', () => {
  it('routes text to Slack sendMessage, never to Telegram', async () => {
    await busCommand.parseAsync(['send-telegram', '12345', 'hello world'], { from: 'user' });
    expect(slackSend).toHaveBeenCalledTimes(1);
    expect(slackSend.mock.calls[0][0]).toBe('C999');
    expect(slackSend.mock.calls[0][1]).toBe('hello world');
    expect(tgSend).not.toHaveBeenCalled();
  });

  it('routes --image to Slack uploadFile, never to Telegram', async () => {
    const img = join(tempCwd, 'pic.png');
    writeFileSync(img, Buffer.from([1, 2, 3]));
    await busCommand.parseAsync(['send-telegram', '12345', 'caption', '--image', img], { from: 'user' });
    expect(slackUpload).toHaveBeenCalledTimes(1);
    expect(slackUpload.mock.calls[0][0]).toBe('C999');
    expect(slackUpload.mock.calls[0][1]).toBe(img);
    expect(slackUpload.mock.calls[0][2]).toBe('caption');
    expect(tgPhoto).not.toHaveBeenCalled();
  });

  it('routes --file to Slack uploadFile, never to Telegram', async () => {
    const doc = join(tempCwd, 'report.pdf');
    writeFileSync(doc, Buffer.from([1, 2, 3]));
    await busCommand.parseAsync(['send-telegram', '12345', 'caption', '--file', doc], { from: 'user' });
    expect(slackUpload).toHaveBeenCalledTimes(1);
    expect(slackUpload.mock.calls[0][0]).toBe('C999');
    expect(slackUpload.mock.calls[0][1]).toBe(doc);
    expect(slackUpload.mock.calls[0][2]).toBe('caption');
    expect(tgDoc).not.toHaveBeenCalled();
  });

  it('still normalizes literal \\n before Slack send', async () => {
    await busCommand.parseAsync(['send-telegram', '12345', 'a\\nb'], { from: 'user' });
    expect(slackSend.mock.calls[0][1]).toBe('a\nb');
  });
});
