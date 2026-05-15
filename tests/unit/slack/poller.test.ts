import { describe, it, expect, vi, beforeEach } from 'vitest';

type EventHandler = (data: { event: any; ack: () => Promise<void> }) => Promise<void>;
const registeredHandlers: Record<string, EventHandler[]> = {};

const { mockStart, mockDisconnect, mockOn, mockConversationsHistory } = vi.hoisted(() => {
  const mockStart = vi.fn().mockResolvedValue(undefined);
  const mockDisconnect = vi.fn().mockResolvedValue(undefined);
  const mockOn = vi.fn();
  const mockConversationsHistory = vi.fn().mockResolvedValue({ messages: [] });
  return { mockStart, mockDisconnect, mockOn, mockConversationsHistory };
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

vi.mock('@slack/web-api', () => ({
  WebClient: vi.fn().mockImplementation(function () {
    return {
      conversations: {
        history: mockConversationsHistory,
      },
    };
  }),
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
    const poller = new SlackPoller('xapp-test-token', 'xoxb-test-token');
    const handler = vi.fn();
    poller.onMessage(handler);
    await poller.start();

    await emitMessage({ type: 'message', user: 'U123', text: 'hello', channel: 'C456', ts: '123.456' });
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ user: 'U123', text: 'hello', channel: 'C456' }),
    );
  });

  it('ignora mesajele de la boturi (bot_id prezent)', async () => {
    const poller = new SlackPoller('xapp-test-token', 'xoxb-test-token');
    const handler = vi.fn();
    poller.onMessage(handler);
    await poller.start();

    await emitMessage({ type: 'message', bot_id: 'B789', text: 'bot msg', channel: 'C456', ts: '123.456' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('continua dupa eroare de handler', async () => {
    const poller = new SlackPoller('xapp-test-token', 'xoxb-test-token');
    const badHandler = vi.fn().mockImplementation(() => { throw new Error('handler boom'); });
    const goodHandler = vi.fn();
    poller.onMessage(badHandler);
    poller.onMessage(goodHandler);
    await poller.start();

    await emitMessage({ type: 'message', user: 'U123', text: 'hi', channel: 'C456', ts: '1.2' });
    expect(goodHandler).toHaveBeenCalled();
  });

  it('stop apeleaza disconnect', async () => {
    const poller = new SlackPoller('xapp-test-token', 'xoxb-test-token');
    await poller.start();
    await poller.stop();
    expect(mockDisconnect).toHaveBeenCalled();
  });

  describe('fetchHistory', () => {
    it('returneaza mesajele utilizatorilor in ordine cronologica', async () => {
      mockConversationsHistory.mockResolvedValue({
        messages: [
          { type: 'message', user: 'U123', text: 'mesaj nou', ts: '200.0' },
          { type: 'message', user: 'U123', text: 'mesaj vechi', ts: '100.0' },
        ],
      });
      const poller = new SlackPoller('xapp-test-token', 'xoxb-test-token');
      const msgs = await poller.fetchHistory('C456', 50);
      expect(msgs).toHaveLength(2);
      expect(msgs[0].ts).toBe('100.0'); // oldest first
      expect(msgs[1].ts).toBe('200.0');
      expect(mockConversationsHistory).toHaveBeenCalledWith({ channel: 'C456', oldest: '50', limit: 20 });
    });

    it('filtreaza mesajele de la boturi', async () => {
      mockConversationsHistory.mockResolvedValue({
        messages: [
          { type: 'message', user: 'U123', text: 'om', ts: '100.0' },
          { type: 'message', bot_id: 'B789', text: 'bot', ts: '101.0' },
        ],
      });
      const poller = new SlackPoller('xapp-test-token', 'xoxb-test-token');
      const msgs = await poller.fetchHistory('C456', 50);
      expect(msgs).toHaveLength(1);
      expect(msgs[0].text).toBe('om');
    });

    it('returneaza lista goala daca nu exista mesaje', async () => {
      mockConversationsHistory.mockResolvedValue({ messages: [] });
      const poller = new SlackPoller('xapp-test-token', 'xoxb-test-token');
      const msgs = await poller.fetchHistory('C456', 50);
      expect(msgs).toHaveLength(0);
    });

    it('adauga channel la fiecare mesaj', async () => {
      mockConversationsHistory.mockResolvedValue({
        messages: [{ type: 'message', user: 'U123', text: 'hi', ts: '100.0' }],
      });
      const poller = new SlackPoller('xapp-test-token', 'xoxb-test-token');
      const msgs = await poller.fetchHistory('C999', 50);
      expect(msgs[0].channel).toBe('C999');
    });
  });
});
