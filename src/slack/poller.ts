import { SocketModeClient, LogLevel } from '@slack/socket-mode';

export interface SlackMessageEvent {
  type: string;
  channel: string;
  user?: string;
  text: string;
  ts: string;
  thread_ts?: string;
  bot_id?: string;
}

export type SlackMessageHandler = (event: SlackMessageEvent) => void;

export class SlackPoller {
  private client: SocketModeClient;
  private messageHandlers: SlackMessageHandler[] = [];
  private running = false;

  constructor(appToken: string) {
    this.client = new SocketModeClient({ appToken, logLevel: LogLevel.ERROR });
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
