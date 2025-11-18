/**
 * API Route: POST /api/repositories/scan
 * Scans a repository path for worktrees and adds them to the database
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '@/lib/db-instance';
import { scanWorktrees, syncWorktreesToDB } from '@/lib/worktrees';
import { isPathSafe } from '@/lib/path-validator';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { repositoryPath } = body;

    // Validate input
    if (!repositoryPath || typeof repositoryPath !== 'string') {
      return NextResponse.json(
        { error: 'Repository path is required' },
        { status: 400 }
      );
    }

    // Security: Validate path safety
    if (!isPathSafe(repositoryPath)) {
      return NextResponse.json(
        { error: 'Invalid or unsafe repository path' },
        { status: 400 }
      );
    }

    // Scan for worktrees
    const worktrees = await scanWorktrees(repositoryPath);

    if (worktrees.length === 0) {
      return NextResponse.json(
        { error: 'No worktrees found in the specified path. Make sure it is a valid git repository.' },
        { status: 404 }
      );
    }

    // Sync to database
    const db = getDbInstance();
    syncWorktreesToDB(db, worktrees);

    return NextResponse.json(
      {
        success: true,
        message: `Successfully scanned and added ${worktrees.length} worktree(s)`,
        worktreeCount: worktrees.length,
        repositoryPath: worktrees[0].repositoryPath,
        repositoryName: worktrees[0].repositoryName,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error scanning repository:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to scan repository' },
      { status: 500 }
    );
  }
}
