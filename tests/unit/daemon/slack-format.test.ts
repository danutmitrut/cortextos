import { describe, it, expect } from 'vitest';
import { FastChecker } from '../../../src/daemon/fast-checker';

describe('Slack format functions', () => {
  it('formatSlackPhotoMessage includes local_file and send-slack reply', () => {
    const out = FastChecker.formatSlackPhotoMessage('U123', 'C0123456', 'hello', 'slack-files/cat.jpg');
    expect(out).toContain('=== SLACK PHOTO from U123 (channel:C0123456) ===');
    expect(out).toContain('local_file: slack-files/cat.jpg');
    expect(out).toContain('hello');
    expect(out).toContain('cortextos bus send-slack C0123456');
  });

  it('formatSlackDocumentMessage includes file_name', () => {
    const out = FastChecker.formatSlackDocumentMessage('U1', 'C9', 'doc caption', 'slack-files/r.pdf', 'r.pdf');
    expect(out).toContain('=== SLACK DOCUMENT from U1 (channel:C9) ===');
    expect(out).toContain('local_file: slack-files/r.pdf');
    expect(out).toContain('file_name: r.pdf');
    expect(out).toContain('cortextos bus send-slack C9');
  });

  it('formatSlackVoiceMessage includes transcript block when present', () => {
    const out = FastChecker.formatSlackVoiceMessage('U1', 'C9', 'slack-files/v.m4a', 'salut lume');
    expect(out).toContain('=== SLACK VOICE from U1 (channel:C9) ===');
    expect(out).toContain('local_file: slack-files/v.m4a');
    expect(out).toContain('transcript:');
    expect(out).toContain('salut lume');
  });

  it('formatSlackVoiceMessage omits transcript block when absent', () => {
    const out = FastChecker.formatSlackVoiceMessage('U1', 'C9', 'slack-files/v.m4a', undefined);
    expect(out).not.toContain('transcript:');
    expect(out).toContain('local_file: slack-files/v.m4a');
  });

  it('formatSlackVideoMessage includes file_name and caption', () => {
    const out = FastChecker.formatSlackVideoMessage('U1', 'C9', 'clip caption', 'slack-files/c.mp4', 'c.mp4');
    expect(out).toContain('=== SLACK VIDEO from U1 (channel:C9) ===');
    expect(out).toContain('local_file: slack-files/c.mp4');
    expect(out).toContain('file_name: c.mp4');
    expect(out).toContain('clip caption');
  });
});
