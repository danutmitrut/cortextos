import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const uploadV2Mock = vi.fn().mockResolvedValue({ ok: true });
vi.mock('@slack/web-api', () => {
  const WebClient = function (this: { chat: unknown; files: unknown }) {
    this.chat = { postMessage: vi.fn().mockResolvedValue({ ok: true, ts: '1' }) };
    this.files = { uploadV2: (...a: unknown[]) => uploadV2Mock(...a) };
  };
  return { WebClient };
});

import { SlackAPI } from '../../../src/slack/api';

describe('SlackAPI.uploadFile', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'slackup-'));
    uploadV2Mock.mockClear();
    uploadV2Mock.mockResolvedValue({ ok: true });
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('uploads with channel_id, filename and caption', async () => {
    const f = join(tmp, 'pic.png');
    writeFileSync(f, Buffer.from([1, 2, 3]));
    const api = new SlackAPI('xoxb-token');
    await api.uploadFile('C123', f, 'my caption');
    expect(uploadV2Mock).toHaveBeenCalledTimes(1);
    const arg = uploadV2Mock.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.channel_id).toBe('C123');
    expect(arg.filename).toBe('pic.png');
    expect(arg.initial_comment).toBe('my caption');
  });

  it('omits initial_comment when caption empty', async () => {
    const f = join(tmp, 'x.txt');
    writeFileSync(f, 'hi');
    const api = new SlackAPI('xoxb-token');
    await api.uploadFile('C1', f);
    const arg = uploadV2Mock.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.initial_comment).toBeUndefined();
  });

  it('throws when Slack returns not ok', async () => {
    uploadV2Mock.mockResolvedValueOnce({ ok: false });
    const f = join(tmp, 'x.txt');
    writeFileSync(f, 'hi');
    const api = new SlackAPI('xoxb-token');
    await expect(api.uploadFile('C1', f)).rejects.toThrow('file upload failed');
  });

  it('propagates a filesystem error when the file does not exist', async () => {
    const api = new SlackAPI('xoxb-token');
    await expect(api.uploadFile('C1', join(tmp, 'does-not-exist.png'), 'cap')).rejects.toThrow();
    expect(uploadV2Mock).not.toHaveBeenCalled();
  });
});
