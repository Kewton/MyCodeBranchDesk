/**
 * Unit tests for response-poller Pasted text filtering
 * Issue #212: Ensure [Pasted text #N +XX lines] is filtered from responses
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import { cleanClaudeResponse } from '@/lib/response-poller';

describe('cleanClaudeResponse() - Pasted text filtering (Issue #212)', () => {
  it('should filter out lines containing Pasted text pattern', () => {
    const input = 'Some response\n[Pasted text #1 +46 lines]\nMore response';
    const result = cleanClaudeResponse(input);
    expect(result).not.toContain('[Pasted text #1');
    expect(result).toContain('Some response');
    expect(result).toContain('More response');
  });

  it('should filter multiple Pasted text lines', () => {
    const input = 'Response start\n[Pasted text #1 +10 lines]\n[Pasted text #2 +20 lines]\nResponse end';
    const result = cleanClaudeResponse(input);
    expect(result).not.toContain('[Pasted text');
    expect(result).toContain('Response start');
    expect(result).toContain('Response end');
  });

  it('should preserve normal response lines without Pasted text', () => {
    const input = 'Normal response line\nAnother normal line';
    const result = cleanClaudeResponse(input);
    expect(result).toContain('Normal response line');
    expect(result).toContain('Another normal line');
  });
});
