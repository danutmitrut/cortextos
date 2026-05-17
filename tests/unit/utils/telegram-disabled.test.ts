import { describe, it, expect, afterEach } from 'vitest';
import { isTelegramDisabled } from '../../../src/utils/env';

describe('isTelegramDisabled', () => {
  const original = process.env.CTX_TELEGRAM_DISABLED;
  afterEach(() => {
    if (original === undefined) delete process.env.CTX_TELEGRAM_DISABLED;
    else process.env.CTX_TELEGRAM_DISABLED = original;
  });

  it('is false when unset', () => {
    delete process.env.CTX_TELEGRAM_DISABLED;
    expect(isTelegramDisabled()).toBe(false);
  });

  it('is false for empty, "0", "false" (any case)', () => {
    for (const v of ['', '0', 'false', 'FALSE']) {
      process.env.CTX_TELEGRAM_DISABLED = v;
      expect(isTelegramDisabled()).toBe(false);
    }
  });

  it('is true for "1" and "true" (any case, surrounding spaces ok)', () => {
    for (const v of ['1', 'true', 'TRUE', 'True', ' true ']) {
      process.env.CTX_TELEGRAM_DISABLED = v;
      expect(isTelegramDisabled()).toBe(true);
    }
  });
});
