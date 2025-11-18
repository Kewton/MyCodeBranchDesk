/**
 * API Route: /api/worktrees/:id
 * GET: Returns a specific worktree by ID
 * PATCH: Updates worktree properties (e.g., memo)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '@/lib/db-instance';
import { getWorktreeById, updateWorktreeMemo } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDbInstance();
    const worktree = getWorktreeById(db, params.id);

    if (!worktree) {
      return NextResponse.json(
        { error: `Worktree '${params.id}' not found` },
        { status: 404 }
      );
    }

    return NextResponse.json(worktree, { status: 200 });
  } catch (error) {
    console.error('Error fetching worktree:', error);
    return NextResponse.json(
      { error: 'Failed to fetch worktree' },
      { status: 500 }
    );
  }
}

export async function PATCH(
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

    // Parse request body
    const body = await request.json();

    // Update memo if provided
    if ('memo' in body) {
      updateWorktreeMemo(db, params.id, body.memo);
    }

    // Return updated worktree
    const updatedWorktree = getWorktreeById(db, params.id);
    return NextResponse.json(updatedWorktree, { status: 200 });
  } catch (error) {
    console.error('Error updating worktree:', error);
    return NextResponse.json(
      { error: 'Failed to update worktree' },
      { status: 500 }
    );
  }
}
