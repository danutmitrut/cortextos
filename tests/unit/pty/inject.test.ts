import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MessageDedup, KEYS, injectMessage, injectMessageAndConfirm, normalizeForProbe } from '../../../src/pty/inject';

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

describe('injectMessage — deferred Enter crash safety', () => {
  // Regression guard for the 2026-04-22 storm. worker-process.ts:93 passed
  // an unsafe `this.pty!.write` callback; when PTY was torn down during the
  // 300ms enterDelay window the setTimeout fired null.write → uncaught
  // TypeError → daemon crash. The fix wraps the deferred write in try/catch.
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
    // Caller's write is "safe" during the synchronous paste but starts
    // throwing by the time the deferred Enter fires — simulates PTY teardown.
    let ptyAlive = true;
    const write = (data: string) => {
      if (!ptyAlive) throw new TypeError("Cannot read properties of null (reading 'write')");
      writes.push(data);
    };

    // Synchronous calls (paste markers + content) should succeed.
    expect(() => injectMessage(write, 'hello', 300)).not.toThrow();
    expect(writes.length).toBeGreaterThan(0);

    // PTY dies before the 300ms Enter timeout fires.
    ptyAlive = false;

    // Advancing the clock invokes the deferred callback. Must NOT propagate.
    expect(() => vi.advanceTimersByTime(300)).not.toThrow();

    // The warn path in inject.ts confirms the catch branch ran.
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/deferred Enter failed/);
  });

  it('sends Enter normally when the PTY stays alive', () => {
    const writes: string[] = [];
    const write = (data: string) => { writes.push(data); };

    injectMessage(write, 'hi', 300);
    const writesBeforeTimer = writes.length;
    vi.advanceTimersByTime(300);

    // Exactly one new write — the ENTER keystroke — and no warn.
    expect(writes.length).toBe(writesBeforeTimer + 1);
    expect(writes[writes.length - 1]).toBe(KEYS.ENTER);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe('normalizeForProbe', () => {
  it('strips ANSI sequences and collapses whitespace', () => {
    const raw = '\x1b[2K\x1b[1;32mReply using:\x1b[0m cortextos bus\r\n  send-telegram 999 \x1b]0;title\x07\'<your reply>\'';
    expect(normalizeForProbe(raw)).toBe("Reply using: cortextos bus send-telegram 999 '<your reply>'");
  });
});

describe('injectMessageAndConfirm — confirmed Enter', () => {
  // The message shape that triggered the Windows phantom reports: a
  // multi-line Telegram block whose trailing template line is IDENTICAL
  // across every injection.
  const content = "=== TELEGRAM from [USER: Ana] (chat_id:5510317765) ===\nsalut\nReply using: cortextos bus send-telegram 5510317765 '<your reply>'\n\n";

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeHarness(initialBuffer = '') {
    const writes: string[] = [];
    const buffer = { value: initialBuffer };
    const write = (data: string) => { writes.push(data); };
    const readRecent = () => buffer.value;
    const enters = () => writes.filter((w) => w === KEYS.ENTER).length;
    return { writes, buffer, write, readRecent, enters };
  }

  it('holds Enter until the pasted content is reflected in output', async () => {
    const h = makeHarness();
    const done = injectMessageAndConfirm(h.write, content, { readRecent: h.readRecent, confirmTimeoutMs: 1000 });

    // Paste is written synchronously, Enter is not.
    expect(h.writes.length).toBeGreaterThan(0);
    expect(h.enters()).toBe(0);

    // Output shows nothing yet — polls pass, still no Enter.
    await vi.advanceTimersByTimeAsync(200);
    expect(h.enters()).toBe(0);

    // TUI reflects the paste; next poll confirms, settle elapses, Enter fires.
    h.buffer.value = `redraw noise ${content}`;
    await vi.advanceTimersByTimeAsync(250);
    expect(h.enters()).toBe(1);
    expect(h.writes[h.writes.length - 1]).toBe(KEYS.ENTER);
    await done;
  });

  it('does not confirm against an identical tail left over from a previous injection', async () => {
    // Buffer already contains one full copy of the block (previous message):
    // bare substring matching would confirm at t=0 and resurrect the race.
    const h = makeHarness(`old traffic ${content}`);
    const done = injectMessageAndConfirm(h.write, content, { readRecent: h.readRecent, confirmTimeoutMs: 1000 });

    await vi.advanceTimersByTimeAsync(300);
    expect(h.enters()).toBe(0); // occurrence count unchanged — not confirmed

    h.buffer.value += ` second copy ${content}`;
    await vi.advanceTimersByTimeAsync(250);
    expect(h.enters()).toBe(1);
    await done;
  });

  it('confirms via the "[Pasted text #N +M lines]" placeholder rendering', async () => {
    const h = makeHarness();
    const done = injectMessageAndConfirm(h.write, content, { readRecent: h.readRecent, confirmTimeoutMs: 1000 });

    h.buffer.value = '\x1b[2K> [Pasted text #1 +4 lines]';
    await vi.advanceTimersByTimeAsync(250);
    expect(h.enters()).toBe(1);
    await done;
  });

  it('falls back to Enter at the timeout when output never reflects the paste', async () => {
    const h = makeHarness();
    const log = vi.fn();
    const done = injectMessageAndConfirm(h.write, content, { readRecent: h.readRecent, confirmTimeoutMs: 400, log });

    await vi.advanceTimersByTimeAsync(399);
    expect(h.enters()).toBe(0);

    await vi.advanceTimersByTimeAsync(201); // past deadline + settle
    expect(h.enters()).toBe(1);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toMatch(/not confirmed/);
    await done;
  });

  it('without readRecent behaves like the legacy path: Enter after enterDelay', async () => {
    const h = makeHarness();
    const done = injectMessageAndConfirm(h.write, content, { enterDelay: 300 });

    await vi.advanceTimersByTimeAsync(299);
    expect(h.enters()).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.enters()).toBe(1);
    await done;
  });

  it('swallows a throw from the final Enter when the PTY died mid-flight', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let ptyAlive = true;
    const buffer = { value: '' };
    const write = (data: string) => {
      if (!ptyAlive) throw new TypeError('null.write');
      buffer.value += data;
    };

    const done = injectMessageAndConfirm(write, content, { readRecent: () => buffer.value, confirmTimeoutMs: 200 });
    ptyAlive = false;
    await expect(vi.advanceTimersByTimeAsync(500).then(() => done)).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });
});
