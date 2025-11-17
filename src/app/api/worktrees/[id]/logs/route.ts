/**
 * API Route: GET /api/worktrees/:id/logs
 * Returns list of log files for a specific worktree
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '@/lib/db-instance';
import { getWorktreeById } from '@/lib/db';
import fs from 'fs';
import path from 'path';

interface LogFileInfo {
  filename: string;
  size: number;
  modifiedAt: string;
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

    // Construct logs directory path
    const logsDir = path.join(worktree.path, '.claude', 'logs');

    // Check if logs directory exists
    if (!fs.existsSync(logsDir)) {
      return NextResponse.json([], { status: 200 });
    }

    // Read log files
    const files = fs.readdirSync(logsDir);

    // Filter for .jsonl files and get file info
    const logFiles: LogFileInfo[] = files
      .filter((file) => {
        const filePath = path.join(logsDir, file);
        const stat = fs.statSync(filePath);
        return stat.isFile() && file.endsWith('.jsonl');
      })
      .map((file) => {
        const filePath = path.join(logsDir, file);
        const stat = fs.statSync(filePath);
        return {
          filename: file,
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => {
        // Sort by modified time DESC (newest first)
        return new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime();
      });

    return NextResponse.json(logFiles, { status: 200 });
  } catch (error) {
    console.error('Error fetching log files:', error);
    return NextResponse.json(
      { error: 'Failed to fetch log files' },
      { status: 500 }
    );
  }
}
