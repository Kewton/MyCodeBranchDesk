/**
 * API Route: /api/worktrees/:id/files/:path
 * File operations for worktree files
 *
 * Methods:
 * - GET: Read file content (existing)
 * - PUT: Update file content
 * - POST: Create new file or directory
 * - DELETE: Delete file or directory
 * - PATCH: Rename file or directory
 *
 * [SF-001] Business logic delegated to file-operations.ts
 * [SF-002] Path validation using isPathSafe()
 * [SEC-SF-002] Error responses without absolute paths
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '@/lib/db-instance';
import { getWorktreeById } from '@/lib/db';
import { normalize } from 'path';
import { isPathSafe } from '@/lib/path-validator';
import {
  readFileContent,
  updateFileContent,
  createFileOrDirectory,
  deleteFileOrDirectory,
  renameFileOrDirectory,
  isEditableFile,
} from '@/lib/file-operations';
import { validateContent, isEditableExtension } from '@/config/editable-extensions';
import { extname } from 'path';

/**
 * Helper function to get worktree and validate path
 */
async function getWorktreeAndValidatePath(
  worktreeId: string,
  pathSegments: string[]
): Promise<
  | { worktree: { path: string }; relativePath: string }
  | { error: NextResponse }
> {
  const db = getDbInstance();
  const worktree = getWorktreeById(db, worktreeId);

  if (!worktree) {
    return {
      error: NextResponse.json(
        { success: false, error: { code: 'WORKTREE_NOT_FOUND', message: 'Worktree not found' } },
        { status: 404 }
      ),
    };
  }

  const requestedPath = pathSegments.join('/');
  const normalizedPath = normalize(requestedPath);

  // [SF-002] Use isPathSafe for path validation
  if (!isPathSafe(normalizedPath, worktree.path)) {
    return {
      error: NextResponse.json(
        { success: false, error: { code: 'INVALID_PATH', message: 'Invalid file path' } },
        { status: 400 }
      ),
    };
  }

  return { worktree, relativePath: normalizedPath };
}

