import { describe, it, expect, vi, beforeEach } from 'vitest';

type EventHandler = (data: { event: any; ack: () => Promise<void> }) => Promise<void>;
const registeredHandlers: Record<string, EventHandler[]> = {};

const { mockStart, mockDisconnect, mockOn } = vi.hoisted(() => {
  const mockStart = vi.fn().mockResolvedValue(undefined);
  const mockDisconnect = vi.fn().mockResolvedValue(undefined);
  const mockOn = vi.fn();
  return { mockStart, mockDisconnect, mockOn };
});

vi.mock('@slack/socket-mode', () => ({
  SocketModeClient: vi.fn().mockImplementation(function () {
    return {
      on: mockOn,
      start: mockStart,
      disconnect: mockDisconnect,
    };
  }),
  LogLevel: { ERROR: 'error' },
}));

import { SlackPoller } from '../../../src/slack/poller';

async function emitMessage(event: any): Promise<void> {
  const ack = vi.fn().mockResolvedValue(undefined);
  const handlers = registeredHandlers['message'] || [];
  for (const h of handlers) {
    await h({ event, ack });
  }
}

describe('SlackPoller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(registeredHandlers).forEach(k => delete registeredHandlers[k]);
    // Re-apply implementation after clearAllMocks (which resets mockImplementation too)
    mockStart.mockResolvedValue(undefined);
    mockDisconnect.mockResolvedValue(undefined);
    mockOn.mockImplementation((event: string, handler: EventHandler) => {
      registeredHandlers[event] = registeredHandlers[event] || [];
      registeredHandlers[event].push(handler);
    });
  });

  it('inregistreaza handler si il apeleaza la mesaj', async () => {
    const poller = new SlackPoller('xapp-test-token');
    const handler = vi.fn();
    poller.onMessage(handler);
    await poller.start();

    await emitMessage({ type: 'message', user: 'U123', text: 'hello', channel: 'C456', ts: '123.456' });
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ user: 'U123', text: 'hello', channel: 'C456' }),
    );
  });

  it('ignora mesajele de la boturi (bot_id prezent)', async () => {
    const poller = new SlackPoller('xapp-test-token');
    const handler = vi.fn();
    poller.onMessage(handler);
    await poller.start();

    await emitMessage({ type: 'message', bot_id: 'B789', text: 'bot msg', channel: 'C456', ts: '123.456' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('continua dupa eroare de handler', async () => {
    const poller = new SlackPoller('xapp-test-token');
    const badHandler = vi.fn().mockImplementation(() => { throw new Error('handler boom'); });
    const goodHandler = vi.fn();
    poller.onMessage(badHandler);
    poller.onMessage(goodHandler);
    await poller.start();

    await emitMessage({ type: 'message', user: 'U123', text: 'hi', channel: 'C456', ts: '1.2' });
    expect(goodHandler).toHaveBeenCalled();
  });

  it('stop apeleaza disconnect', async () => {
    const poller = new SlackPoller('xapp-test-token');
    await poller.start();
    await poller.stop();
    expect(mockDisconnect).toHaveBeenCalled();
  });
});
