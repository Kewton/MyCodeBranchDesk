/**
 * API Route: GET /api/worktrees/:id/tree
 * Returns directory listing for worktree root
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '@/lib/db-instance';
import { getWorktreeById } from '@/lib/db';
import { readDirectory } from '@/lib/file-tree';

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

    // Read root directory
    const result = await readDirectory(worktree.path);

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Error reading directory:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('not found')) {
      return NextResponse.json(
        { error: 'Directory not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to read directory' },
      { status: 500 }
    );
  }
}
