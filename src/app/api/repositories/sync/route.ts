/**
 * API Route: POST /api/repositories/sync
 * Re-scans all configured repositories and syncs worktrees to database
 * Issue #190: Filter excluded repositories before scanning
 */

import { NextResponse } from 'next/server';
import { getDbInstance } from '@/lib/db-instance';
import { getRepositoryPaths, scanMultipleRepositories, syncWorktreesToDB } from '@/lib/worktrees';
import { ensureEnvRepositoriesRegistered, filterExcludedPaths } from '@/lib/db-repository';

export async function POST() {
  try {
    // Get configured repository paths from environment
    const repositoryPaths = getRepositoryPaths();

    if (repositoryPaths.length === 0) {
      return NextResponse.json(
        { error: 'No repositories configured. Please set WORKTREE_REPOS or CM_ROOT_DIR environment variable.' },
        { status: 400 }
      );
    }

    const db = getDbInstance();

    // Issue #190: Register environment variable repositories to repositories table (idempotent)
    // NOTE: Must be called BEFORE filterExcludedPaths() - order dependency
    ensureEnvRepositoriesRegistered(db, repositoryPaths);

    // Issue #190: Filter out excluded (enabled=0) repositories
    // NOTE: Requires ensureEnvRepositoriesRegistered() to have been called first
    const filteredPaths = filterExcludedPaths(db, repositoryPaths);

    // Scan filtered repositories (excluded repos are skipped)
    const allWorktrees = await scanMultipleRepositories(filteredPaths);

    // Sync to database
    syncWorktreesToDB(db, allWorktrees);

    // Get unique repository count
    const uniqueRepos = new Set(allWorktrees.map(wt => wt.repositoryPath));

    return NextResponse.json(
      {
        success: true,
        message: `Successfully synced ${allWorktrees.length} worktree(s) from ${uniqueRepos.size} repository/repositories`,
        worktreeCount: allWorktrees.length,
        repositoryCount: uniqueRepos.size,
        repositories: Array.from(uniqueRepos),
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error('Error syncing repositories:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to sync repositories';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