/**
 * GET /api/worktrees/:id/files/:path
 * Read file content
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; path: string[] } }
) {
  try {
    const result = await getWorktreeAndValidatePath(params.id, params.path);
    if ('error' in result) {
      return result.error;
    }

    const { worktree, relativePath } = result;
    const fileResult = await readFileContent(worktree.path, relativePath);

    if (!fileResult.success) {
      const statusMap: Record<string, number> = {
        FILE_NOT_FOUND: 404,
        PERMISSION_DENIED: 403,
        INVALID_PATH: 400,
        INTERNAL_ERROR: 500,
      };
      const status = statusMap[fileResult.error?.code || 'INTERNAL_ERROR'] || 500;
      return NextResponse.json(
        { success: false, error: fileResult.error },
        { status }
      );
    }

    const extension = relativePath.split('.').pop() || '';

    return NextResponse.json({
      success: true,
      path: relativePath,
      content: fileResult.content,
      extension,
      worktreePath: worktree.path,
    });
  } catch (error: unknown) {
    console.error('Error reading file:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to read file' } },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/worktrees/:id/files/:path
 * Update file content
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; path: string[] } }
) {
  try {
    const result = await getWorktreeAndValidatePath(params.id, params.path);
    if ('error' in result) {
      return result.error;
    }

    const { worktree, relativePath } = result;

    // Check if file is editable
    if (!isEditableFile(relativePath)) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_EDITABLE', message: 'File type is not editable' } },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { content } = body;

    if (content === undefined) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_REQUEST', message: 'Content is required' } },
        { status: 400 }
      );
    }

    // [SEC-SF-001] Validate content
    const ext = extname(relativePath).toLowerCase();
    const contentValidation = validateContent(ext, content);
    if (!contentValidation.valid) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_CONTENT', message: contentValidation.error } },
        { status: 400 }
      );
    }

    const updateResult = await updateFileContent(worktree.path, relativePath, content);

    if (!updateResult.success) {
      const statusMap: Record<string, number> = {
        FILE_NOT_FOUND: 404,
        PERMISSION_DENIED: 403,
        INVALID_PATH: 400,
        DISK_FULL: 507,
        INTERNAL_ERROR: 500,
      };
      const status = statusMap[updateResult.error?.code || 'INTERNAL_ERROR'] || 500;
      return NextResponse.json(
        { success: false, error: updateResult.error },
        { status }
      );
    }

    return NextResponse.json({
      success: true,
      path: relativePath,
    });
  } catch (error: unknown) {
    console.error('Error updating file:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update file' } },
      { status: 500 }
    );
  }
}

/**
 * POST /api/worktrees/:id/files/:path
 * Create new file or directory
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; path: string[] } }
) {
  try {
    const result = await getWorktreeAndValidatePath(params.id, params.path);
    if ('error' in result) {
      return result.error;
    }

    const { worktree, relativePath } = result;

    const body = await request.json();
    const { type, content } = body;

    if (!type || !['file', 'directory'].includes(type)) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_REQUEST', message: 'Type must be "file" or "directory"' } },
        { status: 400 }
      );
    }

    // For files, validate content if provided
    if (type === 'file' && content !== undefined) {
      const ext = extname(relativePath).toLowerCase();
      if (isEditableExtension(ext)) {
        const contentValidation = validateContent(ext, content);
        if (!contentValidation.valid) {
          return NextResponse.json(
            { success: false, error: { code: 'INVALID_CONTENT', message: contentValidation.error } },
            { status: 400 }
          );
        }
      }
    }

    const createResult = await createFileOrDirectory(worktree.path, relativePath, type, content);

    if (!createResult.success) {
      const statusMap: Record<string, number> = {
        FILE_EXISTS: 409,
        PERMISSION_DENIED: 403,
        INVALID_PATH: 400,
        DISK_FULL: 507,
        INTERNAL_ERROR: 500,
      };
      const status = statusMap[createResult.error?.code || 'INTERNAL_ERROR'] || 500;
      return NextResponse.json(
        { success: false, error: createResult.error },
        { status }
      );
    }

    return NextResponse.json(
      { success: true, path: relativePath },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error('Error creating file/directory:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create file/directory' } },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/worktrees/:id/files/:path
 * Delete file or directory
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; path: string[] } }
) {
  try {
    const result = await getWorktreeAndValidatePath(params.id, params.path);
    if ('error' in result) {
      return result.error;
    }

    const { worktree, relativePath } = result;

    // Check for recursive parameter
    const { searchParams } = new URL(request.url);
    const recursive = searchParams.get('recursive') === 'true';

    const deleteResult = await deleteFileOrDirectory(worktree.path, relativePath, recursive);

    if (!deleteResult.success) {
      const statusMap: Record<string, number> = {
        FILE_NOT_FOUND: 404,
        PERMISSION_DENIED: 403,
        INVALID_PATH: 400,
        DIRECTORY_NOT_EMPTY: 400,
        PROTECTED_DIRECTORY: 403,
        DELETE_LIMIT_EXCEEDED: 400,
        INTERNAL_ERROR: 500,
      };
      const status = statusMap[deleteResult.error?.code || 'INTERNAL_ERROR'] || 500;
      return NextResponse.json(
        { success: false, error: deleteResult.error },
        { status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error deleting file/directory:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete file/directory' } },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/worktrees/:id/files/:path
 * Rename file or directory (action: rename)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; path: string[] } }
) {
  try {
    const result = await getWorktreeAndValidatePath(params.id, params.path);
    if ('error' in result) {
      return result.error;
    }

    const { worktree, relativePath } = result;

    const body = await request.json();
    const { action, newName } = body;

    if (action !== 'rename') {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_REQUEST', message: 'Unknown action. Supported: "rename"' } },
        { status: 400 }
      );
    }

    if (!newName || typeof newName !== 'string') {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_REQUEST', message: 'newName is required' } },
        { status: 400 }
      );
    }

    const renameResult = await renameFileOrDirectory(worktree.path, relativePath, newName);

    if (!renameResult.success) {
      const statusMap: Record<string, number> = {
        FILE_NOT_FOUND: 404,
        PERMISSION_DENIED: 403,
        INVALID_PATH: 400,
        INVALID_NAME: 400,
        FILE_EXISTS: 409,
        INTERNAL_ERROR: 500,
      };
      const status = statusMap[renameResult.error?.code || 'INTERNAL_ERROR'] || 500;
      return NextResponse.json(
        { success: false, error: renameResult.error },
        { status }
      );
    }

    return NextResponse.json({
      success: true,
      path: renameResult.path,
    });
  } catch (error: unknown) {
    console.error('Error renaming file/directory:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to rename file/directory' } },
      { status: 500 }
    );
  }
}
