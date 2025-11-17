/**
 * API Route: GET /api/worktrees
 * Returns all worktrees sorted by updated_at DESC
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '@/lib/db-instance';
import { getWorktrees } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const db = getDbInstance();
    const worktrees = getWorktrees(db);

    return NextResponse.json(worktrees, { status: 200 });
  } catch (error) {
    console.error('Error fetching worktrees:', error);
    return NextResponse.json(
      { error: 'Failed to fetch worktrees' },
      { status: 500 }
    );
  }
}
