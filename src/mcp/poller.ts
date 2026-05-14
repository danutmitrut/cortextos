import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface PollOptions {
  intervalMs?: number;
  timeoutMs?: number;
}

export async function pollForReply(
  cliInboxDir: string,
  replyToId: string,
  options: PollOptions = {},
): Promise<string | null> {
  const { intervalMs = 3000, timeoutMs = 120_000 } = options;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const text = scanInboxForReply(cliInboxDir, replyToId);
    if (text !== null) return text;
    await sleep(intervalMs);
  }

  return null;
}

function scanInboxForReply(inboxDir: string, replyToId: string): string | null {
  if (!existsSync(inboxDir)) return null;

  let files: string[];
  try {
    files = readdirSync(inboxDir).filter(f => f.endsWith('.json'));
  } catch {
    return null;
  }

  for (const file of files) {
    try {
      const raw = readFileSync(join(inboxDir, file), 'utf-8');
      const msg = JSON.parse(raw);
      if (msg.reply_to === replyToId) return msg.text as string;
    } catch {
      // fișier corupt sau în scriere — skip
    }
  }

  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
