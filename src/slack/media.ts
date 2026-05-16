/**
 * Slack media message handling.
 *
 * Slack does not categorize uploads the way Telegram does (no msg.photo /
 * msg.voice). A message just carries a files[] array where each file has a
 * mimetype. We map the mimetype to a category, download the bytes with the
 * bot token (Slack private URLs require a bearer header), and save locally.
 *
 * Mirrors src/telegram/media.ts. transcribeVoice is reused as-is (it takes a
 * file path and is transport-agnostic).
 */

import * as fs from 'fs';
import * as path from 'path';
import { SlackAPI } from './api.js';
import type { SlackMessageEvent, SlackFile } from './poller.js';
import { sanitizeFilename } from '../telegram/media.js';
import { transcribeVoice } from '../telegram/transcribe.js';
import { ensureDir } from '../utils/atomic.js';

export interface ProcessedSlackMedia {
  type: 'photo' | 'document' | 'voice' | 'video';
  channel: string;
  from: string;
  text: string;
  ts: string;
  image_path?: string;
  file_path?: string;
  file_name?: string;
  transcript?: string;
}

function categorize(mimetype: string | undefined): 'photo' | 'voice' | 'video' | 'document' {
  const m = (mimetype || '').toLowerCase();
  if (m.startsWith('image/')) return 'photo';
  if (m.startsWith('audio/')) return 'voice';
  if (m.startsWith('video/')) return 'video';
  return 'document';
}

/**
 * Build a safe local filename for a Slack file. Uses the sanitized original
 * name when present, else synthesizes one from the message ts + filetype.
 */
function localName(file: SlackFile, ts: string): string {
  if (file.name) return sanitizeFilename(file.name);
  const ext = file.filetype ? `.${sanitizeFilename(file.filetype)}` : '';
  const safeTs = ts.replace(/[^0-9.]/g, '');
  return `slackfile_${safeTs}_${sanitizeFilename(file.id)}${ext}`;
}

/**
 * Process all files on a Slack message. Returns one ProcessedSlackMedia per
 * successfully downloaded file. A file with no usable URL or a failed
 * download is skipped (logged via console.error) so the remaining files
 * still reach the agent. Returns [] when the message has no files.
 */
export async function processSlackMedia(
  event: SlackMessageEvent,
  api: SlackAPI,
  downloadDir: string,
): Promise<ProcessedSlackMedia[]> {
  const files = event.files;
  if (!files || files.length === 0) return [];

  ensureDir(downloadDir);

  const from = event.user || 'unknown';
  const text = event.text || '';
  const channel = event.channel;
  const ts = event.ts;
  const results: ProcessedSlackMedia[] = [];

  for (const file of files) {
    const url = file.url_private_download || file.url_private;
    if (!url) {
      console.error(`[slack-media] file ${file.id} has no download URL - skipping`);
      continue;
    }

    let data: Buffer;
    try {
      data = await api.downloadFile(url);
    } catch (err) {
      console.error(`[slack-media] download failed for file ${file.id}: ${err} - skipping`);
      continue;
    }

    const category = categorize(file.mimetype);
    const fileName = localName(file, ts);
    const localFile = path.join(downloadDir, fileName);
    fs.writeFileSync(localFile, data);

    if (category === 'photo') {
      results.push({ type: 'photo', channel, from, text, ts, image_path: localFile });
    } else if (category === 'voice') {
      const transcript = await transcribeVoice(localFile);
      results.push({
        type: 'voice',
        channel, from, text, ts,
        file_path: localFile,
        transcript: transcript || undefined,
      });
    } else if (category === 'video') {
      results.push({ type: 'video', channel, from, text, ts, file_path: localFile, file_name: fileName });
    } else {
      results.push({ type: 'document', channel, from, text, ts, file_path: localFile, file_name: fileName });
    }
  }

  return results;
}
