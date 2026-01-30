/**
 * File Operations Business Logic
 * [SF-001] Facade pattern for file operations
 * [SEC-SF-003] Rename path validation
 * [SEC-SF-004] Recursive delete safety
 * [SEC-SF-002] Error response without absolute paths
 *
 * This module provides a unified interface for file operations,
 * with security checks and proper error handling.
 */

import { readFile, writeFile, mkdir, rm, rename, stat, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, extname, dirname } from 'path';
import { isPathSafe } from './path-validator';
import { isEditableExtension } from '@/config/editable-extensions';
import { DELETE_SAFETY_CONFIG, isProtectedDirectory } from '@/config/file-operations';

/**
 * File operation result
 */
export interface FileOperationResult {
  success: boolean;
  path?: string;
  content?: string;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Error codes for file operations
 */
export type FileOperationErrorCode =
  | 'FILE_NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'INVALID_PATH'
  | 'INVALID_NAME'
  | 'DIRECTORY_NOT_EMPTY'
  | 'FILE_EXISTS'
  | 'PROTECTED_DIRECTORY'
  | 'DELETE_LIMIT_EXCEEDED'
  | 'DISK_FULL'
  | 'INTERNAL_ERROR';

/**
 * Error messages for each error code
 */
const ERROR_MESSAGES: Record<FileOperationErrorCode, string> = {
  FILE_NOT_FOUND: 'File not found',
  PERMISSION_DENIED: 'Permission denied',
  INVALID_PATH: 'Invalid path',
  INVALID_NAME: 'Invalid name',
  DIRECTORY_NOT_EMPTY: 'Directory is not empty',
  FILE_EXISTS: 'File already exists',
  PROTECTED_DIRECTORY: 'Protected directory cannot be deleted',
  DELETE_LIMIT_EXCEEDED: 'Delete limit exceeded',
  DISK_FULL: 'Disk is full',
  INTERNAL_ERROR: 'Internal error',
};

/**
 * Create an error result
 * [SEC-SF-002] Does not include absolute paths
 */
function createErrorResult(code: FileOperationErrorCode, customMessage?: string): FileOperationResult {
  return {
    success: false,
    error: {
      code,
      message: customMessage || ERROR_MESSAGES[code],
    },
  };
}

/**
 * Check if a file is editable based on its extension
 *
 * @param filePath - File path to check
 * @returns True if the file is editable
 */
export function isEditableFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return isEditableExtension(ext);
}

/**
 * Validate a new file/directory name
 * [SEC-SF-003] Prevents directory traversal via rename
 *
 * @param newName - The new name to validate
 * @returns Validation result
 */
export function isValidNewName(newName: string): { valid: boolean; error?: string } {
  // Check for empty name
  if (!newName || newName.trim() === '') {
    return { valid: false, error: 'Name cannot be empty' };
  }

  // Check for directory traversal first (before path separators)
  if (newName.includes('..')) {
    return { valid: false, error: 'Name cannot contain ".."' };
  }

  // Check for directory separators
  if (newName.includes('/') || newName.includes('\\')) {
    return { valid: false, error: 'Name cannot contain path separators' };
  }

  return { valid: true };
}

/**
 * Read file content
 *
 * @param worktreeRoot - Root directory of the worktree
 * @param relativePath - Relative path to the file
 * @returns File content or error
 */
export async function readFileContent(
  worktreeRoot: string,
  relativePath: string
): Promise<FileOperationResult> {
  // Validate path
  if (!isPathSafe(relativePath, worktreeRoot)) {
    return createErrorResult('INVALID_PATH');
  }

  const fullPath = join(worktreeRoot, relativePath);

  // Check if file exists
  if (!existsSync(fullPath)) {
    return createErrorResult('FILE_NOT_FOUND');
  }

  try {
    const content = await readFile(fullPath, 'utf-8');
    return {
      success: true,
      path: relativePath,
      content,
    };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'EACCES') {
      return createErrorResult('PERMISSION_DENIED');
    }
    return createErrorResult('INTERNAL_ERROR');
  }
}

/**
 * Update file content
 *
 * @param worktreeRoot - Root directory of the worktree
 * @param relativePath - Relative path to the file
 * @param content - New content
 * @returns Success or error
 */
export async function updateFileContent(
  worktreeRoot: string,
  relativePath: string,
  content: string
): Promise<FileOperationResult> {
  // Validate path
  if (!isPathSafe(relativePath, worktreeRoot)) {
    return createErrorResult('INVALID_PATH');
  }

  const fullPath = join(worktreeRoot, relativePath);

  // Check if file exists
  if (!existsSync(fullPath)) {
    return createErrorResult('FILE_NOT_FOUND');
  }

  try {
    await writeFile(fullPath, content, 'utf-8');
    return {
      success: true,
      path: relativePath,
    };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'EACCES') {
      return createErrorResult('PERMISSION_DENIED');
    }
    if (nodeError.code === 'ENOSPC') {
      return createErrorResult('DISK_FULL');
    }
    return createErrorResult('INTERNAL_ERROR');
  }
}

/**
 * Create a new file or directory
 *
 * @param worktreeRoot - Root directory of the worktree
 * @param relativePath - Relative path for the new file/directory
 * @param type - Type to create ('file' or 'directory')
 * @param content - Initial content (for files only)
 * @returns Success or error
 */
