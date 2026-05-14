import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted garanta ca variabila e disponibila in factory-ul vi.mock (hoisted)
const { postMessage } = vi.hoisted(() => {
  return { postMessage: vi.fn() };
});

vi.mock('@slack/web-api', () => {
  return {
    WebClient: vi.fn().mockImplementation(function () {
      return { chat: { postMessage } };
    }),
  };
});

import { SlackAPI } from '../../../src/slack/api';

describe('SlackAPI', () => {
  beforeEach(() => {
    postMessage.mockReset();
  });

  it('sendMessage trimite mesaj si returneaza ts', async () => {
    postMessage.mockResolvedValueOnce({ ok: true, ts: '1234567890.123456' });
    const api = new SlackAPI('xoxb-test-token');
    const ts = await api.sendMessage('C0123456', 'Hello world');
    expect(postMessage).toHaveBeenCalledWith({ channel: 'C0123456', text: 'Hello world' });
    expect(ts).toBe('1234567890.123456');
  });

  it('sendMessage arunca eroare cand ok=false', async () => {
    postMessage.mockResolvedValueOnce({ ok: false, error: 'channel_not_found' });
    const api = new SlackAPI('xoxb-test-token');
    await expect(api.sendMessage('CINVALID', 'text')).rejects.toThrow('channel_not_found');
  });

  it('sendMessage arunca eroare la network failure', async () => {
    postMessage.mockRejectedValueOnce(new Error('network error'));
    const api = new SlackAPI('xoxb-test-token');
    await expect(api.sendMessage('C0123456', 'text')).rejects.toThrow('network error');
  });
});
