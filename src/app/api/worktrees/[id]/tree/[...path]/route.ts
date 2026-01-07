/**
 * API Route: GET /api/worktrees/:id/tree/:path*
 * Returns directory listing for subdirectory within worktree
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '@/lib/db-instance';
import { getWorktreeById } from '@/lib/db';
import { readDirectory, isExcludedPattern } from '@/lib/file-tree';
import { isPathSafe } from '@/lib/path-validator';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; path: string[] } }
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

    // Construct relative path from path segments
    const relativePath = params.path.join('/');

    // Security: Check if any path segment is excluded
    for (const segment of params.path) {
      // Decode URL-encoded segments
      let decodedSegment = segment;
      try {
        decodedSegment = decodeURIComponent(segment);
      } catch {
        // Keep original if decoding fails
      }

      if (isExcludedPattern(decodedSegment)) {
        return NextResponse.json(
          { error: 'Access denied: Path contains excluded pattern' },
          { status: 403 }
        );
      }
    }

    // Security: Validate path is within worktree
    if (!isPathSafe(relativePath, worktree.path)) {
      return NextResponse.json(
        { error: 'Access denied: Invalid path' },
        { status: 403 }
      );
    }

    // Read subdirectory
    const result = await readDirectory(worktree.path, relativePath);

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

    if (message.includes('not a directory')) {
      return NextResponse.json(
        { error: 'Path is not a directory' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to read directory' },
      { status: 500 }
    );
  }
}
