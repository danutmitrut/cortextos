import { createHash } from 'crypto';

// Bracketed paste mode escape sequences
const PASTE_START = '\x1b[200~';
const PASTE_END = '\x1b[201~';

// Key escape sequences for TUI navigation
export const KEYS = {
  ENTER: '\r',
  CTRL_C: '\x03',
  DOWN: '\x1b[B',
  UP: '\x1b[A',
  SPACE: ' ',
  ESCAPE: '\x1b',
  TAB: '\t',
} as const;

/**
 * Message deduplication via MD5 hash.
 * Prevents double-injection on crash recovery.
 * Matches bash fast-checker.sh dedup pattern.
 */
export class MessageDedup {
  private hashes: string[] = [];
  private maxEntries: number;

  constructor(maxEntries: number = 100) {
    this.maxEntries = maxEntries;
  }

  /**
   * Returns true if this content has been seen before (duplicate).
   */
  isDuplicate(content: string): boolean {
    const hash = createHash('md5').update(content).digest('hex');
    if (this.hashes.includes(hash)) {
      return true;
    }
    this.hashes.push(hash);
    if (this.hashes.length > this.maxEntries) {
      this.hashes.shift();
    }
    return false;
  }

  clear(): void {
    this.hashes = [];
  }
}

/**
 * Inject a message into a PTY process using bracketed paste mode.
 * Replaces tmux load-buffer + paste-buffer pattern.
 *
 * Bracketed paste mode wraps the content so the terminal treats it as
 * pasted text rather than typed input. This prevents special characters
 * from being interpreted as commands.
 *
 * @param write Function to write to the PTY (pty.write)
 * @param content The message content to inject
 * @param enterDelay Milliseconds to wait before sending Enter (default 300ms)
 */
