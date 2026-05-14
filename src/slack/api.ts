import { WebClient } from '@slack/web-api';

export class SlackAPI {
  private client: WebClient;

  constructor(token: string) {
    this.client = new WebClient(token);
  }

  async sendMessage(channelId: string, text: string): Promise<string> {
    const result = await this.client.chat.postMessage({ channel: channelId, text });
    if (!result.ok) {
      throw new Error(`Slack API error: ${result.error ?? 'unknown'}`);
    }
    return result.ts as string;
  }
}
