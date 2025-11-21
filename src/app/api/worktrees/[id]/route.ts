/**
 * API Route: /api/worktrees/:id
 * GET: Returns a specific worktree by ID
 * PATCH: Updates worktree properties (e.g., memo)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '@/lib/db-instance';
import { getWorktreeById, updateWorktreeMemo, updateWorktreeLink, updateFavorite, updateStatus, updateCliToolId } from '@/lib/db';
import { CLIToolManager } from '@/lib/cli-tools/manager';
import type { CLIToolType } from '@/lib/cli-tools/types';

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

    const manager = CLIToolManager.getInstance();
    const cliToolId = worktree.cliToolId || 'claude';
    const cliTool = manager.getTool(cliToolId);
    const isRunning = await cliTool.isRunning(params.id);

    return NextResponse.json(
      { ...worktree, isSessionRunning: isRunning },
      { status: 200 }
    );
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

    // Update link if provided
    if ('link' in body) {
      updateWorktreeLink(db, params.id, body.link);
    }

    // Update favorite if provided
    if ('favorite' in body && typeof body.favorite === 'boolean') {
      updateFavorite(db, params.id, body.favorite);
    }

    // Update status if provided
    if ('status' in body) {
      const validStatuses = ['todo', 'doing', 'done', null];
      if (validStatuses.includes(body.status)) {
        updateStatus(db, params.id, body.status);
      }
    }

    // Update CLI tool ID if provided
    if ('cliToolId' in body) {
      const validCliTools: CLIToolType[] = ['claude', 'codex', 'gemini'];
      if (validCliTools.includes(body.cliToolId)) {
        updateCliToolId(db, params.id, body.cliToolId);
      }
    }

    // Return updated worktree with session status
    const updatedWorktree = getWorktreeById(db, params.id);
    const manager = CLIToolManager.getInstance();
    const cliToolId = updatedWorktree?.cliToolId || 'claude';
    const cliTool = manager.getTool(cliToolId);
    const isRunning = await cliTool.isRunning(params.id);
    return NextResponse.json(
      { ...updatedWorktree, isSessionRunning: isRunning },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error updating worktree:', error);
    return NextResponse.json(
      { error: 'Failed to update worktree' },
      { status: 500 }
    );
  }
}
