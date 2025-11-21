/**
 * API Route: GET /api/worktrees/:id/current-output
 * Gets the current tmux output for a worktree (even if incomplete)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '@/lib/db-instance';
import { getWorktreeById, getSessionState } from '@/lib/db';
import { detectPrompt } from '@/lib/prompt-detector';
import { CLIToolManager } from '@/lib/cli-tools/manager';
import type { CLIToolType } from '@/lib/cli-tools/types';
import { captureSessionOutput } from '@/lib/cli-session';

const SUPPORTED_TOOLS: CLIToolType[] = ['claude', 'codex', 'gemini'];

function isCliTool(value: string | null): value is CLIToolType {
  return !!value && (SUPPORTED_TOOLS as string[]).includes(value);
}

function detectCompletion(cliToolId: CLIToolType, snippet: string): { complete: boolean; thinking: boolean } {
  switch (cliToolId) {
    case 'codex': {
      const hasPrompt = /^›\s+.+/m.test(snippet);
      const isThinking = /•\s*(Planning|Searching|Exploring|Running|Thinking|Working)/m.test(snippet);
      return { complete: hasPrompt && !isThinking, thinking: isThinking };
    }
    case 'gemini': {
      const hasShellPrompt = /(^|\n)(%|\$|.*@.*[%$#])\s*$/m.test(snippet);
      return { complete: hasShellPrompt, thinking: false };
    }
    case 'claude':
    default: {
      const hasPrompt = /^>\s*$/m.test(snippet);
      const hasSeparator = /^─{50,}$/m.test(snippet);
      const isThinking = /[✻✽⏺·∴✢✳]/m.test(snippet);
      return { complete: hasPrompt && hasSeparator && !isThinking, thinking: isThinking };
    }
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDbInstance();

    // Check if worktree exists
    const worktree = getWorktreeById(db, params.id);
    if (!worktree) {
      return NextResponse.json(
        { error: `Worktree '${params.id}' not found` },
        { status: 404 }
      );
    }

    const url = new URL(request.url);
    const cliToolParam = url.searchParams.get('cliTool');
    const cliToolId: CLIToolType = isCliTool(cliToolParam) ? cliToolParam : (worktree.cliToolId || 'claude');

    const manager = CLIToolManager.getInstance();
    const cliTool = manager.getTool(cliToolId);

    // Check if CLI session is running
    const running = await cliTool.isRunning(params.id);
    if (!running) {
      return NextResponse.json(
        {
          isRunning: false,
          content: '',
          lineCount: 0,
          cliToolId,
        },
        { status: 200 }
      );
    }

    // Get session state
    const sessionState = getSessionState(db, params.id, cliToolId);
    const lastCapturedLine = sessionState?.lastCapturedLine || 0;

    // Capture current output
    const output = await captureSessionOutput(params.id, cliToolId, 10000);
    const lines = output.split('\n');
    const totalLines = lines.length;

    // Extract new content since last capture
    const newLines = lines.slice(Math.max(0, lastCapturedLine));
    const newContent = newLines.join('\n');

    // Check for completion indicators
    const lastSection = lines.slice(-20).join('\n');
    const { complete, thinking } = detectCompletion(cliToolId, lastSection);

    // Check if it's an interactive prompt (yes/no or multiple choice)
    const promptDetection = detectPrompt(output);

    const isComplete = complete || promptDetection.isPrompt;

    return NextResponse.json({
      isRunning: true,
      cliToolId,
      content: newContent,
      fullOutput: output,
      lineCount: totalLines,
      lastCapturedLine,
      isComplete,
      isGenerating: !isComplete && !thinking && lines.length > 0,
    });
  } catch (error: any) {
    console.error('Error getting current output:', error);
    return NextResponse.json(
      { error: 'Failed to get current output' },
      { status: 500 }
    );
  }
}
