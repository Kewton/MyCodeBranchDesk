/**
 * File Operations Configuration
 * [SEC-SF-004] Recursive delete safety settings
 *
 * This module defines safety constraints for file operations,
 * particularly for recursive directory deletion.
 */

/**
 * Safety configuration for delete operations
 */
export const DELETE_SAFETY_CONFIG = {
  /**
   * Maximum number of files that can be deleted in a single recursive delete operation.
   * Prevents accidental mass deletion.
   */
  MAX_RECURSIVE_DELETE_FILES: 100,

  /**
   * Maximum directory depth for recursive delete operations.
   * Prevents infinite recursion and excessive resource usage.
   */
  MAX_RECURSIVE_DELETE_DEPTH: 10,

  /**
   * Directories that are protected from deletion.
   * These directories contain critical project files that should never be deleted.
   */
  PROTECTED_DIRECTORIES: ['.git', '.github', 'node_modules'] as const,
} as const;

/**
 * Check if a directory path is protected from deletion
 * [SEC-SF-004] Protection against accidental deletion of critical directories
 *
 * @param relativePath - Relative path to check
 * @returns True if the directory is protected
 *
 * @example
 * ```typescript
 * isProtectedDirectory('.git'); // true
 * isProtectedDirectory('.git/objects'); // true
 * isProtectedDirectory('src'); // false
 * ```
 */
export function isProtectedDirectory(relativePath: string): boolean {
  if (!relativePath) return false;

  // Normalize path by removing trailing slash
  const normalizedPath = relativePath.endsWith('/')
    ? relativePath.slice(0, -1)
    : relativePath;

  for (const protectedDir of DELETE_SAFETY_CONFIG.PROTECTED_DIRECTORIES) {
    // Exact match
    if (normalizedPath === protectedDir) {
      return true;
    }

    // Path starts with protected directory
    if (normalizedPath.startsWith(`${protectedDir}/`)) {
      return true;
    }
  }

  return false;
}