export function injectMessage(
  write: (data: string) => void,
  content: string,
  enterDelay: number = 300,
): void {
  // For very large messages, chunk the write to avoid overwhelming the PTY buffer
  const MAX_CHUNK = 4096;

  if (content.length <= MAX_CHUNK) {
    write(PASTE_START + content + PASTE_END);
  } else {
    // Chunked write for large messages
    write(PASTE_START);
    for (let i = 0; i < content.length; i += MAX_CHUNK) {
      write(content.slice(i, i + MAX_CHUNK));
    }
    write(PASTE_END);
  }

  // Send Enter after a short delay to submit the pasted content.
  // Why the try/catch: the write callback captures `this.pty` (or similar
  // nullable PTY handle) via closure in callers. If the PTY is torn down
  // during the enterDelay window — e.g. hard-restart IPC kills the child —
  // the callback will read `null.write` and throw. Swallowing here keeps
  // the daemon process alive; the dropped Enter is the acceptable cost.
  // Root cause: PR #196 fixed three this.pty! callers in agent-process.ts
  // but missed worker-process.ts:93. This try/catch is the structural fix
  // that covers every present and future caller.
  setTimeout(() => {
    try {
      write(KEYS.ENTER);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[inject] deferred Enter failed (pty likely torn down): ${msg}`);
    }
  }, enterDelay);
}

// Confirmed-injection tuning. The poll interval is fine-grained because the
// common case confirms within one or two TUI redraws; the timeout is the
// upper bound a slow ConPTY pipeline gets before we fall back to a blind
// Enter (still strictly better than the fixed 300ms the legacy path uses).
const CONFIRM_POLL_MS = 50;
const CONFIRM_TIMEOUT_MS = 2000;
const CONFIRM_SETTLE_MS = 150;
const TAIL_PROBE_LEN = 24;

/**
 * Normalize PTY output for probe matching: strip ANSI control sequences
 * (OSC, CSI, two-character ESC finals) and collapse all whitespace. TUI
 * redraws wrap pasted text at terminal width and interleave cursor movement,
 * so raw substring matching is useless — normalized matching survives both.
 */
export function normalizeForProbe(s: string): string {
  return s
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[@-Z\\-_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

/**
 * Claude Code renders large multi-line pastes in the composer as a
 * "[Pasted text #N +M lines]" placeholder instead of the raw text, so the
 * content tail never appears in the output stream for exactly the messages
 * most at risk. Counting placeholder markers covers that rendering.
 */
function countPastePlaceholders(normalized: string): number {
  const m = normalized.match(/pasted text/gi);
  return m ? m.length : 0;
}

export interface ConfirmedInjectOptions {
  /**
   * Returns recent raw PTY output (ANSI included). When provided, Enter is
   * held until the output shows evidence the paste was processed — either a
   * NEW occurrence of the content tail or a NEW paste placeholder — or the
   * timeout expires. Occurrence counts are compared against a pre-paste
   * baseline: bus message templates share an identical trailing line
   * ("... '<your reply>'"), so bare substring presence would confirm
   * instantly against the PREVIOUS injection still sitting in the buffer.
   */
  readRecent?: () => string;
  /** Fallback delay before Enter when no readRecent is available (legacy behavior). */
  enterDelay?: number;
  confirmTimeoutMs?: number;
  log?: (msg: string) => void;
}

/**
 * Inject a message and press Enter only once there is evidence the TUI
 * actually processed the paste, falling back to a bounded timeout.
 *
 * Why this exists: the legacy injectMessage() fires Enter on a blind 300ms
 * timer. When the terminal has not finished processing the paste (slow
 * ConPTY pipeline on Windows, or a second injection racing the first —
 * upstream #510), that Enter submits a half-processed composer: part of the
 * block is lost, and the remaining tail is submitted by the NEXT Enter as a
 * phantom standalone message. Callers should serialize invocations (see
 * AgentProcess.performInject) so paste→confirm→Enter completes per message.
 */
export async function injectMessageAndConfirm(
  write: (data: string) => void,
  content: string,
  options: ConfirmedInjectOptions = {},
): Promise<void> {
  const {
    readRecent,
    enterDelay = 300,
    confirmTimeoutMs = CONFIRM_TIMEOUT_MS,
    log,
  } = options;

  const MAX_CHUNK = 4096;
  if (content.length <= MAX_CHUNK) {
    write(PASTE_START + content + PASTE_END);
  } else {
    write(PASTE_START);
    for (let i = 0; i < content.length; i += MAX_CHUNK) {
      write(content.slice(i, i + MAX_CHUNK));
    }
    write(PASTE_END);
  }

  const probe = normalizeForProbe(content).slice(-TAIL_PROBE_LEN);
  if (!readRecent || !probe) {
    await sleep(enterDelay);
  } else {
    const baseline = normalizeForProbe(readRecent());
    const probeBefore = countOccurrences(baseline, probe);
    const placeholdersBefore = countPastePlaceholders(baseline);
    const deadline = Date.now() + confirmTimeoutMs;
    let confirmed = false;
    while (Date.now() < deadline) {
      const current = normalizeForProbe(readRecent());
      if (
        countOccurrences(current, probe) > probeBefore
        || countPastePlaceholders(current) > placeholdersBefore
      ) {
        confirmed = true;
        break;
      }
      await sleep(CONFIRM_POLL_MS);
    }
    if (!confirmed) {
      log?.(`inject: paste not confirmed in output within ${confirmTimeoutMs}ms — sending Enter anyway`);
    }
    // Even after the probe matches, the TUI may still be mid-redraw; a short
    // settle keeps Enter from landing inside that redraw.
    await sleep(CONFIRM_SETTLE_MS);
  }

  try {
    write(KEYS.ENTER);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[inject] deferred Enter failed (pty likely torn down): ${msg}`);
  }
}

/**
 * Send a sequence of keys to the PTY for TUI navigation.
 * Used for AskUserQuestion option selection and Plan mode approval.
 *
 * @param write Function to write to the PTY
 * @param keys Array of key sequences to send
 * @param delay Milliseconds between each key (default 100ms)
 */
export async function sendKeySequence(
  write: (data: string) => void,
  keys: string[],
  delay: number = 100,
): Promise<void> {
  for (const key of keys) {
    write(key);
    await sleep(delay);
  }
}

/**
 * Navigate to a specific option in a TUI list and select it.
 * Matches bash fast-checker.sh AskUserQuestion navigation.
 *
 * @param write PTY write function
 * @param optionIndex 0-based index of the option to select
 * @param submit Whether to press Enter after selection
 */
export async function selectOption(
  write: (data: string) => void,
  optionIndex: number,
  submit: boolean = true,
): Promise<void> {
  // Navigate down to the option
  for (let i = 0; i < optionIndex; i++) {
    write(KEYS.DOWN);
    await sleep(100);
  }
  await sleep(200);

  if (submit) {
    write(KEYS.ENTER);
  }
}

/**
 * Toggle options for multi-select TUI and submit.
 * Matches bash fast-checker.sh multi-select pattern.
 */
export async function toggleAndSubmit(
  write: (data: string) => void,
  selectedIndices: number[],
  totalOptions: number,
): Promise<void> {
  const sorted = [...selectedIndices].sort((a, b) => a - b);
  let currentPos = 0;

  for (const idx of sorted) {
    const moves = idx - currentPos;
    for (let i = 0; i < moves; i++) {
      write(KEYS.DOWN);
      await sleep(100);
    }
    write(KEYS.SPACE);
    await sleep(100);
    currentPos = idx;
  }

  // Navigate to Submit button (past all options + "Other")
  const submitPos = totalOptions + 1;
  const remaining = submitPos - currentPos;
  for (let i = 0; i < remaining; i++) {
    write(KEYS.DOWN);
    await sleep(100);
  }
  await sleep(200);
  write(KEYS.ENTER);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
