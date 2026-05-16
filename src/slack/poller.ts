import { SocketModeClient, LogLevel } from '@slack/socket-mode';
import { WebClient } from '@slack/web-api';

export interface SlackFile {
  id: string;
  name?: string;
  mimetype?: string;
  filetype?: string;
  url_private_download?: string;
  url_private?: string;
  size?: number;
}

export interface SlackMessageEvent {
  type: string;
  subtype?: string;
  channel: string;
  user?: string;
  text: string;
  ts: string;
  thread_ts?: string;
  bot_id?: string;
  files?: SlackFile[];
}

export type SlackMessageHandler = (event: SlackMessageEvent) => void;

export class SlackPoller {
  private client: SocketModeClient;
  private webClient: WebClient;
  private messageHandlers: SlackMessageHandler[] = [];
  private running = false;

  constructor(appToken: string, botToken: string) {
    this.client = new SocketModeClient({ appToken, logLevel: LogLevel.ERROR });
    this.webClient = new WebClient(botToken);
  }

  async fetchHistory(channelId: string, oldestUnixSeconds: number): Promise<SlackMessageEvent[]> {
    const result = await this.webClient.conversations.history({
      channel: channelId,
      oldest: String(oldestUnixSeconds),
      limit: 20,
    });
    type RawMsg = {
      type?: string;
      subtype?: string;
      user?: string;
      text?: string;
      ts?: string;
      thread_ts?: string;
      bot_id?: string;
      files?: SlackFile[];
    };
    const messages = (result.messages ?? []) as RawMsg[];
    return messages
      .filter(m => m.user && !m.bot_id && m.ts && (m.text || (m.files && m.files.length > 0)))
      .map(m => ({
        type: m.type ?? 'message',
        subtype: m.subtype,
        channel: channelId,
        user: m.user,
        text: m.text ?? '',
        ts: m.ts ?? '',
        thread_ts: m.thread_ts,
        bot_id: m.bot_id,
        files: m.files,
      }))
      .reverse(); // Slack returneaza newest-first; noi vrem oldest-first
  }

  onMessage(handler: SlackMessageHandler): void {
    this.messageHandlers.push(handler);
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.client.on('message', async ({ event, ack }: { event: SlackMessageEvent; ack: () => Promise<void> }) => {
      try {
        await ack();
        if (!this.running) return;
        if (event.bot_id) return;
        if (!event.user) return;
        for (const handler of this.messageHandlers) {
          try {
            handler(event);
          } catch (err) {
            console.error('[slack-poller] Message handler error:', err);
          }
        }
      } catch (err) {
        console.error('[slack-poller] Listener error:', err);
      }
    });
    await this.client.start();
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.client.disconnect();
  }
}
