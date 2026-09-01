import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MessageDedup, KEYS, injectMessage } from '../../../src/pty/inject';

describe('MessageDedup', () => {
  it('detects duplicate content', () => {
    const dedup = new MessageDedup();
    expect(dedup.isDuplicate('hello world')).toBe(false);
    expect(dedup.isDuplicate('hello world')).toBe(true);
  });

  it('allows different content', () => {
    const dedup = new MessageDedup();
    expect(dedup.isDuplicate('message 1')).toBe(false);
    expect(dedup.isDuplicate('message 2')).toBe(false);
  });

  it('evicts old entries', () => {
    const dedup = new MessageDedup(3);
    dedup.isDuplicate('msg1');
    dedup.isDuplicate('msg2');
    dedup.isDuplicate('msg3');
    dedup.isDuplicate('msg4'); // evicts msg1
    expect(dedup.isDuplicate('msg1')).toBe(false); // no longer in cache
    expect(dedup.isDuplicate('msg4')).toBe(true); // still in cache
  });
});

describe('KEYS', () => {
  it('has correct escape sequences', () => {
    expect(KEYS.ENTER).toBe('\r');
    expect(KEYS.CTRL_C).toBe('\x03');
    expect(KEYS.DOWN).toBe('\x1b[B');
    expect(KEYS.UP).toBe('\x1b[A');
    expect(KEYS.SPACE).toBe(' ');
  });
});

const PASTE_START = '\x1b[200~';
const PASTE_END = '\x1b[201~';
// Must track MAX_CHUNK / CHUNK_DELAY_MS in src/pty/inject.ts.
const MAX_CHUNK = 384;
const CHUNK_DELAY_MS = 15;

/** Drive every scheduled chunk write plus the deferred Enter to completion. */
function flush(contentLength: number, enterDelay: number): number {
  const chunkCount = Math.ceil(contentLength / MAX_CHUNK) + 2; // + paste markers
  const total = (chunkCount - 1) * CHUNK_DELAY_MS + enterDelay;
  vi.advanceTimersByTime(total);
  return total;
}

describe('injectMessage — chunked delivery', () => {
  // Regression guard for the 2026-08-31 Windows field report: a single 1316-char
  // write reached the agent as its last 308 characters, cut mid-word. Losses
  // across five measurements saturated near 1026 characters and repeated to the
  // character, which is a boundary rather than a race. Every write now stays far
  // below any plausible boundary, with gaps so a slow consumer can drain.
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('splits oversized content into writes no larger than MAX_CHUNK', () => {
    const writes: string[] = [];
    const content = 'x'.repeat(2000);

    injectMessage(writes.push.bind(writes) as (d: string) => void, content, 300);
    flush(content.length, 300);

    const contentWrites = writes.filter(w => w !== PASTE_START && w !== PASTE_END && w !== KEYS.ENTER);
    expect(contentWrites.length).toBeGreaterThan(1);
    for (const w of contentWrites) {
      expect(w.length).toBeLessThanOrEqual(MAX_CHUNK);
    }
  });

  it('chunks short content too, so no size is exempt from the mitigation', () => {
    const writes: string[] = [];
    injectMessage(writes.push.bind(writes) as (d: string) => void, 'hi', 300);

    // Only the opening paste marker is synchronous; everything else is scheduled.
    expect(writes).toEqual([PASTE_START]);
  });

  it('reassembles to the exact original content, markers intact', () => {
    const writes: string[] = [];
    // Multi-byte characters matter here: Romanian diacritics travel this path on
    // the Windows install where the truncation was reported.
    const content = 'Salut, ce prioritati avem azi? ăâîșț '.repeat(60);

    injectMessage(writes.push.bind(writes) as (d: string) => void, content, 300);
    flush(content.length, 300);

    expect(writes[0]).toBe(PASTE_START);
    expect(writes[writes.length - 1]).toBe(KEYS.ENTER);
    expect(writes[writes.length - 2]).toBe(PASTE_END);
    expect(writes.slice(1, -2).join('')).toBe(content);
  });

  it('holds Enter until every chunk has been written', () => {
    const writes: string[] = [];
    const content = 'y'.repeat(1500);

    injectMessage(writes.push.bind(writes) as (d: string) => void, content, 300);

    // Enter must not appear while chunks are still draining.
    const chunkCount = Math.ceil(content.length / MAX_CHUNK) + 2;
    vi.advanceTimersByTime((chunkCount - 1) * CHUNK_DELAY_MS);
    expect(writes).not.toContain(KEYS.ENTER);
    expect(writes[writes.length - 1]).toBe(PASTE_END);

    vi.advanceTimersByTime(300);
    expect(writes[writes.length - 1]).toBe(KEYS.ENTER);
  });
});

describe('injectMessage — crash safety', () => {
  // Regression guard for the 2026-04-22 storm. worker-process.ts:93 passed
  // an unsafe `this.pty!.write` callback; when PTY was torn down during the
  // 300ms enterDelay window the setTimeout fired null.write → uncaught
  // TypeError → daemon crash. Chunking widened that window, so scheduled
  // chunk writes need the same guard the deferred Enter already had.
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    warnSpy.mockRestore();
  });

  it('swallows throw from the deferred Enter callback without crashing', () => {
    const writes: string[] = [];
    let ptyAlive = true;
    const write = (data: string) => {
      if (!ptyAlive) throw new TypeError("Cannot read properties of null (reading 'write')");
      writes.push(data);
    };

    expect(() => injectMessage(write, 'hello', 300)).not.toThrow();

    // Let the chunks drain while the PTY is still healthy, then kill it so only
    // the deferred Enter lands on a dead handle.
    const chunkCount = Math.ceil('hello'.length / MAX_CHUNK) + 2;
    vi.advanceTimersByTime((chunkCount - 1) * CHUNK_DELAY_MS);
    expect(warnSpy).not.toHaveBeenCalled();

    ptyAlive = false;
    expect(() => vi.advanceTimersByTime(300)).not.toThrow();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/deferred Enter failed/);
  });

  it('swallows a throw from a scheduled chunk write', () => {
    let ptyAlive = true;
    const write = (_data: string) => {
      if (!ptyAlive) throw new TypeError("Cannot read properties of null (reading 'write')");
    };

    injectMessage(write, 'z'.repeat(1000), 300);
    // PTY dies immediately: every scheduled chunk now throws.
    ptyAlive = false;

    expect(() => flush(1000, 300)).not.toThrow();
    expect(warnSpy.mock.calls.some(c => /chunk write failed/.test(String(c[0])))).toBe(true);
  });

  it('sends Enter normally when the PTY stays alive', () => {
    const writes: string[] = [];
    const write = (data: string) => { writes.push(data); };

    injectMessage(write, 'hi', 300);
    flush('hi'.length, 300);

    expect(writes[writes.length - 1]).toBe(KEYS.ENTER);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
