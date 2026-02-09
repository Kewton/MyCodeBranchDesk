/**
 * Unit tests for status-detector.ts
 * Issue #188: Thinking indicator false detection fix
 *
 * Tests verify:
 * - Prompt takes priority over thinking (correct priority order)
 * - Thinking detection uses separate 5-line window (STATUS_THINKING_LINE_COUNT)
 * - Completed thinking summaries outside 5-line window are not falsely detected
 * - Boundary conditions for STATUS_THINKING_LINE_COUNT
 * - Empty line handling in window-based detection
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import { detectSessionStatus } from '@/lib/status-detector';

describe('status-detector', () => {
  describe('Issue #188: thinking + prompt coexistence', () => {
    it('should prioritize prompt over thinking summary (ready)', () => {
      // Scenario: Completed thinking summary in scrollback, prompt at the end
      // The thinking summary "Churned for 41s" is more than 5 lines from the end
      const output = [
        'Some response content line 1',
        'Some response content line 2',
        '\u2733 Churned for 41s\u2026', // thinking summary at line 3 (far from end)
        'More response content',
        'More response content',
        'More response content',
        'More response content',
        'More response content',
        '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500', // separator
        '\u276F ', // prompt at the end
      ].join('\n');

      const result = detectSessionStatus(output, 'claude');
      expect(result.status).toBe('ready');
      expect(result.reason).toBe('input_prompt');
      expect(result.hasActivePrompt).toBe(false);
    });

    it('should prioritize interactive prompt (waiting) over thinking summary', () => {
      // Scenario: y/n prompt at the end with old thinking summary in scrollback
      const output = [
        'Some response content',
        '\u2733 Churned for 41s\u2026', // thinking summary (far from end)
        'More content',
        'More content',
        'More content',
        'More content',
        'More content',
        'Do you want to proceed? (y/n)',
      ].join('\n');

      const result = detectSessionStatus(output, 'claude');
      expect(result.status).toBe('waiting');
      expect(result.hasActivePrompt).toBe(true);
      expect(result.reason).toBe('prompt_detected');
    });
  });

  describe('Issue #188: active thinking detection (within 5-line window)', () => {
    it('should detect active thinking indicator in last 5 lines', () => {
      const output = [
        'Some previous output',
        'More previous output',
        'Content line',
        '\u2733 Planning\u2026', // active thinking in last 5 lines
      ].join('\n');

      const result = detectSessionStatus(output, 'claude');
      expect(result.status).toBe('running');
      expect(result.confidence).toBe('high');
      expect(result.reason).toBe('thinking_indicator');
      expect(result.hasActivePrompt).toBe(false);
    });

    it('should detect (esc to interrupt) in last 5 lines', () => {
      const output = [
        'Some previous output',
        'More content',
        '(esc to interrupt)',
      ].join('\n');

      const result = detectSessionStatus(output, 'claude');
      expect(result.status).toBe('running');
      expect(result.confidence).toBe('high');
      expect(result.reason).toBe('thinking_indicator');
    });
  });

  describe('Issue #188: thinking summary outside 5-line window (false detection prevention)', () => {
    it('should not detect thinking summary at line 6+ from end when prompt exists', () => {
      // The thinking summary is at position > 5 lines from end
      // With a prompt present, it should return ready
      const output = [
        '\u2733 Churned for 41s\u2026', // thinking summary - line 1 (far from end)
        'Response content line 2',
        'Response content line 3',
        'Response content line 4',
        'Response content line 5',
        'Response content line 6',
        '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500', // separator
        '\u276F ', // prompt
      ].join('\n');

      const result = detectSessionStatus(output, 'claude');
      expect(result.status).toBe('ready');
      expect(result.reason).toBe('input_prompt');
    });

    it('should not detect thinking summary at line 6+ when no prompt exists', () => {
      // Thinking summary far from end, no prompt -> default running (low confidence)
      const output = [
        '\u2733 Churned for 41s\u2026', // thinking summary at line 1
        'Response line 2',
        'Response line 3',
        'Response line 4',
        'Response line 5',
        'Response line 6',
        'Response line 7',
        'Response line 8',
      ].join('\n');

      const result = detectSessionStatus(output, 'claude');
      // Without prompt or active thinking, should fall through to default
      expect(result.status).toBe('running');
      expect(result.confidence).toBe('low');
      expect(result.reason).toBe('default');
    });
  });

  describe('Issue #188: STATUS_THINKING_LINE_COUNT boundary tests', () => {
    it('should detect thinking indicator at exactly the 5th line from end (boundary)', () => {
      // 5 lines from end: lines.slice(-5) should include this
      const output = [
        'Line far above',
        'Line far above 2',
        '\u2733 Processing\u2026', // exactly 5th from end (index -5)
        'Line 4 from end',
        'Line 3 from end',
        'Line 2 from end',
        'Line 1 from end (last)',
      ].join('\n');

      const result = detectSessionStatus(output, 'claude');
      expect(result.status).toBe('running');
      expect(result.confidence).toBe('high');
      expect(result.reason).toBe('thinking_indicator');
    });

    it('should NOT detect thinking indicator at 6th line from end (just outside window)', () => {
      // 6th line from end: lines.slice(-5) should NOT include this
      const output = [
        'Line far above',
        '\u2733 Processing\u2026', // 6th from end (index -6) - outside window
        'Line 5 from end',
        'Line 4 from end',
        'Line 3 from end',
        'Line 2 from end',
        'Line 1 from end (last)',
      ].join('\n');

      const result = detectSessionStatus(output, 'claude');
      // Should NOT detect thinking (outside 5-line window)
      expect(result.reason).not.toBe('thinking_indicator');
    });
  });

  describe('Issue #188 C-002: empty lines in output', () => {
    it('should detect thinking indicator with many empty lines in 5-line window', () => {
      // Empty lines are included in the window, thinking indicator still in last 5 lines
      const output = [
        'Previous output',
        '',
        '',
        '\u2733 Analyzing\u2026', // within last 5 lines
        '',
      ].join('\n');

      const result = detectSessionStatus(output, 'claude');
      expect(result.status).toBe('running');
      expect(result.reason).toBe('thinking_indicator');
    });

    it('should detect prompt with many empty lines in 15-line window', () => {
      // Prompt exists in 15-line window with many empty lines
      const output = [
        'Previous output',
        '',
        '',
        '',
        '',
        '',
        'Do you want to continue? (y/n)',
        '',
        '',
        '\u276F Yes',
      ].join('\n');

      const result = detectSessionStatus(output, 'claude');
      expect(result.status).toBe('waiting');
      expect(result.hasActivePrompt).toBe(true);
    });

    it('should detect input prompt with empty line padding (15-line all-line window)', () => {
      // Prompt at end with empty lines: the 15-line window includes all lines (including empty)
      const output = [
        'Content',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500',
        '\u276F ',
        '',
        '',
      ].join('\n');

      const result = detectSessionStatus(output, 'claude');
      expect(result.status).toBe('ready');
      expect(result.reason).toBe('input_prompt');
    });
  });

  describe('Issue #188 SF-002 (S3): prompt outside 15-line all-line window', () => {
    it('should fail to detect prompt when it is beyond 15 all-lines from end', () => {
      // Prompt at line 16+ from end (with empty padding) is outside the 15-line window
      // This is a known behavior change documented in the design policy
      const lines: string[] = [];
      lines.push('Content');
      lines.push('\u276F '); // prompt - will be at position > 15 lines from end
      // Add 16 lines after the prompt
      for (let i = 0; i < 16; i++) {
        lines.push('');
      }

      const output = lines.join('\n');

      const result = detectSessionStatus(output, 'claude');
      // Prompt is outside 15-line window, so it should NOT be detected
      expect(result.hasActivePrompt).toBe(false);
      // Without prompt detection, falls through to default
      expect(result.status).toBe('running');
      expect(result.confidence).toBe('low');
    });
  });

  describe('existing behavior preservation', () => {
    it('should return ready with time-based heuristic when no patterns match', () => {
      const output = 'Some generic output without patterns';
      const oldTimestamp = new Date(Date.now() - 10000); // 10 seconds ago

      const result = detectSessionStatus(output, 'claude', oldTimestamp);
      expect(result.status).toBe('ready');
      expect(result.confidence).toBe('low');
      expect(result.reason).toBe('no_recent_output');
    });

    it('should return running (low confidence) as default when no patterns match', () => {
      const output = 'Some generic output without any detectable patterns';

      const result = detectSessionStatus(output, 'claude');
      expect(result.status).toBe('running');
      expect(result.confidence).toBe('low');
      expect(result.reason).toBe('default');
    });

    it('should detect codex thinking indicator', () => {
      const output = '\u2022 Planning something';

      const result = detectSessionStatus(output, 'codex');
      expect(result.status).toBe('running');
      expect(result.reason).toBe('thinking_indicator');
    });
  });
});
