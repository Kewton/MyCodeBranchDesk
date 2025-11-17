/**
 * API Route: GET /api/worktrees/:id/logs/:filename
 * Returns content of a specific log file
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '@/lib/db-instance';
import { getWorktreeById } from '@/lib/db';
import { validateWorktreePath } from '@/lib/path-validator';
import { getEnv } from '@/lib/env';
import fs from 'fs';
import path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; filename: string } }
) {
  try {
    const db = getDbInstance();
    const env = getEnv();

    // Check if worktree exists
    const worktree = getWorktreeById(db, params.id);
    if (!worktree) {
      return NextResponse.json(
        { error: `Worktree '${params.id}' not found` },
        { status: 404 }
      );
    }

    // Validate worktree path is within root directory
    try {
      validateWorktreePath(worktree.path, env.MCBD_ROOT_DIR);
    } catch (error) {
      console.error('Worktree path validation failed:', error);
      return NextResponse.json(
        { error: 'Invalid worktree path' },
        { status: 500 }
      );
    }

    // Validate filename to prevent path traversal attacks
    const filename = params.filename;

    // Only allow .jsonl files
    if (!filename.endsWith('.jsonl')) {
      return NextResponse.json(
        { error: 'Invalid filename: must be a .jsonl file' },
        { status: 400 }
      );
    }

    // Construct logs directory path
    const logsDir = path.join(worktree.path, '.claude', 'logs');

    // Validate and resolve the file path to prevent path traversal
    let filePath: string;
    try {
      filePath = validateWorktreePath(filename, logsDir);
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid filename: path traversal not allowed' },
        { status: 400 }
      );
    }

    // Verify the file exists
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
