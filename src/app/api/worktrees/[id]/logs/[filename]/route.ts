/**
 * API Route: GET /api/worktrees/:id/logs/:filename
 * Returns content of a specific log file
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '@/lib/db-instance';
import { getWorktreeById } from '@/lib/db';
import fs from 'fs';
import path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; filename: string } }
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

    // Validate filename to prevent path traversal attacks
    const filename = params.filename;

    // Check for path traversal attempts
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return NextResponse.json(
        { error: 'Invalid filename: path traversal not allowed' },
        { status: 400 }
      );
    }

    // Only allow .jsonl files
    if (!filename.endsWith('.jsonl')) {
      return NextResponse.json(
        { error: 'Invalid filename: must be a .jsonl file' },
        { status: 400 }
      );
    }

    // Construct file path
    const logsDir = path.join(worktree.path, '.claude', 'logs');
    const filePath = path.join(logsDir, filename);

    // Verify the file exists and is within the logs directory
    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: `Log file '${filename}' not found` },
        { status: 404 }
      );
    }

    // Verify it's a file (not a directory)
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      return NextResponse.json(
        { error: `'${filename}' is not a file` },
        { status: 400 }
      );
    }

    // Read file content
    const content = fs.readFileSync(filePath, 'utf-8');

    return NextResponse.json(
      {
        filename,
        content,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error reading log file:', error);
    return NextResponse.json(
      { error: 'Failed to read log file' },
      { status: 500 }
    );
  }
}