export async function createFileOrDirectory(
  worktreeRoot: string,
  relativePath: string,
  type: 'file' | 'directory',
  content?: string
): Promise<FileOperationResult> {
  // Validate path
  if (!isPathSafe(relativePath, worktreeRoot)) {
    return createErrorResult('INVALID_PATH');
  }

  const fullPath = join(worktreeRoot, relativePath);

  // Check if already exists
  if (existsSync(fullPath)) {
    return createErrorResult('FILE_EXISTS');
  }

  try {
    if (type === 'directory') {
      await mkdir(fullPath, { recursive: true });
    } else {
      // Ensure parent directory exists
      const parentDir = dirname(fullPath);
      if (!existsSync(parentDir)) {
        await mkdir(parentDir, { recursive: true });
      }
      await writeFile(fullPath, content || '', 'utf-8');
    }

    return {
      success: true,
      path: relativePath,
    };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'EACCES') {
      return createErrorResult('PERMISSION_DENIED');
    }
    if (nodeError.code === 'ENOSPC') {
      return createErrorResult('DISK_FULL');
    }
    return createErrorResult('INTERNAL_ERROR');
  }
}

/**
 * Count files in a directory recursively
 */
async function countFilesRecursive(dirPath: string, depth: number = 0): Promise<number> {
  if (depth > DELETE_SAFETY_CONFIG.MAX_RECURSIVE_DELETE_DEPTH) {
    return DELETE_SAFETY_CONFIG.MAX_RECURSIVE_DELETE_FILES + 1; // Exceed limit to trigger error
  }

  let count = 0;
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      count++;
      if (count > DELETE_SAFETY_CONFIG.MAX_RECURSIVE_DELETE_FILES) {
        return count;
      }
      if (entry.isDirectory()) {
        count += await countFilesRecursive(join(dirPath, entry.name), depth + 1);
        if (count > DELETE_SAFETY_CONFIG.MAX_RECURSIVE_DELETE_FILES) {
          return count;
        }
      }
    }
  } catch {
    // Ignore errors counting files
  }
  return count;
}

/**
 * Delete a file or directory
 * [SEC-SF-004] Protected directory check and delete limit
 *
 * @param worktreeRoot - Root directory of the worktree
 * @param relativePath - Relative path to delete
 * @param recursive - Whether to delete recursively
 * @returns Success or error
 */
export async function deleteFileOrDirectory(
  worktreeRoot: string,
  relativePath: string,
  recursive?: boolean
): Promise<FileOperationResult> {
  // Validate path
  if (!isPathSafe(relativePath, worktreeRoot)) {
    return createErrorResult('INVALID_PATH');
  }

  // Check for protected directories
  if (isProtectedDirectory(relativePath)) {
    return createErrorResult('PROTECTED_DIRECTORY');
  }

  const fullPath = join(worktreeRoot, relativePath);

  // Check if exists
  if (!existsSync(fullPath)) {
    return createErrorResult('FILE_NOT_FOUND');
  }

  try {
    const fileStat = await stat(fullPath);

    if (fileStat.isDirectory()) {
      // Check if directory is empty
      const entries = await readdir(fullPath);
      if (entries.length > 0 && !recursive) {
        return createErrorResult('DIRECTORY_NOT_EMPTY');
      }

      // Check delete limit for recursive delete
      if (recursive) {
        const fileCount = await countFilesRecursive(fullPath);
        if (fileCount > DELETE_SAFETY_CONFIG.MAX_RECURSIVE_DELETE_FILES) {
          return createErrorResult(
            'DELETE_LIMIT_EXCEEDED',
            `Delete limit exceeded: ${fileCount} files (max: ${DELETE_SAFETY_CONFIG.MAX_RECURSIVE_DELETE_FILES})`
          );
        }
      }
    }

    // For empty directories, we can use rmdir behavior
    // For non-empty directories with recursive flag, use rm with recursive: true
    if (fileStat.isDirectory() && !recursive) {
      // Use rmdir for empty directories (will fail if not empty)
      const { rmdir } = await import('fs/promises');
      await rmdir(fullPath);
    } else {
      await rm(fullPath, { recursive: recursive || false, force: false });
    }

    return {
      success: true,
      path: relativePath,
    };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'EACCES') {
      return createErrorResult('PERMISSION_DENIED');
    }
    if (nodeError.code === 'ENOTEMPTY') {
      return createErrorResult('DIRECTORY_NOT_EMPTY');
    }
    return createErrorResult('INTERNAL_ERROR');
  }
}

/**
 * Rename a file or directory
 * [SEC-SF-003] New name validation
 *
 * @param worktreeRoot - Root directory of the worktree
 * @param relativePath - Relative path of the file/directory to rename
 * @param newName - New name (not path)
 * @returns Success or error
 */
export async function renameFileOrDirectory(
  worktreeRoot: string,
  relativePath: string,
  newName: string
): Promise<FileOperationResult> {
  // Validate source path
  if (!isPathSafe(relativePath, worktreeRoot)) {
    return createErrorResult('INVALID_PATH');
  }

  // Validate new name
  const nameValidation = isValidNewName(newName);
  if (!nameValidation.valid) {
    return createErrorResult('INVALID_NAME', nameValidation.error);
  }

  const fullPath = join(worktreeRoot, relativePath);

  // Check if source exists
  if (!existsSync(fullPath)) {
    return createErrorResult('FILE_NOT_FOUND');
  }

  // Calculate new path
  const parentDir = dirname(relativePath);
  const newRelativePath = parentDir === '.' ? newName : join(parentDir, newName);
  const newFullPath = join(worktreeRoot, newRelativePath);

  // Validate new path is still within worktree
  if (!isPathSafe(newRelativePath, worktreeRoot)) {
    return createErrorResult('INVALID_PATH');
  }

  // Check if target already exists
  if (existsSync(newFullPath)) {
    return createErrorResult('FILE_EXISTS');
  }

  try {
    await rename(fullPath, newFullPath);

    return {
      success: true,
      path: newRelativePath,
    };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'EACCES') {
      return createErrorResult('PERMISSION_DENIED');
    }
    return createErrorResult('INTERNAL_ERROR');
  }
}
