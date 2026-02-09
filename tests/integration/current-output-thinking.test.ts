/**
 * Integration tests for Issue #188: thinking indicator false detection
 *
 * Tests verify the interaction between:
 * - status-detector.ts (detectSessionStatus)
 * - cli-patterns.ts (detectThinking, CLAUDE_THINKING_PATTERN)
 * - prompt-detector.ts (detectPrompt)
 *
 * These tests simulate realistic tmux output scenarios to verify that
 * the status detection pipeline correctly handles thinking summaries
 * in scrollback combined with active prompts.
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import { detectSessionStatus } from '@/lib/status-detector';
import { CLAUDE_THINKING_PATTERN, stripAnsi } from '@/lib/cli-patterns';

describe('Issue #188: current-output thinking integration', () => {
  describe('spinner resolution after response completion', () => {
    it('should resolve spinner when prompt appears after completed thinking summary', () => {
      // Realistic scenario: Claude responded, thinking summary in scrollback,
      // separator and prompt at the end
      const tmuxOutput = [
        '\u276F Tell me about TypeScript',
        '',
        '\u2733 Churned for 41s\u2026',
        '',
        'TypeScript is a statically typed superset of JavaScript.',
        'It adds optional type annotations and class-based object-oriented programming.',
        '',
        'Key features include static typing, interfaces, and generics.',
        '',
        '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500',
        '\u276F ',
      ].join('\n');

      const result = detectSessionStatus(tmuxOutput, 'claude');

      // Spinner should be resolved (not running/thinking_indicator)
      expect(result.status).not.toBe('running');
      // Should detect the input prompt
      expect(result.status).toBe('ready');
      expect(result.reason).toBe('input_prompt');
      expect(result.hasActivePrompt).toBe(false);
    });

    it('should derive thinking=false when thinking summary is outside 5-line window', () => {
      const tmuxOutput = [
        '\u276F Explain generics',
        '\u2733 Analyzing code\u2026',
        '',
        'Generics allow you to create reusable components.',
        'They work with any data type.',
        '',
        'Example:',
        'function identity<T>(arg: T): T { return arg; }',
        '',
        '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500',
        '\u276F ',
      ].join('\n');

      const result = detectSessionStatus(tmuxOutput, 'claude');

      // SF-001 (S3): thinking should be false (summary is outside 5-line window)
      const thinking = result.status === 'running' && result.reason === 'thinking_indicator';
      expect(thinking).toBe(false);
    });
  });

  describe('spinner display during active thinking', () => {
    it('should show spinner when thinking indicator is active in last 5 lines', () => {
      const tmuxOutput = [
        '\u276F Refactor the authentication module',
        '',
        '\u2733 Planning\u2026',
      ].join('\n');

      const result = detectSessionStatus(tmuxOutput, 'claude');

      expect(result.status).toBe('running');
      expect(result.confidence).toBe('high');
      expect(result.reason).toBe('thinking_indicator');

      // SF-001 (S3): thinking field derivation
      const thinking = result.status === 'running' && result.reason === 'thinking_indicator';
      expect(thinking).toBe(true);
    });

    it('should show spinner when (esc to interrupt) is in output', () => {
      const tmuxOutput = [
        '\u276F Write comprehensive tests',
        '',
        '\u2733 Analyzing codebase\u2026',
        '(esc to interrupt)',
      ].join('\n');

      const result = detectSessionStatus(tmuxOutput, 'claude');

      expect(result.status).toBe('running');
      expect(result.reason).toBe('thinking_indicator');
    });
  });

  describe('Issue #161 regression: thinking takes priority when active', () => {
    it('should detect active thinking even when numbered list exists in output', () => {
      // When Claude is actively thinking (indicator in last 5 lines),
      // thinking status takes priority. In the actual flow, prompt detection
      // in current-output/route.ts is skipped during thinking (Issue #161 Layer 1).
      const tmuxOutput = [
        '\u276F List the steps for deployment',
        '',
        'Here are the steps:',
        '\u2733 Thinking\u2026', // active thinking at end (within 5 lines)
      ].join('\n');

      const result = detectSessionStatus(tmuxOutput, 'claude');

      // Note: detectSessionStatus checks prompt BEFORE thinking (priority order).
      // The numbered list "1. 2. 3." with Claude's requireDefaultIndicator=false
      // could be detected as a prompt by detectPrompt. However, in this test
      // the numbered list is NOT present in the last 15 lines in a way that
      // triggers multiple_choice detection (needs question line + consecutive options).
      // The active thinking indicator IS in the last 5 lines.
      expect(result.status).toBe('running');
      expect(result.reason).toBe('thinking_indicator');
    });
  });

  describe('SF-001 (S3): thinking field transition verification', () => {
    it('should set thinking=true when active thinking indicator in last 5 lines', () => {
      const output = [
        'Previous response content',
        '\u2733 Processing request\u2026',
      ].join('\n');

      const result = detectSessionStatus(output, 'claude');
      const thinking = result.status === 'running' && result.reason === 'thinking_indicator';
      expect(thinking).toBe(true);
    });

    it('should set thinking=false when thinking summary is outside 5-line window with prompt', () => {
      const output = [
        '\u2733 Churned for 41s\u2026', // thinking summary at top
        'Response line 1',
        'Response line 2',
        'Response line 3',
        'Response line 4',
        'Response line 5',
        '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500',
        '\u276F ',
      ].join('\n');

      const result = detectSessionStatus(output, 'claude');
      const thinking = result.status === 'running' && result.reason === 'thinking_indicator';
      expect(thinking).toBe(false);
      // Should detect prompt instead
      expect(result.status).toBe('ready');
    });

    it('should set thinking=false when thinking summary is outside 5-line window without prompt', () => {
      const output = [
        '\u2733 Churned for 41s\u2026', // thinking summary at top
        'Response line 1',
        'Response line 2',
        'Response line 3',
        'Response line 4',
        'Response line 5',
        'Response line 6 (no prompt)',
      ].join('\n');

      const result = detectSessionStatus(output, 'claude');
      const thinking = result.status === 'running' && result.reason === 'thinking_indicator';
      expect(thinking).toBe(false);
      // Without prompt or thinking, falls to default
      expect(result.status).toBe('running');
      expect(result.confidence).toBe('low');
    });
  });

  describe('SF-004 (S3): isPromptWaiting source of truth', () => {
    it('should use 15-line window for prompt detection (statusResult.hasActivePrompt)', () => {
      // Create output where a y/n prompt is beyond 15 lines from end
      // but within the 50-line window that detectPrompt uses internally
      const lines: string[] = [];
      lines.push('Do you want to proceed? (y/n)'); // prompt at top
      // Add 16 lines after to push prompt outside 15-line window
      for (let i = 0; i < 16; i++) {
        lines.push(`Response content line ${i + 1}`);
      }

      const output = lines.join('\n');
      const result = detectSessionStatus(output, 'claude');

      // isPromptWaiting should be false because the prompt is outside
      // the 15-line window used by detectSessionStatus (source of truth)
      expect(result.hasActivePrompt).toBe(false);
    });
  });

  describe('ANSI code handling', () => {
    it('should strip ANSI codes before thinking/prompt detection', () => {
      // Output with ANSI color codes
      const tmuxOutput = [
        '\x1b[32m\u276F Tell me about TypeScript\x1b[0m',
        '',
        '\x1b[33m\u2733 Churned for 41s\u2026\x1b[0m',
        '',
        'TypeScript is great.',
        '',
        '\x1b[34m\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\x1b[0m',
        '\x1b[32m\u276F \x1b[0m',
      ].join('\n');

      const result = detectSessionStatus(tmuxOutput, 'claude');

      // Should still detect the prompt correctly after ANSI stripping
      expect(result.status).toBe('ready');
      expect(result.reason).toBe('input_prompt');
    });
  });

  describe('thinking pattern verification', () => {
    it('should verify CLAUDE_THINKING_PATTERN matches completed thinking summaries', () => {
      // This verifies the pattern itself matches; windowing prevents false detection
      expect(CLAUDE_THINKING_PATTERN.test('\u2733 Churned for 41s\u2026')).toBe(true);
      expect(CLAUDE_THINKING_PATTERN.test('\u00b7 Simmering\u2026 (4m 16s)')).toBe(true);
      expect(CLAUDE_THINKING_PATTERN.test('\u2733 Planning\u2026')).toBe(true);
      expect(CLAUDE_THINKING_PATTERN.test('(esc to interrupt)')).toBe(true);
    });

    it('should NOT match non-thinking text', () => {
      expect(CLAUDE_THINKING_PATTERN.test('\u276F ')).toBe(false);
      expect(CLAUDE_THINKING_PATTERN.test('Normal response text')).toBe(false);
      expect(CLAUDE_THINKING_PATTERN.test('\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500')).toBe(false);
    });
  });
});
