/**
 * API Route: PATCH /api/worktrees/:id/cli-tool
 * Updates the CLI tool for a worktree
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '@/lib/db-instance';
import { getWorktreeById, upsertWorktree } from '@/lib/db';
import { CLI_TOOL_IDS, type CLIToolType } from '@/lib/cli-tools/types';

interface UpdateCliToolRequest {
  cliToolId: CLIToolType;
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
    const body = (await request.json()) as UpdateCliToolRequest;

    // Validate cliToolId
    if (!body.cliToolId) {
      return NextResponse.json(
        { error: 'CLI tool ID is required' },
        { status: 400 }
      );
    }

    // Issue #368: Use CLI_TOOL_IDS instead of hardcoded array (DRY, R2-001)
    if (!(CLI_TOOL_IDS as readonly string[]).includes(body.cliToolId)) {
      return NextResponse.json(
        { error: `Invalid CLI tool ID: ${body.cliToolId}. Valid values are: ${CLI_TOOL_IDS.join(', ')}` },
        { status: 400 }
      );
    }

    // Update worktree with new CLI tool
    const updatedWorktree = {
      ...worktree,
      cliToolId: body.cliToolId,
      updatedAt: new Date(),
    };

    upsertWorktree(db, updatedWorktree);

    // Return updated worktree
    return NextResponse.json(updatedWorktree, { status: 200 });
  } catch (error: unknown) {
    console.error('Error updating CLI tool:', error);
    return NextResponse.json(
      { error: 'Failed to update CLI tool' },
      { status: 500 }
    );
  }
}
