/**
 * Unit tests for CodexTool.sendMessage() - Pasted text detection
 * Issue #212: Pasted text detection for Codex CLI
 *
 * Separate test file to avoid vi.mock affecting existing codex.test.ts
 * tests (SF-S3-002: isRunning test uses real tmux).
 *
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock tmux module
vi.mock('@/lib/tmux', () => ({
  hasSession: vi.fn(),
  createSession: vi.fn(),
  sendKeys: vi.fn(),
  capturePane: vi.fn(),
  killSession: vi.fn(),
}));

/**
 * Mock child_process for execAsync (used by codex.ts for tmux send-keys C-m).
 * The exec callback can be either the 2nd or 3rd argument depending on
 * whether options are passed.
 */
vi.mock('child_process', () => ({
  exec: vi.fn((_cmd: string, optsOrCb: unknown, cb?: unknown) => {
    const callback = typeof optsOrCb === 'function' ? optsOrCb : cb;
    if (typeof callback === 'function') {
      (callback as (err: null, result: { stdout: string; stderr: string }) => void)(
        null, { stdout: '', stderr: '' }
      );
    }
    return {};
  }),
}));

// Mock pasted-text-helper (MF-S2-002: codex.ts only imports the helper)
vi.mock('@/lib/pasted-text-helper', () => ({
  detectAndResendIfPastedText: vi.fn().mockResolvedValue(undefined),
}));

// Mock sendSpecialKey from tmux (needed by base class)
vi.mock('@/lib/cli-tools/validation', () => ({
  validateSessionName: vi.fn(),
}));

import { CodexTool } from '@/lib/cli-tools/codex';
import { hasSession, sendKeys } from '@/lib/tmux';
import { detectAndResendIfPastedText } from '@/lib/pasted-text-helper';

const TEST_WORKTREE_ID = 'test-worktree';
const TEST_SESSION_NAME = 'mcbd-codex-test-worktree';

describe('CodexTool.sendMessage() - Pasted text detection (Issue #212)', () => {
  let tool: CodexTool;

  beforeEach(() => {
    vi.clearAllMocks();
    tool = new CodexTool();
    vi.mocked(hasSession).mockResolvedValue(true);
    vi.mocked(sendKeys).mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // MF-001: Single-line messages should skip detection
  it('should skip Pasted text detection for single-line messages', async () => {
    await tool.sendMessage(TEST_WORKTREE_ID, 'hello');

    // detectAndResendIfPastedText should NOT be called
    expect(detectAndResendIfPastedText).not.toHaveBeenCalled();
  });

  // Multi-line messages should trigger detection
  it('should call detectAndResendIfPastedText for multi-line messages', async () => {
    await tool.sendMessage(TEST_WORKTREE_ID, 'line1\nline2');

    // detectAndResendIfPastedText should be called after execAsync(C-m)
    expect(detectAndResendIfPastedText).toHaveBeenCalledWith(TEST_SESSION_NAME);
    expect(detectAndResendIfPastedText).toHaveBeenCalledTimes(1);
  });

  // SF-003: Verify call order - sendKeys(message) -> execAsync(C-m) -> detectAndResendIfPastedText
  it('should call detectAndResendIfPastedText after execAsync(C-m)', async () => {
    const callOrder: string[] = [];

    vi.mocked(sendKeys).mockImplementation(async () => {
      callOrder.push('sendKeys');
    });

    // Override exec mock to track call order
    const { exec } = await import('child_process');
    vi.mocked(exec).mockImplementation(((_cmd: string, optsOrCb: unknown, cb?: unknown) => {
      callOrder.push('execAsync');
      const callback = typeof optsOrCb === 'function' ? optsOrCb : cb;
      if (typeof callback === 'function') {
        (callback as (err: null, stdout: string, stderr: string) => void)(null, '', '');
      }
      return {} as ReturnType<typeof exec>;
    }) as typeof exec);

    vi.mocked(detectAndResendIfPastedText).mockImplementation(async () => {
      callOrder.push('detectAndResendIfPastedText');
    });

    await tool.sendMessage(TEST_WORKTREE_ID, 'line1\nline2');

    // Verify order: sendKeys (message) -> execAsync (C-m Enter) -> detectAndResendIfPastedText
    expect(callOrder).toEqual([
      'sendKeys',       // sendKeys(message, false)
      'execAsync',      // execAsync(tmux send-keys C-m)
      'detectAndResendIfPastedText',  // Pasted text detection
    ]);
  });

  // Verify existing send flow is maintained
  it('should maintain existing sendKeys + execAsync flow for message delivery', async () => {
    await tool.sendMessage(TEST_WORKTREE_ID, 'single line');

    // sendKeys should be called once for the message
    expect(sendKeys).toHaveBeenCalledWith(TEST_SESSION_NAME, 'single line', false);
  });
});
