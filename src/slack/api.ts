import { WebClient } from '@slack/web-api';
import { readFileSync } from 'fs';
import { basename } from 'path';

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

  /**
   * Upload a local file (image or document) to a Slack channel with an
   * optional caption. Used by the send-telegram->Slack shim when Telegram is
   * disabled so agents (e.g. imager) can still deliver images to the operator.
   * Throws on failure so the caller can surface a non-zero exit.
   */
  async uploadFile(channelId: string, filePath: string, caption?: string): Promise<void> {
    const buffer = readFileSync(filePath);
    const result = await this.client.files.uploadV2({
      channel_id: channelId,
      file: buffer,
      filename: basename(filePath),
      initial_comment: caption && caption.length > 0 ? caption : undefined,
    });
    if (!(result as { ok?: boolean }).ok) {
      throw new Error('Slack API error: file upload failed');
    }
  }
}
