/**
 * API Route: GET/POST /api/worktrees/:id/auto-yes
 * Manages auto-yes mode state for a worktree
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '@/lib/db-instance';
import { getWorktreeById } from '@/lib/db';
import { getAutoYesState, setAutoYesEnabled } from '@/lib/auto-yes-manager';

export async function GET(
  _request: NextRequest,
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

    const state = getAutoYesState(params.id);
    return NextResponse.json({
      enabled: state?.enabled ?? false,
      expiresAt: state?.enabled ? state.expiresAt : null,
    });
  } catch (error: unknown) {
    console.error('Error getting auto-yes state:', error);
    return NextResponse.json(
      { error: 'Failed to get auto-yes state' },
      { status: 500 }
    );
  }
}

export async function POST(
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

    const body = await request.json();
    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'enabled must be a boolean' },
        { status: 400 }
      );
    }

    const state = setAutoYesEnabled(params.id, body.enabled);
    return NextResponse.json({
      enabled: state.enabled,
      expiresAt: state.enabled ? state.expiresAt : null,
    });
  } catch (error: unknown) {
    console.error('Error setting auto-yes state:', error);
    return NextResponse.json(
      { error: 'Failed to set auto-yes state' },
      { status: 500 }
    );
  }
}
