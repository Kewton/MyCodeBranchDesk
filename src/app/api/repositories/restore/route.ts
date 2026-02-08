/**
 * API Route: PUT /api/repositories/restore
 * Restores an excluded repository and auto-syncs its worktrees
 * Issue #190: Repository exclusion on sync
 *
 * HTTP Method: PUT chosen over PATCH because this operation performs
 * a complete state restoration (enabled flag + worktrees table sync),
 * not just a partial field update. See design policy SF-C03.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '@/lib/db-instance';
import {
  resolveRepositoryPath,
  restoreRepository,
} from '@/lib/db-repository';
import { isSystemDirectory } from '@/config/system-directories';
import { scanWorktrees, syncWorktreesToDB } from '@/lib/worktrees';
import fs from 'fs';

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { repositoryPath } = body;

    // Validate input
    if (!repositoryPath || typeof repositoryPath !== 'string') {
      return NextResponse.json(
        { success: false, error: 'repositoryPath is required' },
        { status: 400 }
      );
    }

    // Path traversal validation (SEC-MF-001)
    if (repositoryPath.includes('\0')) {
      return NextResponse.json(
        { success: false, error: 'Invalid repository path' },
        { status: 400 }
      );
    }

    const resolvedPath = resolveRepositoryPath(repositoryPath);

    if (isSystemDirectory(resolvedPath)) {
      return NextResponse.json(
        { success: false, error: 'Invalid repository path' },
        { status: 400 }
      );
    }

    const db = getDbInstance();

    // Restore repository (set enabled=1)
    const restored = restoreRepository(db, repositoryPath);
    if (!restored) {
      return NextResponse.json(
        { success: false, error: 'Repository not found in exclusion list' },
        { status: 404 }
      );
    }

    // Check if the repository path exists on disk
    if (!fs.existsSync(resolvedPath)) {
      return NextResponse.json({
        success: true,
        worktreeCount: 0,
        warning: 'Repository path not found on disk. No worktrees were restored.',
      });
    }

    // Auto-sync: scan worktrees and sync to DB (SEC-SF-005: TOCTOU risk acknowledged)
    const worktrees = await scanWorktrees(resolvedPath);
    if (worktrees.length > 0) {
      syncWorktreesToDB(db, worktrees);
    }

    return NextResponse.json({
      success: true,
      worktreeCount: worktrees.length,
      message: `Repository restored with ${worktrees.length} worktree(s)`,
    });
  } catch (error: unknown) {
    // SEC-SF-003: Fixed error message - do not expose internal details
    console.error('[Repository Restore] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to restore repository' },
      { status: 500 }
    );
  }
}
