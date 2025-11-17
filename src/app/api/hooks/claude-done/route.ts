/**
 * API Route: POST /api/hooks/claude-done
 * Webhook called when Claude CLI completes a request
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '@/lib/db-instance';
import { getWorktreeById, createMessage, updateSessionState } from '@/lib/db';
import { capturePane } from '@/lib/tmux';

interface ClaudeDoneRequest {
  worktreeId: string;
  sessionName: string;
}

interface ParsedOutput {
  content: string;
  summary?: string;
  logFileName?: string;
  requestId?: string;
}

/**
 * Parse tmux output to extract log information
 */
function parseClaudeOutput(output: string): ParsedOutput {
  const result: ParsedOutput = {
    content: output,
  };

  // Look for log file separator pattern
  // Format:
  // ───────────────────────────────────────────────────────────────
  // 📄 Session log: /path/to/.claude/logs/2025-01-17_10-30-45_abc123.jsonl
  // Request ID: abc123
  // Summary: Some summary text
  // ───────────────────────────────────────────────────────────────

  const logFileMatch = output.match(/📄 Session log: (.+?\/([^\/\s]+\.jsonl))/);
  if (logFileMatch) {
    result.logFileName = logFileMatch[2]; // Just the filename
  }

  const requestIdMatch = output.match(/Request ID: ([^\s\n]+)/);
  if (requestIdMatch) {
    result.requestId = requestIdMatch[1];
  }

  const summaryMatch = output.match(/Summary: (.+?)(?:\n─|$)/s);
  if (summaryMatch) {
    result.summary = summaryMatch[1].trim();
  }

  return result;
}

export async function POST(request: NextRequest) {
  try {
    const db = getDbInstance();

    // Parse request body
    const body: ClaudeDoneRequest = await request.json();

    // Validate request
    if (!body.worktreeId || typeof body.worktreeId !== 'string') {
      return NextResponse.json(
        { error: 'worktreeId is required and must be a string' },
        { status: 400 }
      );
    }

    if (!body.sessionName || typeof body.sessionName !== 'string') {
      return NextResponse.json(
        { error: 'sessionName is required and must be a string' },
        { status: 400 }
      );
    }

    // Check if worktree exists
    const worktree = getWorktreeById(db, body.worktreeId);
    if (!worktree) {
      return NextResponse.json(
        { error: `Worktree '${body.worktreeId}' not found` },
        { status: 404 }
      );
    }

    // Capture tmux pane output
    const output = await capturePane(body.sessionName, 1000);

    // Parse output to extract log information
    const parsed = parseClaudeOutput(output);

    // Create Claude message
    const message = createMessage(db, {
      worktreeId: body.worktreeId,
      role: 'claude',
      content: parsed.content,
      summary: parsed.summary,
      timestamp: new Date(),
      logFileName: parsed.logFileName,
      requestId: parsed.requestId,
    });

    // Update session state (last captured line)
    const lineCount = output.split('\n').length;
    updateSessionState(db, body.worktreeId, lineCount);

    return NextResponse.json(
      {
        success: true,
        messageId: message.id,
        summary: parsed.summary,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error processing Claude done hook:', error);
    return NextResponse.json(
      { error: 'Failed to process Claude done hook' },
      { status: 500 }
    );
  }
}
