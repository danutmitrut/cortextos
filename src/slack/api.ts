import { WebClient } from '@slack/web-api';

export class SlackAPI {
  private client: WebClient;

  constructor(token: string) {
    this.client = new WebClient(token);
  }

  /**
   * Post a text message to a Slack channel.
   * Returns the message timestamp (ts) which uniquely identifies the message.
   */
  async sendMessage(channelId: string, text: string): Promise<string> {
    const result = await this.client.chat.postMessage({ channel: channelId, text });
    if (!result.ok) {
      throw new Error(`Slack API error: ${result.error ?? 'unknown'}`);
    }
    if (!result.ts) {
      throw new Error('Slack API error: missing ts in response');
    }
    return result.ts;
  }
}
