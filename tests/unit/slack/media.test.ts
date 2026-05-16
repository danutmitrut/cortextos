import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { join, resolve, sep } from 'path';
import { tmpdir } from 'os';
import { processSlackMedia } from '../../../src/slack/media';
import type { SlackMessageEvent } from '../../../src/slack/poller';

function mockApi(bytes: Buffer = Buffer.from('slack-bytes')) {
  return {
    downloadFile: vi.fn().mockResolvedValue(bytes),
  } as any;
}

function evt(files: SlackMessageEvent['files']): SlackMessageEvent {
  return {
    type: 'message',
    subtype: 'file_share',
    channel: 'C0123456',
    user: 'U123',
    text: 'caption here',
    ts: '1700000000.000100',
    files,
  };
}

describe('processSlackMedia', () => {
  let downloadDir: string;
  let prevNoTranscribe: string | undefined;

  beforeEach(() => {
    downloadDir = mkdtempSync(join(tmpdir(), 'cortextos-slack-media-'));
    prevNoTranscribe = process.env.CTX_TELEGRAM_NO_TRANSCRIBE;
    // transcribeVoice is shared with Telegram and gates on this single env
    // var regardless of transport; this disables Whisper during the tests.
    process.env.CTX_TELEGRAM_NO_TRANSCRIBE = '1';
  });

  afterEach(() => {
    rmSync(downloadDir, { recursive: true, force: true });
    if (prevNoTranscribe === undefined) delete process.env.CTX_TELEGRAM_NO_TRANSCRIBE;
    else process.env.CTX_TELEGRAM_NO_TRANSCRIBE = prevNoTranscribe;
  });

  it('returns empty array when there are no files', async () => {
    const out = await processSlackMedia(evt(undefined), mockApi(), downloadDir);
    expect(out).toEqual([]);
  });

  it('maps image/* to photo and saves the file', async () => {
    const api = mockApi(Buffer.from('img'));
    const out = await processSlackMedia(
      evt([{ id: 'F1', name: 'cat.jpg', mimetype: 'image/jpeg', filetype: 'jpg', url_private_download: 'https://files/cat.jpg' }]),
      api, downloadDir,
    );
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('photo');
    expect(out[0].text).toBe('caption here');
    expect(out[0].image_path).toBeDefined();
    expect(existsSync(out[0].image_path!)).toBe(true);
    expect(readFileSync(out[0].image_path!).toString()).toBe('img');
    expect(api.downloadFile).toHaveBeenCalledWith('https://files/cat.jpg');
  });

  it('maps audio/* to voice', async () => {
    const out = await processSlackMedia(
      evt([{ id: 'F2', name: 'memo.m4a', mimetype: 'audio/mp4', filetype: 'm4a', url_private_download: 'https://files/memo.m4a' }]),
      mockApi(), downloadDir,
    );
    expect(out[0].type).toBe('voice');
    expect(out[0].file_path).toBeDefined();
    expect(existsSync(out[0].file_path!)).toBe(true);
  });

  it('maps video/* to video', async () => {
    const out = await processSlackMedia(
      evt([{ id: 'F3', name: 'clip.mp4', mimetype: 'video/mp4', filetype: 'mp4', url_private_download: 'https://files/clip.mp4' }]),
      mockApi(), downloadDir,
    );
    expect(out[0].type).toBe('video');
    expect(out[0].file_path).toBeDefined();
  });

  it('maps unknown mimetype to document with sanitized name', async () => {
    const out = await processSlackMedia(
      evt([{ id: 'F4', name: '../../evil report.pdf', mimetype: 'application/pdf', filetype: 'pdf', url_private_download: 'https://files/r.pdf' }]),
      mockApi(), downloadDir,
    );
    expect(out[0].type).toBe('document');
    expect(out[0].file_name).toBe('evilreport_F4.pdf');
    expect(out[0].file_path).toBeDefined();
  });

  it('handles multiple files in one message', async () => {
    const out = await processSlackMedia(
      evt([
        { id: 'F5', name: 'a.jpg', mimetype: 'image/jpeg', filetype: 'jpg', url_private_download: 'https://files/a.jpg' },
        { id: 'F6', name: 'b.pdf', mimetype: 'application/pdf', filetype: 'pdf', url_private_download: 'https://files/b.pdf' },
      ]),
      mockApi(), downloadDir,
    );
    expect(out).toHaveLength(2);
    expect(out[0].type).toBe('photo');
    expect(out[1].type).toBe('document');
  });

  it('skips a file whose download fails and keeps the rest', async () => {
    const api = {
      downloadFile: vi.fn()
        .mockRejectedValueOnce(new Error('403'))
        .mockResolvedValueOnce(Buffer.from('ok')),
    } as any;
    const out = await processSlackMedia(
      evt([
        { id: 'F7', name: 'bad.jpg', mimetype: 'image/jpeg', filetype: 'jpg', url_private_download: 'https://files/bad.jpg' },
        { id: 'F8', name: 'good.pdf', mimetype: 'application/pdf', filetype: 'pdf', url_private_download: 'https://files/good.pdf' },
      ]),
      api, downloadDir,
    );
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('document');
  });

  it('skips a file with no usable URL', async () => {
    const out = await processSlackMedia(
      evt([{ id: 'F9', name: 'x.jpg', mimetype: 'image/jpeg', filetype: 'jpg' }]),
      mockApi(), downloadDir,
    );
    expect(out).toEqual([]);
  });

  it('does not let two files with the same name collide', async () => {
    const api = {
      downloadFile: vi.fn()
        .mockResolvedValueOnce(Buffer.from('first'))
        .mockResolvedValueOnce(Buffer.from('second')),
    } as any;
    const out = await processSlackMedia(
      evt([
        { id: 'FA', name: 'report.pdf', mimetype: 'application/pdf', filetype: 'pdf', url_private_download: 'https://files/a' },
        { id: 'FB', name: 'report.pdf', mimetype: 'application/pdf', filetype: 'pdf', url_private_download: 'https://files/b' },
      ]),
      api, downloadDir,
    );
    expect(out).toHaveLength(2);
    expect(out[0].file_path).not.toBe(out[1].file_path);
    expect(readFileSync(out[0].file_path!).toString()).toBe('first');
    expect(readFileSync(out[1].file_path!).toString()).toBe('second');
  });

  it('keeps a pathological ".." file name inside the download dir', async () => {
    const out = await processSlackMedia(
      evt([{ id: 'FT', name: '..', mimetype: 'image/jpeg', filetype: 'jpg', url_private_download: 'https://files/e.jpg' }]),
      mockApi(), downloadDir,
    );
    expect(out).toHaveLength(1);
    expect(resolve(out[0].image_path!).startsWith(resolve(downloadDir) + sep)).toBe(true);
  });
});
